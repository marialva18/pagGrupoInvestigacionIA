import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '@intgarti/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from '../src/common/errors/app-error.ts';
import { inviteUser, resendInvitation } from '../src/modules/admin-users/admin-users.service.ts';
import { createActivateInvitation } from '../src/modules/auth/auth.service.ts';

const admin = { id: 'admin-local', role: 'ADMIN' as const };
const identity = { id: 'auth-id', email: 'editor@example.test', emailConfirmed: true };
const invited = {
  id: 'local-id',
  email: identity.email,
  displayName: 'Editor',
  role: 'EDITOR' as const,
  status: 'INVITED' as 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED',
  authProviderId: identity.id as string | null,
  lastLoginAt: null as Date | null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function fixture(initial: typeof invited | null = { ...invited }) {
  const state = {
    user: initial,
    audits: [] as Record<string, unknown>[],
    invitations: 0,
    recoveries: 0,
    identityMismatch: false,
    registered: false,
    providerFailure: false,
    failAudit: false,
    concurrentSuspension: false,
    ambiguous: false,
  };
  const user = {
    findUnique: async () => (state.user ? { ...state.user } : null),
    findMany: async () =>
      state.user
        ? state.ambiguous
          ? [{ ...state.user }, { ...state.user, id: 'other-local' }]
          : [{ ...state.user }]
        : [],
    findUniqueOrThrow: async () => {
      assert.ok(state.user);
      return { ...state.user };
    },
    create: async ({ data }: { data: Partial<typeof invited> }) => {
      state.user = { ...invited, ...data };
      return { ...state.user };
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { status: string; authProviderId: string | null };
      data: Partial<typeof invited>;
    }) => {
      if (state.concurrentSuspension && state.user) state.user.status = 'SUSPENDED';
      if (
        !state.user ||
        state.user.status !== where.status ||
        state.user.authProviderId !== where.authProviderId
      )
        return { count: 0 };
      state.user = { ...state.user, ...data };
      return { count: 1 };
    },
  };
  const transaction = {
    user,
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (state.failAudit) throw new Error('Audit unavailable');
        state.audits.push(data);
      },
    },
  };
  const prisma = {
    ...transaction,
    $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => {
      const snapshot = state.user ? { ...state.user } : null;
      const count = state.audits.length;
      try {
        return await work(transaction);
      } catch (error) {
        // Model rollback; concurrent suspension represents another committed transaction.
        state.user =
          state.concurrentSuspension && snapshot ? { ...snapshot, status: 'SUSPENDED' } : snapshot;
        state.audits.length = count;
        throw error;
      }
    },
  } as unknown as PrismaClient;
  const supabase = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: {
              id: identity.id,
              email: state.identityMismatch ? 'other@example.test' : identity.email,
            },
          },
          error: null,
        }),
        inviteUserByEmail: async () => {
          state.invitations++;
          return state.registered || state.providerFailure
            ? {
                data: { user: null },
                error: {
                  code: state.registered ? 'email_exists' : 'unexpected_failure',
                  message: state.registered
                    ? 'A user with this email address has already been registered'
                    : 'Sensitive provider credentials',
                },
              }
            : { data: { user: { id: identity.id } }, error: null };
        },
      },
    },
  } as unknown as SupabaseClient;
  const dependencies = {
    getPrisma: () => prisma,
    getSupabase: () => supabase,
    sendRecovery: async (email: string) => {
      assert.equal(email, identity.email);
      state.recoveries++;
    },
  };
  const activate = createActivateInvitation(
    async () => identity,
    () => prisma,
  );
  return { state, dependencies, activate, prisma };
}

function hasCode(code: string) {
  return (error: unknown) => error instanceof AppError && error.code === code;
}

test('new invitation creates INVITED user and audit without activating or changing role', async () => {
  const f = fixture(null);
  const result = await inviteUser(
    admin,
    { email: identity.email, displayName: 'Editor', role: 'EDITOR' },
    f.dependencies,
  );
  assert.equal(result.status, 'INVITED');
  assert.equal(result.role, 'EDITOR');
  assert.equal(f.state.user?.authProviderId, identity.id);
  assert.equal(f.state.audits[0]?.action, 'USER_INVITED');
  assert.equal(f.state.invitations, 1);
});

test('new invitation to already registered account returns safe conflict without auto-provisioning', async () => {
  const f = fixture(null);
  f.state.registered = true;
  await assert.rejects(
    inviteUser(
      admin,
      { email: identity.email, displayName: 'Editor', role: 'EDITOR' },
      f.dependencies,
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'ADMIN_USER_ALREADY_REGISTERED');
      assert.equal(error.details, undefined);
      assert.doesNotMatch(error.message, /already been registered/);
      return true;
    },
  );
  assert.equal(f.state.user, null);
  assert.equal(f.state.recoveries, 0);
});

test('registered INVITED account with no binding receives recovery but is only bound by verified activation', async () => {
  const f = fixture({ ...invited, authProviderId: null });
  f.state.registered = true;
  await resendInvitation(admin, invited.id, f.dependencies);
  assert.equal(f.state.recoveries, 1);
  assert.equal(f.state.user?.authProviderId, null);
  assert.equal(f.state.user?.status, 'INVITED');
  await f.activate('verified-token');
  assert.equal(f.state.user?.authProviderId, identity.id);
  assert.equal(f.state.user?.status, 'ACTIVE');
});

test('existing registered INVITED identity receives recovery, keeps status and audits admin request', async () => {
  const f = fixture();
  f.state.registered = true;
  const result = await resendInvitation(admin, invited.id, f.dependencies);
  assert.equal(result.status, 'INVITED');
  assert.equal(result.role, 'EDITOR');
  assert.equal(f.state.invitations, 0);
  assert.equal(f.state.recoveries, 1);
  assert.equal(f.state.audits[0]?.action, 'USER_INVITATION_RECOVERY_SENT');
  assert.equal(f.state.audits[0]?.actorId, admin.id);
});

test('identity mismatch sends no recovery and changes no user', async () => {
  const f = fixture();
  f.state.identityMismatch = true;
  await assert.rejects(
    resendInvitation(admin, invited.id, f.dependencies),
    hasCode('ADMIN_USER_IDENTITY_CONFLICT'),
  );
  assert.equal(f.state.recoveries, 0);
  assert.equal(f.state.user?.status, 'INVITED');
});

test('INVITED without provider binding can receive a new invitation with atomic audit', async () => {
  const f = fixture({ ...invited, authProviderId: null });
  await resendInvitation(admin, invited.id, f.dependencies);
  assert.equal(f.state.user?.authProviderId, identity.id);
  assert.equal(f.state.user?.status, 'INVITED');
  assert.equal(f.state.audits[0]?.action, 'USER_INVITATION_RESENT');
});

test('provider failures expose no sensitive provider details', async () => {
  const f = fixture(null);
  f.state.providerFailure = true;
  await assert.rejects(
    inviteUser(
      admin,
      { email: identity.email, displayName: 'Editor', role: 'EDITOR' },
      f.dependencies,
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 502);
      assert.equal(error.details, undefined);
      assert.doesNotMatch(error.message, /credentials/);
      return true;
    },
  );
  assert.equal(f.state.user, null);
});

test('only admins can issue invitations or recover pending accounts', async () => {
  const f = fixture();
  const editor = { ...admin, role: 'EDITOR' as const };
  await assert.rejects(
    resendInvitation(editor, invited.id, f.dependencies),
    hasCode('AUTH_FORBIDDEN'),
  );
  await assert.rejects(
    inviteUser(
      editor,
      { email: identity.email, displayName: 'Editor', role: 'EDITOR' },
      f.dependencies,
    ),
    hasCode('AUTH_FORBIDDEN'),
  );
  assert.equal(f.state.recoveries, 0);
  assert.equal(f.state.invitations, 0);
});

test('SUSPENDED and DISABLED cannot receive activation recovery or activate with valid identity', async () => {
  for (const status of ['SUSPENDED', 'DISABLED'] as const) {
    const f = fixture({ ...invited, status });
    await assert.rejects(
      resendInvitation(admin, invited.id, f.dependencies),
      hasCode('ADMIN_USER_NOT_INVITED'),
    );
    await assert.rejects(f.activate('verified-token'), hasCode('AUTH_USER_INACTIVE'));
    assert.equal(f.state.user?.status, status);
    assert.equal(f.state.recoveries, 0);
    assert.equal(f.state.audits.length, 0);
  }
});

test('verified identity completes pending local activation atomically and repeat is idempotent', async () => {
  const f = fixture();
  const result = await f.activate('verified-token');
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.role, 'EDITOR');
  assert.equal(f.state.audits[0]?.action, 'USER_INVITATION_ACCEPTED');
  await f.activate('verified-token');
  assert.equal(f.state.audits.length, 1);
});

test('audit failure leaves incomplete activation INVITED and can be retried', async () => {
  const f = fixture();
  f.state.failAudit = true;
  await assert.rejects(f.activate('verified-token'), /Audit unavailable/);
  assert.equal(f.state.user?.status, 'INVITED');
  assert.equal(f.state.audits.length, 0);
  f.state.failAudit = false;
  await f.activate('verified-token');
  assert.equal(f.state.user?.status, 'ACTIVE');
});

test('expired invitation token never reads or changes local users', async () => {
  let reads = 0;
  const activate = createActivateInvitation(
    async () => {
      throw new AppError('Enlace expirado.', 401, 'AUTH_INVALID_TOKEN');
    },
    () => {
      reads++;
      throw new Error('Must not read');
    },
  );
  await assert.rejects(activate('expired-token'), hasCode('AUTH_INVALID_TOKEN'));
  assert.equal(reads, 0);
});

test('unconfirmed email cannot activate even with a token', async () => {
  const f = fixture();
  const activate = createActivateInvitation(
    async () => ({ ...identity, emailConfirmed: false }),
    () => f.prisma,
  );
  await assert.rejects(activate('token'), hasCode('AUTH_EMAIL_NOT_CONFIRMED'));
  assert.equal(f.state.user?.status, 'INVITED');
});

test('ambiguous identities and concurrent suspensions cannot be activated', async () => {
  const f = fixture();
  f.state.ambiguous = true;
  await assert.rejects(f.activate('token'), hasCode('AUTH_IDENTITY_CONFLICT'));
  f.state.ambiguous = false;
  f.state.concurrentSuspension = true;
  await assert.rejects(f.activate('token'), hasCode('AUTH_ACTIVATION_STATE_CHANGED'));
  assert.equal(f.state.user?.status, 'SUSPENDED');
  assert.equal(f.state.audits.length, 0);
});
