import { Router } from 'express';
import * as accountController from '../controllers/account.controller';
import * as subscriptionController from '../controllers/subscription.controller';
import { requireAuth } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { addressSchema } from '../validators/order.validator';
import { subscribeSchema } from '../validators/content.validator';
import { idParam } from '../validators/common.validator';

const router = Router();

router.use(requireAuth);

router.get('/summary', accountController.summary);

router.get('/addresses', accountController.listAddresses);
router.post('/addresses', validate({ body: addressSchema }), accountController.createAddress);
router.patch('/addresses/:id', validate({ params: idParam, body: addressSchema.partial() }), accountController.updateAddress);
router.delete('/addresses/:id', validate({ params: idParam }), accountController.deleteAddress);

router.get('/wishlist', accountController.wishlist);
router.post('/wishlist/:id', validate({ params: idParam }), accountController.toggleWishlist);
router.get('/recently-viewed', accountController.recentlyViewed);

router.get('/subscriptions', subscriptionController.mine);
router.post('/subscriptions', validate({ body: subscribeSchema }), subscriptionController.subscribe);
router.post('/subscriptions/:id/:action', subscriptionController.setStatus);

export default router;
