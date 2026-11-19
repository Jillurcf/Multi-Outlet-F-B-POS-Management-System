import { createStaffUserBodySchema } from '@pos/shared';
import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';

export const userRouter = Router();

userRouter.use(authenticate, authorize('HQ_ADMIN'));

userRouter.post('/staff', validate(createStaffUserBodySchema, 'body'), userController.createStaff);
