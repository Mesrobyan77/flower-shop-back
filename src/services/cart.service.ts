import { Types } from 'mongoose';
import { Cart, type CartDocument, type SelectedOption } from '../models/Cart';
import { Product, type ProductDocument } from '../models/Product';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { calculateTotals } from './pricing.service';
import { validateDeliverySelection } from './delivery.service';
import { pickLocale } from '../models/common';
import { fromDateKey } from '../utils/dateKey';
import { DEFAULT_LOCALE, type DeliveryMethod, type Locale } from '../constants';

export interface CartOwner {
  userId?: string;
  sessionId?: string;
}

export interface AddItemInput {
  productId: string;
  quantity: number;
  options?: { groupKey: string; optionKey?: string; value?: string }[];
  deliveryMethod: DeliveryMethod;
  deliveryDate?: string;
  timeSlot?: string;
  ribbonText?: string;
  senderName?: string;
  cardMessage?: string;
}

function ownerFilter(owner: CartOwner) {
  if (owner.userId) return { user: owner.userId };
  if (owner.sessionId) return { sessionId: owner.sessionId };
  throw ApiError.badRequest('Cart owner could not be determined');
}

/**
 * Narrow duplicate-key detector for the ownership race (checkpoint E6.1).
 *
 * `Cart.create` inside `getOrCreateCart` can only trip a unique constraint on
 * one of the two ownership indexes (`user_1` / `sessionId_1`) - never on the
 * item subdocuments. Anything that is not a MongoDB duplicate-key error
 * (server error code 11000) is never treated as this race and falls through
 * to the caller unchanged.
 */
function isDuplicateKeyError(error: unknown): error is { code: number; keyPattern?: Record<string, unknown> } {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;
}

/**
 * Get the owner's cart, creating it on first touch.
 *
 * Creation is safe under concurrent first touch: two requests can both miss
 * the `findOne`, but the ownership unique index lets exactly one `create`
 * through (checkpoint E6.1). The loser adopts the winner's cart via a narrow
 * E11000 recovery (see catch block) instead of inserting a second cart - so a
 * basket can never be split across duplicate carts for one owner.
 */
export async function getOrCreateCart(owner: CartOwner): Promise<CartDocument> {
  const filter = ownerFilter(owner);
  const existing = await Cart.findOne(filter);
  if (existing) return existing;

  try {
    return await Cart.create({ ...filter, items: [] });
  } catch (error) {
    // Concurrent first touch: another request for the SAME owner created the
    // cart between the findOne above and this insert, and the ownership unique
    // index rejected ours with E11000. The recovery is deliberately narrow:
    //   1. it must be a duplicate-key error (code 11000), and
    //   2. when the server reports the failing key, it must name this owner's
    //      ownership field (`user` vs `sessionId`), and
    //   3. a deterministic re-read of the exact owner filter must find the
    //      winner's cart - otherwise the original error is rethrown.
    // Every unrelated error (validation, connection, E11000 on another key)
    // propagates untouched; a second cart is never created here.
    if (isDuplicateKeyError(error)) {
      const ownershipField = 'user' in filter ? 'user' : 'sessionId';
      if (!error.keyPattern || ownershipField in error.keyPattern) {
        const winner = await Cart.findOne(filter);
        if (winner) return winner;
      }
    }
    throw error;
  }
}

/** Option groups the API fills from the dedicated delivery fields, never required from the caller. */
const DELIVERY_GROUPS = new Set(['delivery_method', 'delivery_date', 'delivery_time']);

/**
 * Resolves the raw option payload against the product definition so prices come
 * from the catalogue, never from the client.
 */
function resolveOptions(
  product: ProductDocument,
  input: AddItemInput,
  locale: Locale,
): SelectedOption[] {
  const selected: SelectedOption[] = [];

  /**
   * Delivery method, date and time are first-class fields on the request as well
   * as option groups on the product (the reference showed them inside the same
   * purchase sheet). Fill those groups from the dedicated fields so a caller
   * never has to send the same value twice. Date and time are collected on
   * checkout, so a line may legitimately arrive without them.
   */
  const raw = [...(input.options ?? [])];
  const ensure = (key: string, value: { optionKey?: string; value?: string }) => {
    if (!raw.some((o) => o.groupKey === key)) raw.push({ groupKey: key, ...value });
  };

  ensure('delivery_method', { optionKey: input.deliveryMethod });
  if (input.deliveryDate) ensure('delivery_date', { value: input.deliveryDate });
  if (input.timeSlot) ensure('delivery_time', { value: input.timeSlot });

  for (const group of product.optionGroups) {
    const supplied = raw.find((o) => o.groupKey === group.key);

    if (!supplied || (!supplied.optionKey && !supplied.value)) {
      if (group.required && !DELIVERY_GROUPS.has(group.key)) {
        throw ApiError.badRequest(`"${pickLocale(group.label, locale)}" is required`);
      }
      continue;
    }

    if (group.type === 'select') {
      const option = group.options.find((o) => o.key === supplied.optionKey);
      if (!option) throw ApiError.badRequest(`Invalid choice for "${pickLocale(group.label, locale)}"`);
      if (!option.isAvailable) throw ApiError.badRequest(`"${pickLocale(option.label, locale)}" is unavailable`);

      selected.push({
        groupKey: group.key,
        groupLabel: pickLocale(group.label, locale),
        optionKey: option.key,
        value: pickLocale(option.label, locale),
        priceDelta: option.priceDelta,
      });
      continue;
    }

    const value = (supplied.value ?? '').trim();
    if (group.maxLength && value.length > group.maxLength) {
      throw ApiError.badRequest(`"${pickLocale(group.label, locale)}" is too long`);
    }

    selected.push({ groupKey: group.key, groupLabel: pickLocale(group.label, locale), value, priceDelta: 0 });
  }

  return selected;
}

export async function addItem(owner: CartOwner, input: AddItemInput, locale: Locale = DEFAULT_LOCALE) {
  const product = await Product.findById(input.productId);
  if (!product || !product.isActive) throw ApiError.notFound('Product not found');
  if (product.trackStock && product.stock < input.quantity) throw ApiError.badRequest('Not enough stock available');
  if (input.quantity < product.minOrderQty) throw ApiError.badRequest(`Minimum quantity is ${product.minOrderQty}`);
  if (input.quantity > product.maxOrderQty) throw ApiError.badRequest(`Maximum quantity is ${product.maxOrderQty}`);
  if (!product.deliveryMethods.includes(input.deliveryMethod)) {
    throw ApiError.badRequest('This delivery method is not available for the product');
  }

  const options = resolveOptions(product, input, locale);
  const cart = await getOrCreateCart(owner);

  cart.items.push({
    _id: new Types.ObjectId(),
    product: product._id,
    quantity: input.quantity,
    unitPrice: product.price,
    options,
    deliveryMethod: input.deliveryMethod,
    deliveryDate: input.deliveryDate ? fromDateKey(input.deliveryDate) : undefined,
    timeSlot: input.timeSlot,
    ribbonText: input.ribbonText,
    senderName: input.senderName,
    cardMessage: input.cardMessage,
    addedAt: new Date(),
  });

  await cart.save();
  return cart;
}

export interface UpdateItemPatch {
  quantity?: number;
  deliveryDate?: string;
  timeSlot?: string;
  ribbonText?: string;
  senderName?: string;
  cardMessage?: string;
}

export async function updateItem(owner: CartOwner, itemId: string, patch: UpdateItemPatch) {
  const cart = await getOrCreateCart(owner);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Cart item not found');

  if (patch.quantity !== undefined) {
    if (patch.quantity < 1) throw ApiError.badRequest('Quantity must be at least 1');
    item.quantity = patch.quantity;
  }
  if (patch.deliveryDate !== undefined) item.deliveryDate = fromDateKey(patch.deliveryDate);
  if (patch.timeSlot !== undefined) item.timeSlot = patch.timeSlot;
  if (patch.ribbonText !== undefined) item.ribbonText = patch.ribbonText;
  if (patch.senderName !== undefined) item.senderName = patch.senderName;
  if (patch.cardMessage !== undefined) item.cardMessage = patch.cardMessage;

  await cart.save();
  return cart;
}

export async function removeItem(owner: CartOwner, itemId: string) {
  const cart = await getOrCreateCart(owner);
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Cart item not found');
  item.deleteOne();
  await cart.save();
  return cart;
}

export async function clearCart(owner: CartOwner) {
  const cart = await getOrCreateCart(owner);
  cart.items.splice(0, cart.items.length);
  await cart.save();
  return cart;
}

/** Hydrated cart with recalculated prices - the single source of truth for the UI. */
export async function getCartView(owner: CartOwner, locale: Locale = DEFAULT_LOCALE) {
  const cart = await getOrCreateCart(owner);
  await cart.populate({
    path: 'items.product',
    select: 'slug name thumbnail images price isActive stock trackStock deliveryMethods',
  });

  const gradeKey = owner.userId ? (await User.findById(owner.userId))?.grade : undefined;

  const items = cart.items.map((item) => {
    const product = item.product as unknown as ProductDocument | null;
    const optionDelta = item.options.reduce((acc, o) => acc + (o.priceDelta ?? 0), 0);

    return {
      id: String(item._id),
      product: product
        ? {
            id: String(product._id),
            slug: product.slug,
            name: pickLocale(product.name, locale),
            thumbnail: product.thumbnail ?? product.images?.[0]?.url,
            isActive: product.isActive,
            inStock: !product.trackStock || product.stock > 0,
          }
        : null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      options: item.options,
      optionsTotal: optionDelta * item.quantity,
      lineTotal: (item.unitPrice + optionDelta) * item.quantity,
      deliveryMethod: item.deliveryMethod,
      deliveryDate: item.deliveryDate,
      timeSlot: item.timeSlot,
      ribbonText: item.ribbonText,
      senderName: item.senderName,
      cardMessage: item.cardMessage,
    };
  });

  const totals = calculateTotals({
    items: cart.items.map((i) => ({ unitPrice: i.unitPrice, quantity: i.quantity, options: i.options })),
    gradeKey,
  });

  return { id: String(cart._id), items, totals, itemCount: items.length };
}

/** Called at checkout: every line must still be deliverable. */
export function assertItemsDeliverable(cart: CartDocument, regionKey: string, method: DeliveryMethod) {
  for (const item of cart.items) {
    validateDeliverySelection({ method, regionKey, requestedDate: item.deliveryDate, timeSlot: item.timeSlot });
  }
}
