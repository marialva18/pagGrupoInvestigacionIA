const ACCESS_TOKEN_KEY = 'intgarti.editor.access-token';
const PERSISTENCE_KEY = 'intgarti.editor.remember';
const USER_CACHE_KEY = 'intgarti.editor.user';

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window[kind];
  } catch {
    return null;
  }
}

function removeStorage(storage: Storage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* Storage may be blocked by the browser. */
  }
}

export interface CachedEditorUser {
  id: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'EDITOR';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lastLoginAt: string | null;
}

function readStorage(storage: Storage | null, key = ACCESS_TOKEN_KEY): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // La sesión seguirá funcionando aunque el navegador bloquee el almacenamiento.
  }
}

export function getEditorAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  return (
    readStorage(browserStorage('sessionStorage')) ?? readStorage(browserStorage('localStorage'))
  );
}

export function setEditorAccessToken(accessToken: string, remember = false): void {
  const primaryStorage = browserStorage(remember ? 'localStorage' : 'sessionStorage');
  const secondaryStorage = browserStorage(remember ? 'sessionStorage' : 'localStorage');
  try {
    if (!primaryStorage) throw new Error('Storage unavailable');
    primaryStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  } catch {
    throw new Error('Permite el almacenamiento del navegador para iniciar sesión.');
  }
  removeStorage(secondaryStorage, ACCESS_TOKEN_KEY);
  writeStorage(browserStorage('localStorage'), PERSISTENCE_KEY, String(remember));
}

export function cacheEditorUser(user: CachedEditorUser, remember = false): void {
  if (typeof window === 'undefined') return;

  const primaryStorage = browserStorage(remember ? 'localStorage' : 'sessionStorage');
  const secondaryStorage = browserStorage(remember ? 'sessionStorage' : 'localStorage');

  removeStorage(secondaryStorage, USER_CACHE_KEY);
  writeStorage(primaryStorage, USER_CACHE_KEY, JSON.stringify(user));
  writeStorage(browserStorage('localStorage'), 'intgarti.editor.role', user.role);
}

export function getCachedEditorUser(): CachedEditorUser | null {
  if (typeof window === 'undefined') return null;

  const raw =
    readStorage(browserStorage('sessionStorage'), USER_CACHE_KEY) ??
    readStorage(browserStorage('localStorage'), USER_CACHE_KEY);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<CachedEditorUser>;

    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.displayName !== 'string' ||
      typeof parsed.email !== 'string' ||
      (parsed.role !== 'ADMIN' && parsed.role !== 'EDITOR')
    ) {
      return null;
    }

    return parsed as CachedEditorUser;
  } catch {
    return null;
  }
}

export function shouldRememberEditorSession(): boolean {
  if (typeof window === 'undefined') return false;
  return readStorage(browserStorage('localStorage'), PERSISTENCE_KEY) === 'true';
}

export function clearEditorAccessToken(): void {
  if (typeof window === 'undefined') return;
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    const storage = browserStorage(kind);
    for (const key of [ACCESS_TOKEN_KEY, USER_CACHE_KEY, 'intgarti.editor.role', PERSISTENCE_KEY]) {
      removeStorage(storage, key);
    }
  }
}
