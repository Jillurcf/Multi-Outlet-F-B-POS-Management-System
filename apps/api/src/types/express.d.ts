import type { Role } from '@pos/shared';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        outletId: string | null;
      };
    }
  }
}

export {};
