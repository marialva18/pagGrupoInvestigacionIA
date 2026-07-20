import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { apiRequest } from '../lib/api-client';
import {
  cacheEditorUser,
  clearEditorAccessToken,
  getCachedEditorUser,
  getEditorAccessToken,
  shouldRememberEditorSession,
} from '../lib/auth/editor-session';

const sessionSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string().email(),
    role: z.enum(['ADMIN', 'EDITOR']),
    status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'DISABLED']),
    lastLoginAt: z.string().nullable(),
  }),
});

type SessionUser = z.infer<typeof sessionSchema>['user'];

function initials(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function redirectToLogin(): void {
  const returnPath = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`/acceso?redirect=${encodeURIComponent(returnPath)}`);
}

function applyRoleVisibility(role: SessionUser['role']): void {
  document.querySelectorAll<HTMLElement>('[data-admin-only]').forEach((element) => {
    element.hidden = role !== 'ADMIN';
  });
}

export default function EditorialSession() {
  const [user, setUser] = useState<SessionUser | null>(() => getCachedEditorUser());
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = getCachedEditorUser();
    if (cached) applyRoleVisibility(cached.role);

    const token = getEditorAccessToken();

    if (!token) {
      redirectToLogin();
      return;
    }

    void apiRequest('/auth/session', sessionSchema, { accessToken: token })
      .then((session) => {
        setUser(session.user);
        cacheEditorUser(session.user, shouldRememberEditorSession());
        applyRoleVisibility(session.user.role);

        window.dispatchEvent(
          new CustomEvent('intgarti:editor-session', {
            detail: session.user,
          }),
        );
      })
      .catch(() => {
        clearEditorAccessToken();
        redirectToLogin();
      });
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const avatarText = useMemo(() => (user ? initials(user.displayName) : '...'), [user]);

  function logout() {
    clearEditorAccessToken();
    window.location.replace('/acceso');
  }

  if (!user) {
    return <div className="editor-session-skeleton" aria-label="Validando sesión" />;
  }

  return (
    <div className="editor-session" ref={menuRef}>
      <button
        className="editor-session__trigger"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="editor-session__avatar">{avatarText}</span>
        <span className="editor-session__identity">
          <strong>{user.displayName}</strong>
          <small>{user.role === 'ADMIN' ? 'Administrador' : 'Editor'}</small>
        </span>
        <span className="editor-session__chevron" aria-hidden="true">
          {open ? '⌃' : '⌄'}
        </span>
      </button>

      {open && (
        <div className="editor-session__menu">
          <div>
            <strong>{user.displayName}</strong>
            <small>{user.email}</small>
          </div>
          <a href="/">Ver sitio público</a>
          <button type="button" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      )}

      <style>{`
        .editor-session{position:relative;font-family:"Segoe UI","Source Sans 3",Arial,sans-serif}
        .editor-session__trigger{min-height:52px;padding:6px 9px;display:flex;align-items:center;gap:11px;border:0;border-radius:12px;color:var(--editorial-text);background:transparent;cursor:pointer}
        .editor-session__trigger:hover{background:var(--color-ivory)}
        .editor-session__avatar{width:39px;height:39px;display:inline-flex;align-items:center;justify-content:center;border-radius:11px;color:#fff;background:var(--editorial-accent);font-size:.78rem;font-weight:800}
        .editor-session__identity{min-width:135px;text-align:left}
        .editor-session__identity strong,.editor-session__identity small{display:block}
        .editor-session__identity strong{max-width:190px;overflow:hidden;color:var(--color-navy);font-size:.88rem;font-weight:800;text-overflow:ellipsis;white-space:nowrap}
        .editor-session__identity small{margin-top:2px;color:var(--editorial-muted);font-size:.74rem}
        .editor-session__chevron{color:var(--editorial-muted);font-size:.82rem}
        .editor-session__menu{position:absolute;z-index:65;top:calc(100% + 8px);right:0;width:250px;padding:9px;border:1px solid var(--editorial-line);border-radius:13px;background:#fff;box-shadow:0 18px 42px rgb(20 38 58 / 16%)}
        .editor-session__menu>div{padding:11px 12px 13px;border-bottom:1px solid var(--editorial-line)}
        .editor-session__menu strong,.editor-session__menu small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .editor-session__menu strong{color:var(--color-navy);font-size:.87rem}
        .editor-session__menu small{margin-top:3px;color:var(--editorial-muted);font-size:.74rem}
        .editor-session__menu a,.editor-session__menu button{width:100%;min-height:42px;padding:0 12px;display:flex;align-items:center;border:0;border-radius:9px;color:var(--editorial-text);background:transparent;font-size:.82rem;font-weight:700;text-align:left;cursor:pointer}
        .editor-session__menu a:hover,.editor-session__menu button:hover{background:var(--color-ivory)}
        .editor-session__menu button{color:var(--editorial-danger)}
        .editor-session-skeleton{width:188px;height:45px;border-radius:12px;background:linear-gradient(90deg,#eceae5,#f7f6f2,#eceae5);background-size:200% 100%;animation:session-loading 1.2s infinite}
        @keyframes session-loading{to{background-position:-200% 0}}
        @media(max-width:620px){.editor-session__identity,.editor-session__chevron{display:none}.editor-session__trigger{padding:4px}.editor-session__menu{right:-4px}.editor-session-skeleton{width:42px}}
      `}</style>
    </div>
  );
}
