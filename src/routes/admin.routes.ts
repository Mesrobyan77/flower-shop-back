import { Router } from 'express';
import * as admin from '../controllers/admin.controller';
import * as adminCatalog from '../controllers/admin.catalog.controller';
import { requireAuth, requireRole } from '../middlewares/auth';
import { upload } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import {
  createCategorySchema,
  createCollectionSchema,
  createProductSchema,
  updateCategorySchema,
  updateCollectionSchema,
  updateProductSchema,
} from '../validators/catalog.validator';
import {
  answerInquirySchema,
  adminUserListQuery,
  createPostSchema,
  updatePostSchema,
  updateSettingsSchema,
  updateUserRoleSchema,
} from '../validators/content.validator';
import { changePaymentStatusSchema, changeStatusSchema, orderListQuery } from '../validators/order.validator';
import { idParam } from '../validators/common.validator';

const router = Router();

router.use(requireAuth, requireRole('admin'));

/* dashboard */
router.get('/stats', admin.stats);

/* products */
router.get('/products', adminCatalog.listProducts);
router.post('/products', validate({ body: createProductSchema }), adminCatalog.createProduct);
router.get('/products/:id', validate({ params: idParam }), adminCatalog.getProduct);
router.patch('/products/:id', validate({ params: idParam, body: updateProductSchema }), adminCatalog.updateProduct);
router.delete('/products/:id', validate({ params: idParam }), adminCatalog.deleteProduct);

/* categories */
router.get('/categories', adminCatalog.listCategories);
router.post('/categories', validate({ body: createCategorySchema }), adminCatalog.createCategory);
router.patch('/categories/:id', validate({ params: idParam, body: updateCategorySchema }), adminCatalog.updateCategory);
router.delete('/categories/:id', validate({ params: idParam }), adminCatalog.deleteCategory);

/* collections */
router.get('/collections', adminCatalog.listCollections);
router.post('/collections', validate({ body: createCollectionSchema }), adminCatalog.createCollection);
router.patch('/collections/:id', validate({ params: idParam, body: updateCollectionSchema }), adminCatalog.updateCollection);
router.delete('/collections/:id', validate({ params: idParam }), adminCatalog.deleteCollection);

/* orders */
router.get('/orders', validate({ query: orderListQuery }), admin.listOrders);
router.get('/orders/:id', validate({ params: idParam }), admin.getOrder);
router.patch('/orders/:id/status', validate({ params: idParam, body: changeStatusSchema }), admin.changeOrderStatus);
router.patch('/orders/:id/payment', validate({ params: idParam, body: changePaymentStatusSchema }), admin.changePaymentStatus);
router.patch('/orders/:id/note', validate({ params: idParam }), admin.updateOrderNote);

/* users */
router.get('/users', validate({ query: adminUserListQuery }), admin.listUsers);
router.get('/users/:id', validate({ params: idParam }), admin.getUser);
router.patch('/users/:id/role', validate({ params: idParam, body: updateUserRoleSchema }), admin.updateUserRole);
router.patch('/users/:id/active', validate({ params: idParam }), admin.setUserActive);

/* content */
router.get('/posts', admin.listPosts);
router.post('/posts', validate({ body: createPostSchema }), admin.createPost);
router.patch('/posts/:id', validate({ params: idParam, body: updatePostSchema }), admin.updatePost);
router.delete('/posts/:id', validate({ params: idParam }), admin.deletePost);

router.get('/reviews', admin.listReviews);
router.patch('/reviews/:id/approval', validate({ params: idParam }), admin.setReviewApproval);

router.get('/inquiries', admin.listInquiries);
router.post('/inquiries/:id/answer', validate({ params: idParam, body: answerInquirySchema }), admin.answerInquiry);

/* media */
router.get('/media', admin.listMedia);
router.post('/media/upload', upload.array('files', 10), admin.upload);
router.delete('/media/:id', validate({ params: idParam }), admin.removeMedia);

/* settings */
router.get('/settings', admin.getSettings);
router.patch('/settings', validate({ body: updateSettingsSchema }), admin.updateSettings);

export default router;
