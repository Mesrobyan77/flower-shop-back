import type { Request, Response } from 'express';
import * as paymentService from '../services/payment.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ok } from '../utils/apiResponse';
import type { Locale } from '../constants';

export const methods = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, paymentService.paymentMethodAvailability());
});

export const start = asyncHandler(async (req: Request, res: Response) => {
  const { token, locale } = req.body as { token: string; locale?: Locale };
  return ok(res, await paymentService.startPayment(token, locale));
});

export const status = asyncHandler(async (req: Request, res: Response) => {
  const { token, locale } = req.query as unknown as { token: string; locale?: Locale };
  return ok(res, await paymentService.getPaymentStatus(token, locale));
});

/**
 * Idram RESULT_URL. This endpoint speaks Idram's protocol, not ours: the body
 * is form-encoded EDP_* fields and the only valid answers are the literal
 * "OK" or "ERROR" as plain text. Idram blocks the charge when the precheck
 * answer is missing or anything else, so an internal failure must still answer
 * ERROR rather than a JSON 500.
 */
export const idramResult = asyncHandler(async (req: Request, res: Response) => {
  let answer: 'OK' | 'ERROR' = 'ERROR';
  try {
    answer = await paymentService.handleIdramResult(req.body as Record<string, unknown>);
  } catch {
    answer = 'ERROR';
  }
  return res.status(200).type('text/plain').send(answer);
});
