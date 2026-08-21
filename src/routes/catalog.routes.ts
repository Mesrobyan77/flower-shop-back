import { Router } from 'express';
import * as categoryController from '../controllers/category.controller';
import * as productController from '../controllers/product.controller';
import * as reviewController from '../controllers/review.controller';
import * as inquiryController from '../controllers/inquiry.controller';
import { optionalAuth, requireAuth } from '../middlewares/auth';
import { writeLimiter } from '../middlewares/rateLimit';
import { validate } from '../middlewares/validate';
import { productListQuery } from '../validators/catalog.validator';
import { createInquirySchema, createReviewSchema } from '../validators/content.validator';
import { slugParam } from '../validators/common.validator';

const router = Router();

/* categories and collections */
router.get('/categories', categoryController.tree);
router.get('/categories/:slug', validate({ params: slugParam }), categoryController.bySlug);
router.get('/collections', categoryController.collections);
router.get('/collections/:slug', validate({ params: slugParam }), categoryController.collectionBySlug);

/* products */
router.get('/products', validate({ query: productListQuery }), productController.list);
router.get('/products/facets', productController.facets);
router.get('/products/new', productController.newArrivals);
router.get('/products/best', productController.bestSellers);
router.get('/products/:slug', validate({ params: slugParam }), optionalAuth, productController.detail);

/* product-scoped reviews and Q&A */
router.get('/products/:slug/reviews', validate({ params: slugParam }), reviewController.listForProduct);
router.get('/products/:slug/inquiries', validate({ params: slugParam }), optionalAuth, inquiryController.listForProduct);

router.post('/reviews', requireAuth, writeLimiter, validate({ body: createReviewSchema }), reviewController.create);
router.delete('/reviews/:id', requireAuth, reviewController.remove);
router.post('/reviews/:id/helpful', writeLimiter, reviewController.markHelpful);

router.post('/inquiries', requireAuth, writeLimiter, validate({ body: createInquirySchema }), inquiryController.create);
router.get('/inquiries/mine', requireAuth, inquiryController.mine);
router.get('/inquiries/:id', optionalAuth, inquiryController.detail);

export default router;
