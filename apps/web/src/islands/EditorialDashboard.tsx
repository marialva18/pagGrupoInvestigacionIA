import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';
import { externalNewsItemListSchema, externalNewsSourceListSchema } from '@intgarti/contracts';

const newsListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      slug: z.string(),
      status: z.enum([
        'DRAFT',
        'IN_REVIEW',
        'CHANGES_REQUESTED',
        'APPROVED',
        'SCHEDULED',
        'PUBLISHED',
        'ARCHIVED',
      ]),
      featured: z.boolean(),
      publishedAt: z.string().nullable(),
      expiresAt: z.string().nullable().optional(),
      updatedAt: z.string(),
    }),
  ),
  pagination: z.object({ total: z.number() }).passthrough(),
});

const sessionSchema = z.object({
  user: z.object({
    displayName: z.string(),
    role: z.enum(['ADMIN', 'EDITOR']),
  }),
});

const usersSchema = z.object({
  items: z.array(z.unknown()),
  pagination: z.object({ total: z.number() }).passthrough(),
});

type DashboardState = {
  news: z.infer<typeof newsListSchema>;
  candidates: z.infer<typeof externalNewsItemListSchema>;
  sources: z.infer<typeof externalNewsSourceListSchema>;
  users: number | null;
  role: 'ADMIN' | 'EDITOR';
  displayName: string;
};

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    DRAFT: 'Borrador',
    IN_REVIEW: 'En revisión',
    CHANGES_REQUESTED: 'Con observaciones',
    APPROVED: 'Aprobada',
    SCHEDULED: 'Programada',
    PUBLISHED: 'Publicada',
    ARCHIVED: 'Archivada',
  };
  return labels[status] ?? status;
}

function statusClass(status: string): string {
  if (status === 'PUBLISHED') return 'editorial-status--success';
  if (status === 'ARCHIVED') return 'editorial-status--danger';
  if (status === 'DRAFT' || status === 'SCHEDULED') return 'editorial-status--warning';
  return 'editorial-status--accent';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export default function EditorialDashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = getEditorAccessToken();
    if (!token) return;

    void (async () => {
      const [session, news, candidates, sources] = await Promise.all([
        apiRequest('/auth/session', sessionSchema, { accessToken: token }),
        apiRequest('/editor/news?page=1&pageSize=6', newsListSchema, { accessToken: token }),
        apiRequest(
          '/editor/external-news?page=1&pageSize=6&status=DISCOVERED',
          externalNewsItemListSchema,
          { accessToken: token },
        ),
        apiRequest('/editor/news-sources', externalNewsSourceListSchema, { accessToken: token }),
      ]);

      let users: number | null = null;
      if (session.user.role === 'ADMIN') {
        const userResult = await apiRequest('/admin/users?page=1&pageSize=1', usersSchema, {
          accessToken: token,
        });
        users = userResult.pagination.total;
      }

      setData({
        news,
        candidates,
        sources,
        users,
        role: session.user.role,
        displayName: session.user.displayName,
      });
    })().catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : 'No fue posible cargar el resumen.');
    });
  }, []);

  const published = useMemo(
    () => data?.news.items.filter((item) => item.status === 'PUBLISHED').length ?? 0,
    [data],
  );

  const expiringSoon = useMemo(() => {
    if (!data) return 0;
    const limit = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return data.news.items.filter((item) => {
      if (!item.expiresAt) return false;
      const value = new Date(item.expiresAt).getTime();
      return value > Date.now() && value <= limit;
    }).length;
  }, [data]);

  if (!data && !message) {
    return (
      <div className="dashboard-loading">
        <div></div>
        <div></div>
        <div></div>
        <div></div>
        <style>{`
          .dashboard-loading { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
          .dashboard-loading div { height: 118px; border-radius: 16px; background: linear-gradient(90deg,#e8e6e1,#f8f7f4,#e8e6e1); background-size: 200% 100%; animation: dash-loading 1.2s infinite; }
          @keyframes dash-loading { to { background-position: -200% 0; } }
          @media(max-width:900px){.dashboard-loading{grid-template-columns:repeat(2,1fr)}}
        `}</style>
      </div>
    );
  }

  if (!data) {
    return (
      <>
        <div className="editorial-card editorial-empty">No fue posible cargar el resumen.</div>
        <EditorialToast message={message} onClose={() => setMessage('')} />
      </>
    );
  }

  const metrics = [
    {
      label: 'Publicaciones',
      value: data.news.pagination.total,
      note: `${published} publicadas en la vista reciente`,
      href: '/editor/publicaciones',
    },
    {
      label: 'Por revisar',
      value: data.candidates.pagination.total,
      note: 'Noticias externas pendientes',
      href: '/editor/descubrimiento',
    },
    {
      label: 'Fuentes activas',
      value: data.sources.summary.active,
      note: `${data.sources.summary.paused} pausadas`,
      href: '/editor/fuentes-noticias',
    },
    data.role === 'ADMIN'
      ? {
          label: 'Usuarios',
          value: data.users ?? 0,
          note: 'Administradores y editores',
          href: '/admin/usuarios',
        }
      : {
          label: 'Caducan pronto',
          value: expiringSoon,
          note: 'Durante los próximos 7 días',
          href: '/editor/publicaciones',
        },
  ];

  return (
    <div className="dashboard">
      <section className="dashboard-welcome">
        <div>
          <span>Resumen de trabajo</span>
          <h2>Hola, {data.displayName.split(' ')[0]}.</h2>
          <p>Estas son las tareas y publicaciones que requieren atención.</p>
        </div>
        <div className="dashboard-welcome__actions">
          <a className="editorial-button editorial-button--secondary" href="/editor/descubrimiento">
            Revisar candidatas
          </a>
          <a className="editorial-button" href="/editor/publicaciones?new=1">
            Nueva publicación
          </a>
        </div>
      </section>

      <section className="dashboard-metrics">
        {metrics.map((metric) => (
          <a className="dashboard-metric editorial-card" href={metric.href} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </a>
        ))}
      </section>

      <section className="dashboard-grid">
        <article className="editorial-card">
          <header className="editorial-card__header">
            <div>
              <h2>Publicaciones recientes</h2>
              <p>Últimos cambios realizados en el contenido.</p>
            </div>
            <a href="/editor/publicaciones">Ver todas</a>
          </header>
          <div className="dashboard-list">
            {data.news.items.length === 0 ? (
              <p className="editorial-empty">Todavía no hay publicaciones.</p>
            ) : (
              data.news.items.map((item) => (
                <a
                  href={`/editor/publicaciones?edit=${item.id}`}
                  className="dashboard-list__item"
                  key={item.id}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <small>Actualizada {formatDate(item.updatedAt)}</small>
                  </div>
                  <span className={`editorial-status ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                </a>
              ))
            )}
          </div>
        </article>

        <article className="editorial-card">
          <header className="editorial-card__header">
            <div>
              <h2>Estado de fuentes</h2>
              <p>Salud de la recolección automática.</p>
            </div>
            <a href="/editor/fuentes-noticias">Gestionar</a>
          </header>
          <div className="dashboard-list">
            {data.sources.items.slice(0, 6).map((source) => (
              <a href="/editor/fuentes-noticias" className="dashboard-list__item" key={source.id}>
                <div>
                  <strong>{source.name}</strong>
                  <small>
                    {source.lastSyncMessage ?? `Próxima búsqueda: ${formatDate(source.nextSyncAt)}`}
                  </small>
                </div>
                <span
                  className={`editorial-status ${source.status === 'ACTIVE' ? 'editorial-status--success' : 'editorial-status--warning'}`}
                >
                  {source.status === 'ACTIVE' ? 'Activa' : 'Pausada'}
                </span>
              </a>
            ))}
          </div>
        </article>
      </section>

      <EditorialToast message={message} onClose={() => setMessage('')} />

      <style>{`
        .dashboard { display: grid; gap: 20px; }
        .dashboard-welcome { min-height: 112px; padding: 24px 26px; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-radius: 16px; color: white; background: var(--color-navy); }
        .dashboard-welcome span { color: #d8bd89; font-size: .76rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
        .dashboard-welcome h2 { margin: 5px 0 3px; color: white; font-family: var(--font-body); font-size: 1.65rem; }
        .dashboard-welcome p { margin: 0; color: rgb(255 255 255 / 62%); font-size: .9rem; }
        .dashboard-welcome__actions { display: flex; gap: 9px; }
        .dashboard-welcome .editorial-button--secondary { border-color: rgb(255 255 255 / 24%); color: white; background: rgb(255 255 255 / 8%); }
        .dashboard-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
        .dashboard-metric { padding: 19px 20px; display: grid; gap: 4px; transition: transform 150ms ease, border-color 150ms ease; }
        .dashboard-metric:hover { transform: translateY(-2px); border-color: rgb(119 37 54 / 30%); }
        .dashboard-metric > span { color: var(--editorial-muted); font-size: .8rem; font-weight: 700; }
        .dashboard-metric strong { color: var(--color-navy); font-size: 1.72rem; line-height: 1.1; }
        .dashboard-metric small { color: var(--editorial-muted); font-size: .9rem; }
        .dashboard-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 18px; }
        .editorial-card__header a { color: var(--editorial-accent); font-size: .82rem; font-weight: 700; }
        .dashboard-list { padding: 5px 18px 12px; }
        .dashboard-list__item { min-height: 66px; padding: 12px 4px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid var(--editorial-line); }
        .dashboard-list__item:last-child { border-bottom: 0; }
        .dashboard-list__item strong, .dashboard-list__item small { display: block; }
        .dashboard-list__item strong { max-width: 520px; overflow: hidden; color: var(--color-navy); font-size: .9rem; text-overflow: ellipsis; white-space: nowrap; }
        .dashboard-list__item small { max-width: 520px; margin-top: 4px; overflow: hidden; color: var(--editorial-muted); font-size: .9rem; text-overflow: ellipsis; white-space: nowrap; }
        @media(max-width:1100px){.dashboard-metrics{grid-template-columns:repeat(2,1fr)}.dashboard-grid{grid-template-columns:1fr}}
        @media(max-width:680px){.dashboard-welcome{align-items:flex-start;flex-direction:column}.dashboard-welcome__actions{width:100%;flex-wrap:wrap}.dashboard-metrics{grid-template-columns:1fr 1fr}.dashboard-list__item{align-items:flex-start;flex-direction:column}.dashboard-list__item strong,.dashboard-list__item small{max-width:72vw}}
        @media(max-width:430px){.dashboard-metrics{grid-template-columns:1fr}}
      `}</style>
    </div>
  );
}
