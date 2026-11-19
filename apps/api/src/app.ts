import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { securityHeaders } from './middlewares/securityHeaders';
import { authRouter } from './routes/auth.routes';
import { dashboardRouter } from './routes/dashboard.routes';
import { healthRouter } from './routes/health.routes';
import { inventoryRouter } from './routes/inventory.routes';
import { menuItemRouter } from './routes/menuItem.routes';
import { outletRouter } from './routes/outlet.routes';
import { reportingRouter } from './routes/reporting.routes';
import { saleRouter } from './routes/sale.routes';
import { staffOutletMenuRouter } from './routes/staffOutletMenu.routes';
import { userRouter } from './routes/user.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/', (_req, res) => {
    res.status(200).json({ service: 'pos-api' });
  });

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/outlets', outletRouter);
  app.use('/api/menu-items', menuItemRouter);
  app.use('/api/users', userRouter);
  app.use('/api/outlet/menu-items', staffOutletMenuRouter);
  app.use('/api/outlet/inventory', inventoryRouter);
  app.use('/api/outlet/sales', saleRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/reports', reportingRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
