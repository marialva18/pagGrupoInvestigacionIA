import { cmsUserSchema, type CmsUser, type UserRole, type UserStatus } from '@intgarti/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';

const userListSchema = z.object({
  items: z.array(cmsUserSchema),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasPreviousPage: z.boolean(),
    hasNextPage: z.boolean(),
  }),
});

const userMutationSchema = z.object({ user: cmsUserSchema });

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  EDITOR: 'Editor',
};

const statusLabels: Record<UserStatus, string> = {
  INVITED: 'Invitado',
  ACTIVE: 'Activo',
  SUSPENDED: 'Suspendido',
  DISABLED: 'Deshabilitado',
};

function statusClass(status: UserStatus): string {
  if (status === 'ACTIVE') return 'editorial-status--success';
  if (status === 'INVITED') return 'editorial-status--warning';
  return 'editorial-status--danger';
}

function formatDate(value: string | null): string {
  if (!value) return 'Nunca';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function UserManager() {
  const [users, setUsers] = useState<CmsUser[]>([]);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserStatus>('ALL');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<CmsUser | null>(null);

  const counts = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === 'ACTIVE').length,
      invited: users.filter((user) => user.status === 'INVITED').length,
      administrators: users.filter((user) => user.role === 'ADMIN').length,
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesQuery =
        !normalized || `${user.displayName} ${user.email}`.toLowerCase().includes(normalized);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || user.status === statusFilter;
      return matchesQuery && matchesRole && matchesStatus;
    });
  }, [query, roleFilter, statusFilter, users]);

  async function loadUsers(token: string) {
    const result = await apiRequest('/admin/users?page=1&pageSize=100', userListSchema, {
      accessToken: token,
    });
    setUsers(result.items);
  }

  useEffect(() => {
    const token = getEditorAccessToken();
    if (!token) return;

    void loadUsers(token)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : 'No fue posible cargar los usuarios.');
      })
      .finally(() => setLoading(false));
  }, []);

  async function refreshUsers() {
    const token = getEditorAccessToken();
    if (!token) return;

    setBusyId('refresh');
    try {
      await loadUsers(token);
      setMessage('Lista de usuarios actualizada correctamente.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar los usuarios.');
    } finally {
      setBusyId(null);
    }
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getEditorAccessToken();
    if (!token) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    setBusyId('invite');
    setMessage('');

    try {
      const result = await apiRequest('/admin/users/invitations', userMutationSchema, {
        method: 'POST',
        accessToken: token,
        body: JSON.stringify({
          displayName: String(data.get('displayName') ?? '').trim(),
          email: String(data.get('email') ?? '').trim(),
          role: String(data.get('role') ?? 'EDITOR'),
        }),
      });
      setUsers((current) => [...current, result.user]);
      setInviteOpen(false);
      form.reset();
      setMessage('Invitación enviada correctamente.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible invitar al usuario.');
    } finally {
      setBusyId(null);
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUser) return;
    const token = getEditorAccessToken();
    if (!token) return;

    const data = new FormData(event.currentTarget);
    setBusyId(editingUser.id);
    setMessage('');

    try {
      const result = await apiRequest(`/admin/users/${editingUser.id}`, userMutationSchema, {
        method: 'PATCH',
        accessToken: token,
        body: JSON.stringify({
          displayName: String(data.get('displayName') ?? '').trim(),
          role: String(data.get('role') ?? editingUser.role),
          status: String(data.get('status') ?? editingUser.status),
        }),
      });
      setUsers((current) =>
        current.map((user) => (user.id === result.user.id ? result.user : user)),
      );
      setEditingUser(null);
      setMessage('Usuario actualizado correctamente.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible actualizar el usuario.');
    } finally {
      setBusyId(null);
    }
  }

  async function resendInvitation(user: CmsUser) {
    const token = getEditorAccessToken();
    if (!token) return;
    setBusyId(user.id);
    setMessage('');

    try {
      await apiRequest(`/admin/users/${user.id}/resend-invitation`, userMutationSchema, {
        method: 'POST',
        accessToken: token,
      });
      setMessage(`La invitación fue reenviada a ${user.email}.`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible reenviar la invitación.');
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(user: CmsUser, status: UserStatus) {
    const token = getEditorAccessToken();
    if (!token) return;

    const action =
      status === 'ACTIVE' ? 'activar' : status === 'SUSPENDED' ? 'suspender' : 'deshabilitar';
    if (!window.confirm(`¿Deseas ${action} a ${user.displayName}?`)) return;

    setBusyId(user.id);
    setMessage('');
    try {
      const result = await apiRequest(`/admin/users/${user.id}`, userMutationSchema, {
        method: 'PATCH',
        accessToken: token,
        body: JSON.stringify({ status }),
      });
      setUsers((current) =>
        current.map((item) => (item.id === result.user.id ? result.user : item)),
      );
      setMessage(`Usuario ${statusLabels[status].toLowerCase()} correctamente.`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="user-manager">
      <EditorialLoadingOverlay
        visible={loading || busyId !== null}
        label={loading ? 'Cargando usuarios…' : 'Procesando usuario…'}
      />
      <section className="user-summary">
        <article className="editorial-card">
          <span>Total</span>
          <strong>{counts.total}</strong>
          <small>Usuarios registrados</small>
        </article>
        <article className="editorial-card">
          <span>Activos</span>
          <strong>{counts.active}</strong>
          <small>Con acceso habilitado</small>
        </article>
        <article className="editorial-card">
          <span>Invitados</span>
          <strong>{counts.invited}</strong>
          <small>Pendientes de ingreso</small>
        </article>
        <article className="editorial-card">
          <span>Administradores</span>
          <strong>{counts.administrators}</strong>
          <small>Acceso completo</small>
        </article>
      </section>

      <section className="editorial-card user-list-card">
        <header className="editorial-card__header user-toolbar">
          <div>
            <h2>Usuarios del CMS</h2>
            <p>Gestiona accesos, roles y estados del panel editorial.</p>
          </div>
          <div className="user-toolbar__actions">
            <button
              className="editorial-button editorial-button--secondary"
              type="button"
              onClick={() => void refreshUsers()}
              disabled={busyId !== null}
            >
              ↻ Actualizar
            </button>
            <button className="editorial-button" type="button" onClick={() => setInviteOpen(true)}>
              Invitar usuario
            </button>
          </div>
        </header>

        <div className="user-filters">
          <label className="user-search">
            <span className="editorial-nav__icon icon-search" aria-hidden="true"></span>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setQuery(searchInput.trim());
              }}
              placeholder="Buscar por nombre o correo"
            />
          </label>
          <button
            className="editorial-button editorial-button--secondary user-filter-button"
            type="button"
            onClick={() => setQuery(searchInput.trim())}
          >
            Buscar
          </button>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as typeof roleFilter)}
            aria-label="Filtrar por rol"
          >
            <option value="ALL">Todos los roles</option>
            <option value="ADMIN">Administradores</option>
            <option value="EDITOR">Editores</option>
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
            aria-label="Filtrar por estado"
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Activos</option>
            <option value="INVITED">Invitados</option>
            <option value="SUSPENDED">Suspendidos</option>
            <option value="DISABLED">Deshabilitados</option>
          </select>
        </div>

        {filteredUsers.length === 0 ? (
          <div className="editorial-empty">No hay usuarios que coincidan con los filtros.</div>
        ) : (
          <div className="user-table-wrap">
            <table className="user-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Último acceso</th>
                  <th aria-label="Acciones"></th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-identity">
                        <span className="user-avatar">{initials(user.displayName)}</span>
                        <span>
                          <strong>{user.displayName}</strong>
                          <small>{user.email}</small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="user-role">{roleLabels[user.role]}</span>
                    </td>
                    <td>
                      <span className={`editorial-status ${statusClass(user.status)}`}>
                        {statusLabels[user.status]}
                      </span>
                    </td>
                    <td>
                      <span className="user-date">{formatDate(user.lastLoginAt)}</span>
                    </td>
                    <td>
                      <div className="user-actions">
                        <button
                          type="button"
                          className="editorial-button editorial-button--secondary"
                          onClick={() => setEditingUser(user)}
                        >
                          Editar
                        </button>
                        {user.status === 'INVITED' && (
                          <button
                            type="button"
                            className="editorial-button editorial-button--ghost"
                            disabled={busyId === user.id}
                            onClick={() => void resendInvitation(user)}
                          >
                            Reenviar
                          </button>
                        )}
                        {user.status === 'ACTIVE' && (
                          <button
                            type="button"
                            className="editorial-button editorial-button--ghost"
                            disabled={busyId === user.id}
                            onClick={() => void setStatus(user, 'SUSPENDED')}
                          >
                            Suspender
                          </button>
                        )}
                        {(user.status === 'SUSPENDED' || user.status === 'DISABLED') && (
                          <button
                            type="button"
                            className="editorial-button editorial-button--ghost"
                            disabled={busyId === user.id}
                            onClick={() => void setStatus(user, 'ACTIVE')}
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(inviteOpen || editingUser) && (
        <div
          className="user-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setInviteOpen(false);
              setEditingUser(null);
            }
          }}
        >
          <section
            className="user-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-dialog-title"
          >
            <header>
              <div>
                <span>{editingUser ? 'Configuración' : 'Nuevo acceso'}</span>
                <h2 id="user-dialog-title">{editingUser ? 'Editar usuario' : 'Invitar usuario'}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false);
                  setEditingUser(null);
                }}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <form onSubmit={editingUser ? updateUser : inviteUser}>
              <div className="user-form-grid">
                <label className="editorial-field wide">
                  Nombre completo
                  <input
                    name="displayName"
                    defaultValue={editingUser?.displayName ?? ''}
                    minLength={2}
                    maxLength={160}
                    required
                  />
                </label>
                {!editingUser && (
                  <label className="editorial-field wide">
                    Correo electrónico
                    <input name="email" type="email" maxLength={320} required />
                  </label>
                )}
                <label className="editorial-field">
                  Rol
                  <select name="role" defaultValue={editingUser?.role ?? 'EDITOR'}>
                    <option value="EDITOR">Editor</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </label>
                {editingUser && (
                  <label className="editorial-field">
                    Estado
                    <select name="status" defaultValue={editingUser.status}>
                      <option value="ACTIVE">Activo</option>
                      <option value="INVITED">Invitado</option>
                      <option value="SUSPENDED">Suspendido</option>
                      <option value="DISABLED">Deshabilitado</option>
                    </select>
                  </label>
                )}
              </div>
              <p className="user-form-note">
                {editingUser
                  ? 'Los cambios de rol y estado se registran en auditoría. La API impide desactivar al último administrador.'
                  : 'Supabase enviará un correo de invitación. El registro público continúa deshabilitado.'}
              </p>
              <footer>
                <button
                  className="editorial-button editorial-button--secondary"
                  type="button"
                  onClick={() => {
                    setInviteOpen(false);
                    setEditingUser(null);
                  }}
                >
                  Cancelar
                </button>
                <button
                  className="editorial-button"
                  type="submit"
                  disabled={busyId === (editingUser?.id ?? 'invite')}
                >
                  {busyId ? 'Guardando…' : editingUser ? 'Guardar cambios' : 'Enviar invitación'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      <EditorialToast message={message} onClose={() => setMessage('')} />

      <style>{`
        .user-manager{display:grid;gap:18px;font-family:"Segoe UI","Source Sans 3",Arial,sans-serif}
        .user-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
        .user-summary article{padding:20px 21px;display:grid;gap:5px;box-shadow:none}
        .user-summary span{color:var(--editorial-muted);font-size:.78rem;font-weight:800}
        .user-summary strong{color:var(--color-navy);font-size:1.82rem;line-height:1}
        .user-summary small{color:var(--editorial-muted);font-size:.76rem}
        .user-list-card{overflow:hidden}
        .user-toolbar__actions{display:flex;gap:9px;flex-wrap:wrap}.user-toolbar .editorial-button{min-width:132px}
        .user-filters{padding:15px 20px;display:grid;grid-template-columns:minmax(280px,1fr) auto 190px 190px;gap:10px;border-bottom:1px solid var(--editorial-line);background:#faf9f6}
        .user-filters select,.user-search{min-height:46px;border:1px solid var(--editorial-line);border-radius:10px;background:#fff}
        .user-filters select{padding:0 12px;color:var(--editorial-text);font-size:.86rem}
        .user-search{padding:0 13px;display:flex;align-items:center;gap:10px}
        .user-search input{width:100%;border:0;outline:0;background:transparent;font-size:.9rem}
        .user-filter-button{min-width:88px}
        .user-table-wrap{overflow-x:auto}
        .user-table{width:100%;min-width:920px;border-collapse:collapse}
        .user-table th{padding:12px 20px;color:var(--editorial-muted);background:#faf9f6;font-size:.72rem;letter-spacing:.07em;text-align:left;text-transform:uppercase}
        .user-table td{padding:15px 20px;border-top:1px solid var(--editorial-line);vertical-align:middle}
        .user-identity{min-width:260px;display:flex;align-items:center;gap:12px}
        .user-avatar{width:40px;height:40px;display:grid;place-items:center;border-radius:11px;color:var(--editorial-accent);background:var(--editorial-accent-soft);font-size:.76rem;font-weight:850}
        .user-identity strong,.user-identity small{display:block}
        .user-identity strong{color:var(--color-navy);font-size:.9rem}
        .user-identity small{margin-top:3px;color:var(--editorial-muted);font-size:.78rem}
        .user-role,.user-date{color:var(--editorial-muted);font-size:.82rem;white-space:nowrap}
        .user-actions{display:flex;justify-content:flex-end;gap:7px;flex-wrap:wrap}
        .user-actions .editorial-button{min-height:36px;padding:0 11px;font-size:.74rem}
        .user-modal{position:fixed;z-index:100;inset:0;padding:24px;display:grid;place-items:center;background:rgb(13 25 37 / 56%);backdrop-filter:blur(3px)}
        .user-dialog{width:min(560px,100%);max-height:calc(100vh - 48px);overflow:auto;border:1px solid var(--editorial-line);border-radius:16px;background:#fff;box-shadow:0 30px 80px rgb(0 0 0 / 28%)}
        .user-dialog>header{padding:21px 23px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--editorial-line)}
        .user-dialog>header span{color:var(--editorial-accent);font-size:.69rem;font-weight:850;letter-spacing:.11em;text-transform:uppercase}
        .user-dialog h2{margin:5px 0 0;color:var(--color-navy);font-family:"Segoe UI","Source Sans 3",Arial,sans-serif;font-size:1.28rem}
        .user-dialog>header button{width:38px;height:38px;border:0;border-radius:10px;color:var(--editorial-muted);background:#f2f1ed;font-size:1.45rem;cursor:pointer}
        .user-dialog form{padding:23px}
        .user-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
        .user-form-grid .wide{grid-column:1/-1}
        .user-form-note{margin:18px 0 0;padding:13px 14px;border-radius:10px;color:var(--editorial-muted);background:#f6f4ef;font-size:.79rem;line-height:1.5}
        .user-dialog footer{margin-top:20px;display:flex;justify-content:flex-end;gap:10px}
        @media(max-width:1120px){.user-summary{grid-template-columns:repeat(2,1fr)}.user-filters{grid-template-columns:1fr auto 1fr}.user-search{grid-column:1/-1}}
        @media(max-width:680px){.user-summary{grid-template-columns:1fr 1fr}.user-filters{grid-template-columns:1fr}.user-search{grid-column:auto}.user-filter-button{width:100%}.user-form-grid{grid-template-columns:1fr}.user-form-grid .wide{grid-column:auto}.user-dialog footer{flex-direction:column-reverse}.user-dialog footer .editorial-button{width:100%}}
        @media(max-width:440px){.user-summary{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
