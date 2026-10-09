import type { AuthenticatedUser } from '@intgarti/contracts';

export interface VerifiedSupabaseIdentity {
  id: string;
  email: string;
  emailConfirmed?: boolean;
}

export type VerifySupabaseAccessToken = (accessToken: string) => Promise<VerifiedSupabaseIdentity>;

export type AuthenticateAccessToken = (accessToken: string) => Promise<AuthenticatedUser>;
