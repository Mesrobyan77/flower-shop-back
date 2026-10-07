import { Router } from 'express';
import accountRoutes from './account.routes';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import catalogRoutes from './catalog.routes';
import commerceRoutes from './commerce.routes';
import contentRoutes from './content.routes';
import paymentRoutes from './payments.routes';
import { MEMBER_GRADES, REGIONS, SIGNUP_BONUS_POINTS, TIME_SLOTS } from '../constants';
import { env } from '../config/env';
import { ok } from '../utils/apiResponse';

const router = Router();

router.get('/health', (_req, res) => ok(res, { status: 'ok', uptime: process.uptime() }));

/** Static domain reference data the storefront needs on first paint. */
router.get('/config', (_req, res) =>
  ok(res, {
    currency: { code: env.CURRENCY, symbol: env.CURRENCY_SYMBOL, position: 'after' },
    delivery: {
      parcelFee: env.PARCEL_FEE,
      freeParcelThreshold: env.FREE_PARCEL_THRESHOLD,
      quickFee: env.QUICK_FEE,
      ruralSurcharge: env.RURAL_SURCHARGE,
    },
    regions: REGIONS,
    grades: MEMBER_GRADES,
    signupBonusPoints: SIGNUP_BONUS_POINTS,
    timeSlots: TIME_SLOTS,
  }),
);

router.use('/auth', authRoutes);
router.use('/', catalogRoutes);
router.use('/', commerceRoutes);
router.use('/', paymentRoutes);
router.use('/account', accountRoutes);
router.use('/', contentRoutes);
router.use('/admin', adminRoutes);

export default router;
