import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { writeLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { paymentStartSchema, paymentStatusQuery } from '../validators/payment.validator';

const router = Router();

/* Which payment methods this deployment can actually serve (credential-driven). */
router.get('/payments/methods', paymentController.methods);

/* Online payment initiation and authoritative status for the return page. */
router.post('/payments/start', writeLimiter, validate({ body: paymentStartSchema }), paymentController.start);
router.get('/payments/status', validate({ query: paymentStatusQuery }), paymentController.status);

/*
 * Idram server-to-server RESULT_URL. Deliberately not rate-limited: Idram's own
 * infrastructure calls it and is never the abuser; a throttled precheck would
 * block a paying customer.
 */
router.post('/payments/idram/result', paymentController.idramResult);

export default router;
