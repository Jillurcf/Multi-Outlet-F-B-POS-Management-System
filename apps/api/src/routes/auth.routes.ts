import { loginBodySchema } from '@pos/shared';
import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middlewares/authenticate';
import { validate } from '../middlewares/validate';

export const authRouter = Router();

authRouter.post('/login', validate(loginBodySchema, 'body'), authController.login);
authRouter.get('/me', authenticate, authController.me);
