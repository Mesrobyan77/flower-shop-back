import { Cart } from '../models/Cart';
import { Order, type OrderDocument, type OrderItemSubdoc } from '../models/Order';
import { Product, type ProductDocument } from '../models/Product';
import { User } from '../models/User';
import { pickLocale } from '../models/common';
import {
  CANCELLABLE_STATUSES,
  DEFAULT_LOCALE,
  ORDER_STATUS_FLOW,
  gradeForSpend,
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
      await User.updateOne({ _id: user._id }, { $inc: { points: -totals.pointsUsed } }, opts);
    }

    await Cart.updateOne({ _id: cart._id }, { $set: { items: [] } }, opts);
    return doc;
  });

  return order;
}

/** Admin status moves follow the reference workflow and cannot skip backwards. */
export async function changeStatus(
  orderId: string,
  next: OrderStatus,
  actorId?: string,
  note?: string,
): Promise<OrderDocument> {
  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');

  const allowed = ORDER_STATUS_FLOW[order.status];
  if (!allowed.includes(next)) {
    throw ApiError.badRequest(`Cannot move an order from "${order.status}" to "${next}"`);
  }

  order.status = next;
  order.statusHistory.push({ status: next, note, changedBy: actorId as never, changedAt: new Date() });

  if (next === 'delivered') {
    order.delivery.deliveredAt = new Date();
    // Cash on delivery: money changes hands exactly at delivery.
    order.paymentStatus = 'paid';
    order.paidAt = new Date();
  }

  if (next === 'completed') {
    order.completedAt = new Date();
    if (order.user) {
      const user = await User.findById(order.user);
      if (user) {
        user.points += order.pointsEarned;
        user.totalSpend += order.total;
        user.grade = gradeForSpend(user.totalSpend).key;
        await user.save();
      }
    }
  }

  if (next === 'cancelled') {
    order.paymentStatus = 'pending';
    order.cancelReason = note;
    for (const item of order.items) {
      await Product.updateOne({ _id: item.product }, { $inc: { soldCount: -item.quantity } });
      await Product.updateOne({ _id: item.product, trackStock: true }, { $inc: { stock: item.quantity } });
    }
    if (order.user && order.pointsUsed > 0) {
      await User.updateOne({ _id: order.user }, { $inc: { points: order.pointsUsed } });
    }
  }

  await order.save();
  return order;
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
