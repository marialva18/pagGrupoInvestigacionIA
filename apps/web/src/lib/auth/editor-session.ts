const ACCESS_TOKEN_KEY = 'intgarti.editor.access-token';
const PERSISTENCE_KEY = 'intgarti.editor.remember';
const USER_CACHE_KEY = 'intgarti.editor.user';

export interface CachedEditorUser {
  id: string;
  displayName: string;
  email: string;
  role: 'ADMIN' | 'EDITOR';
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  lastLoginAt: string | null;
}

function readStorage(storage: Storage, key = ACCESS_TOKEN_KEY): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // La sesión seguirá funcionando aunque el navegador bloquee el almacenamiento.
  }
}

export function getEditorAccessToken(): string | null {
  if (typeof window === 'undefined') return null;

  return readStorage(window.sessionStorage) ?? readStorage(window.localStorage);
}

export function setEditorAccessToken(accessToken: string, remember = false): void {
  const primaryStorage = remember ? window.localStorage : window.sessionStorage;
  const secondaryStorage = remember ? window.sessionStorage : window.localStorage;

  secondaryStorage.removeItem(ACCESS_TOKEN_KEY);
  primaryStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.localStorage.setItem(PERSISTENCE_KEY, String(remember));
}

export function cacheEditorUser(user: CachedEditorUser, remember = false): void {
  if (typeof window === 'undefined') return;

  const primaryStorage = remember ? window.localStorage : window.sessionStorage;
  const secondaryStorage = remember ? window.sessionStorage : window.localStorage;

  secondaryStorage.removeItem(USER_CACHE_KEY);
  writeStorage(primaryStorage, USER_CACHE_KEY, JSON.stringify(user));
  writeStorage(window.localStorage, 'intgarti.editor.role', user.role);
}

export function getCachedEditorUser(): CachedEditorUser | null {
  if (typeof window === 'undefined') return null;

  const raw =
    readStorage(window.sessionStorage, USER_CACHE_KEY) ??
    readStorage(window.localStorage, USER_CACHE_KEY);

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
  return window.localStorage.getItem(PERSISTENCE_KEY) === 'true';
}

export function clearEditorAccessToken(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(USER_CACHE_KEY);
  window.localStorage.removeItem(USER_CACHE_KEY);
  window.localStorage.removeItem('intgarti.editor.role');
  window.localStorage.removeItem(PERSISTENCE_KEY);
}
