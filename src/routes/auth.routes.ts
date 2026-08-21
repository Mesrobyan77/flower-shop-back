import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { requireAuth } from '../middlewares/auth';
import { guestSession } from '../middlewares/guestSession';
import { authLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/auth.validator';

const router = Router();

router.post('/register', guestSession, authLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', guestSession, authLimiter, validate({ body: loginSchema }), controller.login);
router.post('/refresh', validate({ body: refreshSchema }), controller.refresh);
router.post('/logout', controller.logout);

router.get('/me', requireAuth, controller.me);
router.patch('/me', requireAuth, validate({ body: updateProfileSchema }), controller.updateProfile);
router.post('/change-password', requireAuth, authLimiter, validate({ body: changePasswordSchema }), controller.changePassword);

export default router;
