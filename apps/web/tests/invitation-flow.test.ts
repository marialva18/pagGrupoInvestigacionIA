import assert from 'node:assert/strict';
import test from 'node:test';
import {
  invitationRedirectFromLogin,
  isInvitationCallback,
} from '../src/lib/auth/auth-feedback.ts';
import { completeEditorialInvitation } from '../src/lib/auth/invitation-flow.ts';

test('invitation delivered to login preserves callback and opens activation, not an editorial session', () => {
  const hash = '#type=invite&access_token=test&refresh_token=test';
  assert.equal(
    invitationRedirectFromLogin(`https://site.test/acceso${hash}`),
    `/auth/aceptar-invitacion${hash}`,
  );
  assert.equal(invitationRedirectFromLogin('https://site.test/acceso'), null);
  assert.equal(
    invitationRedirectFromLogin('https://site.test/acceso#error=expired&type=invite'),
    null,
  );
  assert.equal(
    invitationRedirectFromLogin(
      'https://site.test/acceso#type=recovery&access_token=a&refresh_token=b',
    ),
    null,
  );
});

test('new invitation and recovery links can enter activation, expired or incomplete links cannot', () => {
  const base = 'https://site.test/auth/aceptar-invitacion';
  for (const type of ['invite', 'recovery']) {
    assert.equal(isInvitationCallback(`${base}#type=${type}&access_token=a&refresh_token=b`), true);
  }
  for (const suffix of [
    '',
    '?error=expired',
    '#type=invite&access_token=a',
    '#type=signup&access_token=a&refresh_token=b',
    '#type=invite&access_token=a&refresh_token=b&error=expired',
  ]) {
    assert.equal(isInvitationCallback(`${base}${suffix}`), false);
  }
});

test('password failure does not attempt editorial activation', async () => {
  let activated = false;
  await assert.rejects(
    completeEditorialInvitation({
      savePassword: async () => {
        throw new Error('Contraseña rechazada');
      },
      activate: async () => {
        activated = true;
      },
    }),
    /rechazada/,
  );
  assert.equal(activated, false);
});

test('incomplete editorial activation preserves saved password progress and retry skips password update', async () => {
  let saved = false;
  let updates = 0;
  await assert.rejects(
    completeEditorialInvitation({
      savePassword: async () => {
        updates++;
      },
      onPasswordSaved: () => {
        saved = true;
      },
      activate: async () => {
        throw new Error('API unavailable');
      },
    }),
    /unavailable/,
  );
  assert.equal(saved, true);
  const result = await completeEditorialInvitation({
    activate: async () => ({ status: 'ACTIVE' }),
  });
  assert.equal(result.status, 'ACTIVE');
  assert.equal(updates, 1);
});

test('existing account can explicitly activate with recovery session without changing its password', async () => {
  let calls = 0;
  const result = await completeEditorialInvitation({
    activate: async () => {
      calls++;
      return 'verified';
    },
  });
  assert.equal(result, 'verified');
  assert.equal(calls, 1);
});
