import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAuthCallback,
  passwordErrorMessage,
  safeEditorRedirect,
} from '../src/lib/auth/auth-feedback.ts';
import { loginWithEditorialSession } from '../src/lib/auth/login-flow.ts';
import { getBrowserSupabase } from '../src/lib/auth/supabase-browser.ts';
import {
  clearEditorAccessToken,
  getEditorAccessToken,
  setEditorAccessToken,
  shouldRememberEditorSession,
} from '../src/lib/auth/editor-session.ts';

test('failed credentials never request an editorial session', async () => {
  let requests = 0;
  await assert.rejects(
    loginWithEditorialSession(
      async () => ({ data: { session: null }, error: { code: 'invalid_credentials' } }),
      async () => {
        requests++;
      },
    ),
    /correo o la contraseña/,
  );
  assert.equal(requests, 0);
});

test('login validates editorial authorization before returning the token', async () => {
  const signIn = async () => ({ data: { session: { access_token: 'token' } }, error: null });
  await assert.rejects(
    loginWithEditorialSession(signIn, async () => {
      throw new Error('Forbidden');
    }),
    /Forbidden/,
  );
  const result = await loginWithEditorialSession(signIn, async (token) => {
    assert.equal(token, 'token');
    return { role: 'EDITOR' };
  });
  assert.equal(result.session.role, 'EDITOR');
});

test('only a complete recovery callback opens password update', () => {
  const base = 'https://site.test/auth/restablecer-contrasena';
  assert.equal(isAuthCallback(base, 'recovery'), false);
  assert.equal(isAuthCallback(`${base}?code=unusable-without-verifier`, 'recovery'), false);
  assert.equal(
    isAuthCallback(`${base}#type=invite&access_token=a&refresh_token=b`, 'recovery'),
    false,
  );
  assert.equal(isAuthCallback(`${base}#type=recovery&access_token=a`, 'recovery'), false);
  assert.equal(
    isAuthCallback(`${base}#type=recovery&access_token=a&refresh_token=b`, 'recovery'),
    true,
  );
  assert.equal(
    isAuthCallback(
      `${base}#type=recovery&access_token=a&refresh_token=b&error=expired`,
      'recovery',
    ),
    false,
  );
});

test('password errors are actionable and never expose provider messages', () => {
  assert.match(passwordErrorMessage({ code: 'same_password' }), /diferente/);
  assert.match(passwordErrorMessage({ code: 'weak_password' }), /requisitos/);
  assert.match(passwordErrorMessage({ code: 'bad_jwt' }), /expiró/);
  assert.match(passwordErrorMessage({ code: 'unknown' }), /No fue posible/);
});

test('redirects cannot escape the editorial area or loop to login', () => {
  for (const path of [
    '//evil.test',
    '/\\evil.test',
    '/acceso',
    '/auth/restablecer-contrasena',
    '/editor/../../acceso',
  ]) {
    assert.equal(safeEditorRedirect(path), '/editor');
  }
  assert.equal(safeEditorRedirect('/editor/noticias?new=1'), '/editor/noticias?new=1');
  assert.equal(safeEditorRedirect('/admin/usuarios'), '/admin/usuarios');
});

test('browser Supabase is reused across consumers and never created in SSR', async () => {
  const config = {
    PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_test',
  };
  assert.throws(() => getBrowserSupabase(config), /navegador/);
  const taskWindow = {} as Window;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: taskWindow });
  const originalFetch = globalThis.fetch;
  const token = `e30.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, sub: 'test-user' })).toString('base64url')}.c2lnbmF0dXJl`;
  let updates = 0;
  let recoveries = 0;
  globalThis.fetch = async (input, options) => {
    const url = String(input);
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('apikey'), config.PUBLIC_SUPABASE_ANON_KEY);
    if (url.includes('/recover')) {
      const body = JSON.parse(String(options?.body));
      assert.equal(body.code_challenge, null);
      assert.equal(body.code_challenge_method, null);
      recoveries++;
      return Response.json({});
    }
    assert.equal(headers.get('authorization'), `Bearer ${token}`);
    if (options?.method === 'PUT') {
      assert.equal(JSON.parse(String(options.body)).password, 'replacement-password');
      updates++;
      return Response.json(
        { code: 'same_password', msg: 'Sensitive provider detail' },
        {
          status: 422,
          headers: { 'x-supabase-api-version': '2024-01-01' },
        },
      );
    }
    return Response.json({ id: 'test-user', email: 'test@example.test' });
  };
  try {
    const first = getBrowserSupabase(config);
    assert.equal(getBrowserSupabase(config), first);
    const established = await first.auth.setSession({
      access_token: token,
      refresh_token: 'refresh-test',
    });
    assert.equal(established.error, null);
    const update = await getBrowserSupabase(config).auth.updateUser({
      password: 'replacement-password',
    });
    assert.equal(update.error?.status, 422);
    assert.match(passwordErrorMessage(update.error!), /diferente/);
    const recovery = await first.auth.resetPasswordForEmail('test@example.test', {
      redirectTo: 'https://site.test/auth/restablecer-contrasena',
    });
    assert.equal(recovery.error, null);
    assert.equal(updates, 1);
    assert.equal(recoveries, 1);
  } finally {
    globalThis.fetch = originalFetch;
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('editor storage moves tokens between persistence modes and clears both', () => {
  function storage(): Storage {
    const values = new Map<string, string>();
    return {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      key: (index) => [...values.keys()][index] ?? null,
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    };
  }
  const localStorage = storage();
  const sessionStorage = storage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage, sessionStorage },
  });
  try {
    setEditorAccessToken('remembered', true);
    assert.equal(shouldRememberEditorSession(), true);
    setEditorAccessToken('temporary', false);
    assert.equal(localStorage.getItem('intgarti.editor.access-token'), null);
    assert.equal(getEditorAccessToken(), 'temporary');
    clearEditorAccessToken();
    assert.equal(getEditorAccessToken(), null);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

test('blocked browser storage does not leak technical exceptions', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get localStorage() {
        throw new Error('SecurityError');
      },
      get sessionStorage() {
        throw new Error('SecurityError');
      },
    },
  });
  try {
    assert.equal(getEditorAccessToken(), null);
    assert.equal(shouldRememberEditorSession(), false);
    assert.doesNotThrow(() => clearEditorAccessToken());
    assert.throws(() => setEditorAccessToken('token'), /Permite el almacenamiento/);
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
});
