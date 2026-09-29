import { Cart } from '../models/Cart';
import { Order, type OrderDocument, type OrderItemSubdoc } from '../models/Order';
import { Product, type ProductDocument } from '../models/Product';
import { User } from '../models/User';
import { pickLocale } from '../models/common';
import {
  CANCELLABLE_STATUSES,
  DEFAULT_LOCALE,
  MEMBER_GRADES,
  ORDER_STATUS_FLOW,
  type DeliveryMethod,
  type Locale,
  type OrderStatus,
} from '../constants';
import { ApiError } from '../utils/ApiError';
import { generateOrderCode } from '../utils/codes';
import { fromDateKey } from '../utils/dateKey';
import { runInTransaction } from '../utils/transaction';
import { calculateTotals } from './pricing.service';
import { quoteDelivery, validateDeliverySelection } from './delivery.service';

export interface CheckoutInput {
  customer: { name: string; email: string; phone: string };
  delivery: {
    method: DeliveryMethod;
    recipient: string;
    phone: string;
    region: string;
    city: string;
    street: string;
    building?: string;
    apartment?: string;
    postalCode?: string;
    notes?: string;
    requestedDate?: string;
    timeSlot?: string;
  };
  customerNote?: string;
  pointsUsed?: number;
  agreeTerms: boolean;
}

export interface CheckoutContext {
  userId?: string;
  sessionId?: string;
  locale?: Locale;
}

/**
 * Creates the order from the server-side cart. Prices, discounts and delivery
 * fees are all recomputed here; nothing monetary is trusted from the client.
 * Payment is always cash on delivery, so no gateway call happens.
 */
export async function checkout(input: CheckoutInput, ctx: CheckoutContext): Promise<OrderDocument> {
  if (!input.agreeTerms) throw ApiError.badRequest('You must accept the terms to place an order');

  const locale = ctx.locale ?? DEFAULT_LOCALE;
  const cartFilter = ctx.userId ? { user: ctx.userId } : { sessionId: ctx.sessionId };
  const cart = await Cart.findOne(cartFilter).populate('items.product');

  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your cart is empty');

  validateDeliverySelection({
    method: input.delivery.method,
    regionKey: input.delivery.region,
    requestedDate: input.delivery.requestedDate,
    timeSlot: input.delivery.timeSlot,
  });

  const user = ctx.userId ? await User.findById(ctx.userId) : null;
  const items: OrderItemSubdoc[] = [];
  /**
   * Stock is claimed per product, never per line: the same product can sit on
   * several lines of one basket (different options, ribbon text or delivery slot)
   * and only the sum of those lines has to be available.
   */
  const stockClaims = new Map<string, { quantity: number; trackStock: boolean; stock: number; name: string }>();

  for (const line of cart.items) {
    const product = line.product as unknown as ProductDocument | null;
    if (!product || !product.isActive) throw ApiError.badRequest('One of the products is no longer available');

    const claim = stockClaims.get(String(product._id));
    if (claim) {
      claim.quantity += line.quantity;
    } else {
      stockClaims.set(String(product._id), {
        quantity: line.quantity,
        trackStock: product.trackStock,
        stock: product.stock,
        name: pickLocale(product.name, locale),
      });
    }

    const optionDelta = line.options.reduce((acc, o) => acc + (o.priceDelta ?? 0), 0);

    items.push({
      product: product._id,
      name: pickLocale(product.name, locale),
      sku: product.sku,
      thumbnail: product.thumbnail ?? product.images?.[0]?.url,
      unitPrice: product.price,
      quantity: line.quantity,
      options: line.options,
      optionsTotal: optionDelta * line.quantity,
      lineTotal: (product.price + optionDelta) * line.quantity,
      ribbonText: line.ribbonText,
      senderName: line.senderName,
      cardMessage: line.cardMessage,
    });
  }

  /**
   * Friendly pre-check against the snapshot the cart was populated with. It is
   * advisory only - the authoritative guard is the conditional claim inside the
   * transaction below, because this snapshot can be stale by the time we get there.
   */
  for (const claim of stockClaims.values()) {
    if (claim.trackStock && claim.stock < claim.quantity) {
      throw ApiError.badRequest(`"${claim.name}" does not have enough stock`);
    }
  }

  const merchandiseTotal = items.reduce((acc, i) => acc + i.lineTotal, 0);
  const deliveryQuote = quoteDelivery(input.delivery.method, input.delivery.region, merchandiseTotal);

  const requestedPoints = Math.min(input.pointsUsed ?? 0, user?.points ?? 0);
  const totals = calculateTotals({
    items: items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, options: i.options })),
    gradeKey: user?.grade,
    deliveryFee: deliveryQuote.fee,
    deliverySurcharge: deliveryQuote.surcharge,
    pointsUsed: requestedPoints,
  });

  const order = await runInTransaction(async (session) => {
    const opts = { session };

    const [doc] = await Order.create(
      [
        {
          code: generateOrderCode(),
          user: user?._id,
          isGuest: !user,
          customer: input.customer,
          items,
          delivery: {
            ...input.delivery,
            requestedDate: input.delivery.requestedDate ? fromDateKey(input.delivery.requestedDate) : undefined,
            fee: deliveryQuote.fee,
            surcharge: deliveryQuote.surcharge,
          },
          subtotal: totals.subtotal,
          optionsTotal: totals.optionsTotal,
          deliveryFee: deliveryQuote.total,
          gradeDiscount: totals.gradeDiscount,
          pointsUsed: totals.pointsUsed,
          total: totals.total,
          pointsEarned: totals.pointsEarned,
          paymentMethod: 'cash_on_delivery',
          paymentStatus: 'pending',
          status: 'pending',
          statusHistory: [{ status: 'pending', changedAt: new Date(), note: 'Order placed' }],
          customerNote: input.customerNote,
        },
      ],
      opts,
    );

    /**
     * Conditional claim: the availability check and the decrement are one atomic
     * step, so two checkouts racing for the last unit can never both win. A
     * product that is not stock-tracked only moves its sales counter.
     */
    for (const [productId, claim] of stockClaims) {
      const claimed = await Product.updateOne(
        { _id: productId, trackStock: true, stock: { $gte: claim.quantity } },
        { $inc: { stock: -claim.quantity, soldCount: claim.quantity } },
        opts,
      );
      if (claimed.matchedCount === 1) continue;

      const untracked = await Product.updateOne(
        { _id: productId, trackStock: { $ne: true } },
        { $inc: { soldCount: claim.quantity } },
        opts,
      );
      if (untracked.matchedCount !== 1) {
        throw ApiError.conflict(`"${claim.name}" does not have enough stock`);
      }
    }

    if (user && totals.pointsUsed > 0) {
      /**
       * Conditional claim: the balance check and the deduction are one atomic step,
       * so two orders can never spend the same bonus twice and the balance can never
       * be driven negative.
       */
      const spent = await User.updateOne(
        { _id: user._id, points: { $gte: totals.pointsUsed } },
        { $inc: { points: -totals.pointsUsed } },
        opts,
      );
      if (spent.matchedCount !== 1) {
        throw ApiError.conflict('Your bonus balance changed while the order was being placed - please try again');
      }
    }

    await Cart.updateOne({ _id: cart._id }, { $set: { items: [] } }, opts);
    return doc;
  });

  return order;
}

/**
 * The completion reward as one aggregation-pipeline update: the increments and the
 * grade derived from the freshly incremented lifetime spend are applied together,
 * so two orders completing at the same time cannot lose an increment and the grade
 * can never be computed from a stale total (needs MongoDB 4.2+).
 */
function completionReward(pointsEarned: number, total: number) {
  const branches = [...MEMBER_GRADES]
    .sort((a, b) => b.minSpend - a.minSpend)
    .filter((grade) => grade.minSpend > 0)
    .map((grade) => ({ case: { $gte: ['$totalSpend', grade.minSpend] }, then: grade.key }));

  return [
    {
      $set: {
        points: { $add: [{ $ifNull: ['$points', 0] }, pointsEarned] },
        totalSpend: { $add: [{ $ifNull: ['$totalSpend', 0] }, total] },
      },
    },
    { $set: { grade: { $switch: { branches, default: MEMBER_GRADES[0].key } } } },
  ];
}

/**
 * Admin status moves follow the reference workflow and cannot skip backwards.
 *
 * The move is claimed with a compare-and-set on the status the caller saw, so of
 * any concurrent or repeated attempts exactly one runs the side effects below:
 * completion cannot credit the reward twice and cancellation cannot refund twice.
 * The whole move runs in a transaction - order, stock and bonus balance either all
 * move together or none of them does.
 */
export async function changeStatus(
  orderId: string,
  next: OrderStatus,
  actorId?: string,
  note?: string,
): Promise<OrderDocument> {
  return runInTransaction(async (session) => {
    const opts = { session };

    const order = await Order.findById(orderId, null, opts);
    if (!order) throw ApiError.notFound('Order not found');

    const previous = order.status;
    if (!ORDER_STATUS_FLOW[previous].includes(next)) {
      throw ApiError.badRequest(`Cannot move an order from "${previous}" to "${next}"`);
    }

    const patch: Record<string, unknown> = { status: next };
    if (next === 'delivered') {
      patch['delivery.deliveredAt'] = new Date();
      // Cash on delivery: money changes hands exactly at delivery.
      patch.paymentStatus = 'paid';
      patch.paidAt = new Date();
    }
    if (next === 'completed') patch.completedAt = new Date();
    if (next === 'cancelled') {
      patch.paymentStatus = 'pending';
      patch.cancelReason = note;
    }

    const claimed = await Order.findOneAndUpdate(
      { _id: orderId, status: previous },
      {
        $set: patch,
        $push: { statusHistory: { status: next, note, changedBy: actorId as never, changedAt: new Date() } },
      },
      { new: true, session },
    );

    if (!claimed) {
      throw ApiError.conflict('This order changed while the request was being handled - reload it and try again');
    }

    if (next === 'completed' && claimed.user) {
      await User.updateOne({ _id: claimed.user }, completionReward(claimed.pointsEarned, claimed.total), opts);
    }

    if (next === 'cancelled') {
      for (const item of claimed.items) {
        await Product.updateOne({ _id: item.product }, { $inc: { soldCount: -item.quantity } }, opts);
        await Product.updateOne({ _id: item.product, trackStock: true }, { $inc: { stock: item.quantity } }, opts);
      }

      // Only the winner of the status claim gets here, so the refund lands once.
      if (claimed.user && claimed.pointsUsed > 0) {
        await User.updateOne({ _id: claimed.user }, { $inc: { points: claimed.pointsUsed } }, opts);
      }
    }

    return claimed;
  });
}

export async function setPaymentStatus(orderId: string, status: 'pending' | 'paid' | 'refunded') {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  order.paymentStatus = status;
  order.paidAt = status === 'paid' ? new Date() : undefined;
  await order.save();
  return order;
}

/** Customer-side cancel, allowed only before the courier picks the order up. */
export async function cancelOwnOrder(orderId: string, userId: string, reason?: string) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw ApiError.notFound('Order not found');
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw ApiError.badRequest('This order can no longer be cancelled - please contact support');
  }
  return changeStatus(orderId, 'cancelled', userId, reason ?? 'Cancelled by customer');
}

/** Guest order lookup, exactly like the reference non-member tab. */
export async function findGuestOrder(code: string, email: string) {
  const order = await Order.findOne({ code, 'customer.email': email.toLowerCase() });
  if (!order) throw ApiError.notFound('No order matches that number and email');
  return order;
}
