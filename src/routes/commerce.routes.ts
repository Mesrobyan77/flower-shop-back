import { Router } from 'express';
import * as cartController from '../controllers/cart.controller';
import * as orderController from '../controllers/order.controller';
import { optionalAuthStrict, requireAuth } from '../middlewares/auth';
import { guestSession } from '../middlewares/guestSession';
import { syncGuestCart } from '../middlewares/syncGuestCart';
import { writeLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import {
  addToCartSchema,
  cancelOrderSchema,
  cartItemParam,
  checkoutSchema,
  deliveryQuoteQuery,
  guestLookupSchema,
  orderListQuery,
  updateCartItemSchema,
} from '../validators/order.validator';

const router = Router();

/* cart - works for guests (cookie session) and members alike */
router.use('/cart', guestSession, optionalAuthStrict, syncGuestCart);
router.get('/cart', cartController.view);
router.post('/cart/items', validate({ body: addToCartSchema }), cartController.add);
router.patch('/cart/items/:itemId', validate({ params: cartItemParam, body: updateCartItemSchema }), cartController.update);
router.delete('/cart/items/:itemId', validate({ params: cartItemParam }), cartController.remove);
router.delete('/cart', cartController.clear);

/* delivery rules feed the product page and checkout */
router.get('/delivery/options', orderController.deliveryOptions);
router.get('/delivery/quote', validate({ query: deliveryQuoteQuery }), orderController.deliveryQuote);

/* orders */
router.post('/orders/checkout', guestSession, optionalAuthStrict, writeLimiter, syncGuestCart, validate({ body: checkoutSchema }), orderController.checkout);
router.post('/orders/lookup', writeLimiter, validate({ body: guestLookupSchema }), orderController.guestLookup);
router.get('/orders', requireAuth, validate({ query: orderListQuery }), orderController.myOrders);
router.get('/orders/:code', requireAuth, orderController.myOrderDetail);
router.post('/orders/:code/cancel', requireAuth, validate({ body: cancelOrderSchema }), orderController.cancelMine);

export default router;
