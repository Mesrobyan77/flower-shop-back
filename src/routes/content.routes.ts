import { Router } from 'express';
import * as contentController from '../controllers/content.controller';
import * as subscriptionController from '../controllers/subscription.controller';
import { validate } from '../middlewares/validate';
import { postListQuery } from '../validators/content.validator';
import { slugParam } from '../validators/common.validator';

const router = Router();

router.get('/settings', contentController.settings);
router.get('/posts', validate({ query: postListQuery }), contentController.listPosts);
router.get('/posts/:slug', validate({ params: slugParam }), contentController.postBySlug);
router.get('/subscription-plans', subscriptionController.listPlans);

export default router;
