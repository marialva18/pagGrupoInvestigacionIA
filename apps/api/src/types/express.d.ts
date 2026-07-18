import type { AuthenticatedUser } from '@intgarti/contracts';

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
