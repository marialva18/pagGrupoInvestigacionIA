import { richTextBodySchema } from '@intgarti/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';
import { richTextToParagraphs } from '../lib/rich-text';

const statusSchema = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'SCHEDULED',
  'PUBLISHED',
  'ARCHIVED',
]);

const publicationSummarySchema = z.object({
  id: z.string().uuid(),
  status: statusSchema,
  slug: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  featured: z.boolean(),
  origin: z.enum(['INTERNAL', 'EXTERNAL']).default('INTERNAL'),
  sourceName: z.string().nullable().optional(),
  lockVersion: z.number(),
  scheduledAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  expiresAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const publicationListSchema = z.object({
  items: z.array(publicationSummarySchema),
  pagination: z.object({ total: z.number() }).passthrough(),
  filters: z.unknown().optional(),
});

const publicationDetailSchema = z
  .object({
    id: z.string().uuid(),
    status: statusSchema,
    slug: z.string(),
    title: z.string(),
    summary: z.string().nullable(),
    body: richTextBodySchema,
    featured: z.boolean(),
    lockVersion: z.number(),
    expiresAt: z.string().nullable().optional(),
    publishedAt: z.string().nullable(),
    archivedAt: z.string().nullable(),
  })
  .passthrough();

const publicationActionSchema = z
  .object({
    id: z.string().uuid(),
    status: statusSchema,
    featured: z.boolean(),
    lockVersion: z.number().optional(),
  })
  .passthrough();

type PublicationSummary = z.infer<typeof publicationSummarySchema>;
type PublicationDetail = z.infer<typeof publicationDetailSchema>;

type FormMode = 'create' | 'edit';

type PublicationFormState = {
  title: string;
  summary: string;
  bodyText: string;
  origin: 'INTERNAL' | 'EXTERNAL';
  sourceName: string;
  sourceType: string;
  externalUrl: string;
  originalTitle: string;
  publishNow: boolean;
  featured: boolean;
  expiresAt: string;
};

const emptyForm: PublicationFormState = {
  title: '',
  summary: '',
  bodyText: '',
  origin: 'INTERNAL',
  sourceName: '',
  sourceType: 'NEWS_MEDIA',
  externalUrl: '',
  originalTitle: '',
  publishNow: false,
  featured: false,
  expiresAt: '',
};

function toTiptapBody(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  return {
    schemaVersion: 1 as const,
    editor: 'tiptap' as const,
    document: {
      type: 'doc' as const,
      content: paragraphs.map((paragraph) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: paragraph }],
      })),
    },
  };
}

function toLocalDateTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function statusLabel(status: PublicationSummary['status']): string {
  const labels: Record<PublicationSummary['status'], string> = {
    DRAFT: 'Borrador',
    IN_REVIEW: 'En revisión',
    CHANGES_REQUESTED: 'Con observaciones',
    APPROVED: 'Aprobada',
    SCHEDULED: 'Programada',
    PUBLISHED: 'Publicada',
    ARCHIVED: 'Archivada',
  };
  return labels[status];
}

function statusClass(status: PublicationSummary['status']): string {
  if (status === 'PUBLISHED') return 'editorial-status--success';
  if (status === 'ARCHIVED') return 'editorial-status--danger';
  if (status === 'DRAFT' || status === 'SCHEDULED') return 'editorial-status--warning';
  return 'editorial-status--accent';
}

export default function PublicationManager() {
  const [items, setItems] = useState<PublicationSummary[]>([]);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editing, setEditing] = useState<PublicationDetail | null>(null);
  const [form, setForm] = useState<PublicationFormState>(emptyForm);

  async function loadPublications(token: string) {
    const result = await apiRequest('/editor/news?page=1&pageSize=100', publicationListSchema, {
      accessToken: token,
    });
    setItems(result.items);
  }

  useEffect(() => {
    const token = getEditorAccessToken();
    if (!token) return;

    void loadPublications(token)
      .then(async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') === '1') {
          openCreate();
          return;
        }
        const editId = params.get('edit');
        if (editId) await openEdit(editId);
      })
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error ? error.message : 'No fue posible cargar las publicaciones.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesStatus = status === 'ALL' || item.status === status;
      const matchesQuery =
        !normalized ||
        `${item.title} ${item.summary ?? ''} ${item.sourceName ?? ''}`
          .toLowerCase()
          .includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [items, query, status]);

  function token(): string | null {
    const accessToken = getEditorAccessToken();
    if (!accessToken) setMessage('La sesión editorial no está disponible.');
    return accessToken;
  }

  function openCreate() {
    setFormMode('create');
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  async function openEdit(id: string) {
    const accessToken = token();
    if (!accessToken) return;
    setBusyId(id);
    try {
      const detail = await apiRequest(`/editor/news/${id}`, publicationDetailSchema, {
        accessToken,
      });
      setEditing(detail);
      setFormMode('edit');
      setForm({
        ...emptyForm,
        title: detail.title,
        summary: detail.summary ?? '',
        bodyText: richTextToParagraphs(detail.body).join('\n\n'),
        featured: detail.featured,
        expiresAt: toLocalDateTime(detail.expiresAt),
      });
      setFormOpen(true);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible abrir la publicación.');
    } finally {
      setBusyId(null);
    }
  }

  function closeForm() {
    setFormOpen(false);
    setEditing(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('new');
    url.searchParams.delete('edit');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }

  function updateField<K extends keyof PublicationFormState>(
    key: K,
    value: PublicationFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = token();
    if (!accessToken) return;

    setBusyId('form');
    setMessage('');

    try {
      if (formMode === 'create') {
        await apiRequest('/editor/news', publicationActionSchema, {
          method: 'POST',
          accessToken,
          body: JSON.stringify({
            title: form.title.trim(),
            summary: form.summary.trim(),
            body: toTiptapBody(form.bodyText),
            categoryIds: [],
            coverMediaId: null,
            origin: form.origin,
            externalUrl: form.origin === 'EXTERNAL' ? form.externalUrl.trim() : null,
            sourceName: form.origin === 'EXTERNAL' ? form.sourceName.trim() : null,
            sourceType: form.origin === 'EXTERNAL' ? form.sourceType : null,
            originalTitle: form.origin === 'EXTERNAL' ? form.originalTitle.trim() || null : null,
            publishNow: form.publishNow,
            featured: form.publishNow && form.featured,
            expiresAt: fromLocalDateTime(form.expiresAt),
          }),
        });
        setMessage('Publicación creada correctamente.');
      } else if (editing) {
        await apiRequest(`/editor/news/${editing.id}`, z.unknown(), {
          method: 'PATCH',
          accessToken,
          body: JSON.stringify({
            lockVersion: editing.lockVersion,
            changeSummary: 'Actualización realizada desde el panel editorial.',
            title: form.title.trim(),
            summary: form.summary.trim(),
            body: toTiptapBody(form.bodyText),
            expiresAt: fromLocalDateTime(form.expiresAt),
          }),
        });
        setMessage('Cambios guardados correctamente.');
      }

      await loadPublications(accessToken);
      closeForm();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la publicación.');
    } finally {
      setBusyId(null);
    }
  }

  async function runAction(
    item: PublicationSummary,
    action: 'publish' | 'unpublish' | 'featured' | 'archive' | 'restore',
  ) {
    const accessToken = token();
    if (!accessToken) return;

    if (
      action === 'archive' &&
      !window.confirm(`¿Archivar “${item.title}”? Dejará de aparecer en el sitio público.`)
    )
      return;
    if (action === 'restore' && !window.confirm(`¿Restaurar “${item.title}” como borrador?`))
      return;

    setBusyId(item.id);
    setMessage('');

    try {
      if (action === 'publish') {
        await apiRequest(`/editor/news/${item.id}/publish`, publicationActionSchema, {
          method: 'POST',
          accessToken,
          body: JSON.stringify({}),
        });
        setMessage('Publicación visible en el sitio.');
      }

      if (action === 'unpublish') {
        await apiRequest(`/editor/news/${item.id}/unpublish`, publicationActionSchema, {
          method: 'POST',
          accessToken,
          body: JSON.stringify({ lockVersion: item.lockVersion }),
        });
        setMessage('La publicación volvió a borrador.');
      }

      if (action === 'featured') {
        await apiRequest(`/editor/news/${item.id}/featured`, publicationActionSchema, {
          method: 'PATCH',
          accessToken,
          body: JSON.stringify({ featured: !item.featured }),
        });
        setMessage(
          item.featured
            ? 'La publicación dejó de ser destacada.'
            : 'Publicación marcada como destacada.',
        );
      }

      if (action === 'archive') {
        await apiRequest(`/editor/news/${item.id}`, publicationActionSchema, {
          method: 'DELETE',
          accessToken,
          body: JSON.stringify({
            lockVersion: item.lockVersion,
            reason: 'Publicación archivada desde el panel editorial.',
          }),
        });
        setMessage('Publicación archivada.');
      }

      if (action === 'restore') {
        await apiRequest(`/editor/news/${item.id}/restore`, publicationActionSchema, {
          method: 'POST',
          accessToken,
          body: JSON.stringify({
            lockVersion: item.lockVersion,
            reason: 'Publicación restaurada desde el panel editorial.',
          }),
        });
        setMessage('Publicación restaurada como borrador.');
      }

      await loadPublications(accessToken);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible completar la acción.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="publication-manager">
      <EditorialLoadingOverlay
        visible={loading || busyId !== null}
        label={loading ? 'Cargando publicaciones…' : 'Procesando publicación…'}
      />
      <section className="publication-toolbar editorial-card">
        <div className="publication-search">
          <span aria-hidden="true"></span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setQuery(searchInput.trim());
            }}
            placeholder="Buscar por título, resumen o fuente"
            aria-label="Buscar publicaciones"
          />
        </div>
        <button
          className="editorial-button editorial-button--secondary"
          type="button"
          onClick={() => setQuery(searchInput.trim())}
        >
          Buscar
        </button>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="ALL">Todos los estados</option>
          <option value="DRAFT">Borradores</option>
          <option value="PUBLISHED">Publicadas</option>
          <option value="SCHEDULED">Programadas</option>
          <option value="ARCHIVED">Archivadas</option>
        </select>
        <button className="editorial-button" type="button" onClick={openCreate}>
          Nueva publicación
        </button>
      </section>

      <section className="editorial-card publication-list-card">
        <header className="editorial-card__header">
          <div>
            <h2>Publicaciones</h2>
            <p>
              {filtered.length} de {items.length} registros visibles
            </p>
          </div>
        </header>

        <div className="publication-table-wrap">
          <table className="publication-table">
            <thead>
              <tr>
                <th>Publicación</th>
                <th>Estado</th>
                <th>Publicación / caducidad</th>
                <th>Actualización</th>
                <th aria-label="Acciones"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="publication-title-cell">
                      <span className="publication-origin">
                        {item.origin === 'EXTERNAL' ? 'EXT' : 'INT'}
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <small>
                          {item.sourceName ?? 'INTGARTI'}
                          {item.featured ? ' · Destacada' : ''}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`editorial-status ${statusClass(item.status)}`}>
                      {statusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <small className="publication-date">{formatDate(item.publishedAt)}</small>
                    {item.expiresAt && (
                      <small className="publication-expiry">
                        Caduca {formatDate(item.expiresAt)}
                      </small>
                    )}
                  </td>
                  <td>
                    <small className="publication-date">{formatDate(item.updatedAt)}</small>
                  </td>
                  <td>
                    <div className="publication-actions">
                      <button
                        type="button"
                        onClick={() => openEdit(item.id)}
                        disabled={busyId !== null}
                      >
                        Editar
                      </button>
                      {item.status !== 'PUBLISHED' && item.status !== 'ARCHIVED' && (
                        <button
                          type="button"
                          onClick={() => runAction(item, 'publish')}
                          disabled={busyId !== null}
                        >
                          Publicar
                        </button>
                      )}
                      {item.status === 'PUBLISHED' && (
                        <button
                          type="button"
                          onClick={() => runAction(item, 'featured')}
                          disabled={busyId !== null}
                        >
                          {item.featured ? 'No destacar' : 'Destacar'}
                        </button>
                      )}
                      {item.status === 'PUBLISHED' && (
                        <button
                          type="button"
                          onClick={() => runAction(item, 'unpublish')}
                          disabled={busyId !== null}
                        >
                          Despublicar
                        </button>
                      )}
                      {item.status !== 'ARCHIVED' ? (
                        <button
                          className="is-danger"
                          type="button"
                          onClick={() => runAction(item, 'archive')}
                          disabled={busyId !== null}
                        >
                          Archivar
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => runAction(item, 'restore')}
                          disabled={busyId !== null}
                        >
                          Restaurar
                        </button>
                      )}
                      {item.status === 'PUBLISHED' && (
                        <a
                          href={`/noticias/${item.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Ver ↗
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="editorial-empty">No hay publicaciones que coincidan con los filtros.</p>
          )}
        </div>
      </section>

      {formOpen && (
        <div
          className="publication-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publication-form-title"
        >
          <button
            className="publication-modal__backdrop"
            type="button"
            onClick={closeForm}
            aria-label="Cerrar formulario"
          ></button>
          <section className="publication-modal__panel">
            <header>
              <div>
                <span>{formMode === 'create' ? 'Nueva publicación' : 'Editar publicación'}</span>
                <h2 id="publication-form-title">
                  {formMode === 'create' ? 'Crear contenido' : 'Actualizar contenido'}
                </h2>
              </div>
              <button type="button" onClick={closeForm} aria-label="Cerrar">
                ×
              </button>
            </header>

            <form onSubmit={submitForm}>
              <div className="publication-form-grid">
                <label className="editorial-field publication-form-wide">
                  Título
                  <input
                    value={form.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    minLength={5}
                    maxLength={220}
                    required
                  />
                </label>
                <label className="editorial-field publication-form-wide">
                  Resumen
                  <textarea
                    value={form.summary}
                    onChange={(event) => updateField('summary', event.target.value)}
                    rows={3}
                    minLength={20}
                    maxLength={600}
                    required
                  />
                </label>
                <label className="editorial-field publication-form-wide">
                  Contenido
                  <textarea
                    value={form.bodyText}
                    onChange={(event) => updateField('bodyText', event.target.value)}
                    rows={8}
                    placeholder="Separa los párrafos con una línea en blanco."
                    required
                  />
                </label>

                {formMode === 'create' && (
                  <>
                    <label className="editorial-field">
                      Procedencia
                      <select
                        value={form.origin}
                        onChange={(event) =>
                          updateField('origin', event.target.value as 'INTERNAL' | 'EXTERNAL')
                        }
                      >
                        <option value="INTERNAL">Contenido INTGARTI</option>
                        <option value="EXTERNAL">Publicación externa manual</option>
                      </select>
                    </label>
                    <label className="editorial-field">
                      Tipo de fuente
                      <select
                        value={form.sourceType}
                        onChange={(event) => updateField('sourceType', event.target.value)}
                        disabled={form.origin === 'INTERNAL'}
                      >
                        <option value="NEWS_MEDIA">Medio periodístico</option>
                        <option value="NEWS_AGENCY">Agencia de noticias</option>
                        <option value="UNIVERSITY">Universidad</option>
                        <option value="ACADEMIC">Académica</option>
                        <option value="CORPORATE_RESEARCH">Investigación corporativa</option>
                        <option value="CORPORATE_BLOG">Blog corporativo</option>
                        <option value="GOVERNMENT">Institución pública</option>
                        <option value="OTHER">Otra</option>
                      </select>
                    </label>
                    {form.origin === 'EXTERNAL' && (
                      <>
                        <label className="editorial-field">
                          Nombre de la fuente
                          <input
                            value={form.sourceName}
                            onChange={(event) => updateField('sourceName', event.target.value)}
                            required
                          />
                        </label>
                        <label className="editorial-field">
                          URL original
                          <input
                            type="url"
                            value={form.externalUrl}
                            onChange={(event) => updateField('externalUrl', event.target.value)}
                            required
                          />
                        </label>
                        <label className="editorial-field publication-form-wide">
                          Título original
                          <input
                            value={form.originalTitle}
                            onChange={(event) => updateField('originalTitle', event.target.value)}
                          />
                        </label>
                      </>
                    )}
                  </>
                )}

                <label className="editorial-field publication-form-wide">
                  Caducidad opcional
                  <input
                    type="datetime-local"
                    value={form.expiresAt}
                    onChange={(event) => updateField('expiresAt', event.target.value)}
                  />
                  <small>
                    Al llegar esta fecha, el worker archivará la publicación automáticamente.
                  </small>
                </label>

                {formMode === 'create' && (
                  <div className="publication-form-options publication-form-wide">
                    <label>
                      <input
                        type="checkbox"
                        checked={form.publishNow}
                        onChange={(event) => updateField('publishNow', event.target.checked)}
                      />{' '}
                      Publicar ahora
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={form.featured}
                        onChange={(event) => updateField('featured', event.target.checked)}
                        disabled={!form.publishNow}
                      />{' '}
                      Marcar como destacada
                    </label>
                  </div>
                )}
              </div>

              <footer>
                <button
                  className="editorial-button editorial-button--secondary"
                  type="button"
                  onClick={closeForm}
                >
                  Cancelar
                </button>
                <button className="editorial-button" type="submit" disabled={busyId === 'form'}>
                  {busyId === 'form'
                    ? 'Guardando…'
                    : formMode === 'create'
                      ? 'Crear publicación'
                      : 'Guardar cambios'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      <EditorialToast message={message} onClose={() => setMessage('')} />

      <style>{`
        .publication-manager { display: grid; gap: 18px; }
        .publication-toolbar { padding: 14px; display: grid; grid-template-columns: minmax(280px,1fr) auto 190px auto; gap: 10px; box-shadow: none; }
        .publication-toolbar > select { min-height: 42px; padding: 0 11px; border: 1px solid var(--editorial-line); border-radius: 10px; color: var(--editorial-text); background: white; font-size: .88rem; }
        .publication-search { min-height: 42px; display: flex; align-items: center; border: 1px solid var(--editorial-line); border-radius: 10px; background: white; }
        .publication-search span { position: relative; width: 38px; height: 38px; }
        .publication-search span::before { content:''; position:absolute; width:10px; height:10px; left:12px; top:10px; border:1.6px solid var(--editorial-muted); border-radius:50%; }
        .publication-search span::after { content:''; position:absolute; width:6px; left:22px; top:22px; border-top:1.6px solid var(--editorial-muted); transform:rotate(45deg); }
        .publication-search input { min-width:0; flex:1; height:40px; padding:0 12px 0 0; border:0; outline:0; background:transparent; font-size:.9rem; }
        .publication-list-card { overflow: hidden; }
        .publication-help { color: var(--editorial-muted); font-size:.88rem; }
        .publication-table-wrap { overflow-x:auto; }
        .publication-table { width:100%; border-collapse:collapse; min-width:930px; }
        .publication-table th { padding:11px 18px; color:var(--editorial-muted); background:#faf9f6; font-size:.83rem; font-weight:700; letter-spacing:.05em; text-align:left; text-transform:uppercase; }
        .publication-table td { padding:15px 18px; border-top:1px solid var(--editorial-line); vertical-align:middle; }
        .publication-title-cell { display:flex; align-items:center; gap:11px; min-width:260px; }
        .publication-origin { width:34px; height:34px; flex:0 0 34px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; color:var(--editorial-accent); background:var(--editorial-accent-soft); font-size:.81rem; font-weight:800; }
        .publication-title-cell strong,.publication-title-cell small { display:block; max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .publication-title-cell strong { color:var(--color-navy); font-size:.9rem; }
        .publication-title-cell small { margin-top:4px; color:var(--editorial-muted); font-size:.86rem; }
        .publication-date,.publication-expiry { display:block; color:var(--editorial-muted); font-size:.88rem; white-space:nowrap; }
        .publication-expiry { margin-top:4px; color:var(--editorial-warning); font-weight:700; }
        .publication-actions { display:flex; justify-content:flex-end; gap:7px; flex-wrap:wrap; }
        .publication-actions button,.publication-actions a { min-height:36px; padding:0 11px; display:inline-flex; align-items:center; border:1px solid var(--editorial-line); border-radius:7px; color:var(--color-navy); background:white; font-size:.83rem; font-weight:750; white-space:nowrap; cursor:pointer; }
        .publication-actions button:hover,.publication-actions a:hover { border-color:rgb(119 37 54 / 35%); color:var(--editorial-accent); }
        .publication-actions .is-danger { color:var(--editorial-danger); }
        .publication-modal { position:fixed; z-index:70; inset:0; display:flex; align-items:stretch; justify-content:flex-end; }
        .publication-modal__backdrop { position:absolute; inset:0; border:0; background:rgb(13 25 37 / 48%); backdrop-filter:blur(2px); }
        .publication-modal__panel { position:relative; width:min(720px,100%); height:100%; overflow-y:auto; background:white; box-shadow:-20px 0 50px rgb(13 25 37 / 16%); animation:publication-panel-in 220ms ease both; }
        @keyframes publication-panel-in { from{transform:translateX(36px);opacity:0} }
        .publication-modal__panel > header { position:sticky; z-index:2; top:0; padding:22px 26px; display:flex; align-items:flex-start; justify-content:space-between; gap:18px; border-bottom:1px solid var(--editorial-line); background:rgb(255 255 255 / 94%); backdrop-filter:blur(12px); }
        .publication-modal__panel > header span { color:var(--editorial-accent); font-size:.85rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
        .publication-modal__panel > header h2 { margin:5px 0 0; color:var(--color-navy); font-family:var(--font-body); font-size:1.2rem; }
        .publication-modal__panel > header button { border:0; color:var(--editorial-muted); background:transparent; font-size:1.7rem; cursor:pointer; }
        .publication-modal__panel form { padding:24px 26px; }
        .publication-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; }
        .publication-form-wide { grid-column:1/-1; }
        .publication-form-wide small { color:var(--editorial-muted); font-size:.86rem; font-weight:400; }
        .publication-form-options { display:flex; flex-wrap:wrap; gap:18px; padding:4px 0; color:var(--editorial-text); font-size:.83rem; font-weight:600; }
        .publication-form-options label { display:inline-flex; align-items:center; gap:7px; }
        .publication-form-options input { accent-color:var(--editorial-accent); }
        .publication-modal footer { margin-top:24px; padding-top:18px; display:flex; justify-content:flex-end; gap:9px; border-top:1px solid var(--editorial-line); }
        @media(max-width:950px){.publication-toolbar{grid-template-columns:1fr 1fr}.publication-search{grid-column:1/-1}.publication-toolbar .editorial-button{width:100%}}
        @media(max-width:560px){.publication-toolbar{grid-template-columns:1fr}.publication-search{grid-column:auto}.publication-form-grid{grid-template-columns:1fr}.publication-form-wide{grid-column:auto}.publication-modal__panel form,.publication-modal__panel>header{padding-inline:18px}}
      `}</style>
    </div>
  );
}
