import type { Request, Response } from 'express';
import * as cartService from '../services/cart.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import { DEFAULT_LOCALE, type Locale } from '../constants';
import type { AuthedRequest } from '../types';

function owner(req: AuthedRequest): cartService.CartOwner {
  return req.user
    ? { userId: req.user.sub }
    : { sessionId: (req as Request & { sessionId?: string }).sessionId };
}

function locale(req: Request): Locale {
  const value = (req.query.locale as string) || (req.headers['x-locale'] as string);
  return (['hy', 'en', 'ru'].includes(value) ? value : DEFAULT_LOCALE) as Locale;
}

export const view = asyncHandler(async (req: AuthedRequest, res: Response) => {
  return ok(res, await cartService.getCartView(owner(req), locale(req)));
});

export const add = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await cartService.addItem(owner(req), req.body, locale(req));
  return ok(res, await cartService.getCartView(owner(req), locale(req)), undefined, 201);
});

export const update = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await cartService.updateItem(owner(req), req.params.itemId, req.body);
  return ok(res, await cartService.getCartView(owner(req), locale(req)));
});

export const remove = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await cartService.removeItem(owner(req), req.params.itemId);
  return ok(res, await cartService.getCartView(owner(req), locale(req)));
});

export const clear = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await cartService.clearCart(owner(req));
  return ok(res, await cartService.getCartView(owner(req), locale(req)));
});
