import {
  externalNewsSourceDetectionSchema,
  externalNewsSourceListSchema,
  externalNewsSourceSchema,
  externalNewsSyncResultSchema,
  type ExternalNewsSource,
  type ExternalNewsSourceDetection,
} from '@intgarti/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest, ApiRequestError } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';

const sourceTypeOptions = [
  ['ACADEMIC', 'Fuente académica'],
  ['UNIVERSITY', 'Universidad o centro académico'],
  ['NEWS_AGENCY', 'Agencia de noticias'],
  ['NEWS_MEDIA', 'Medio periodístico'],
  ['CORPORATE_RESEARCH', 'Investigación corporativa'],
  ['CORPORATE_BLOG', 'Blog técnico corporativo'],
  ['GOVERNMENT', 'Institución pública'],
  ['OTHER', 'Otra fuente'],
] as const;

const ingestionMethodOptions = [
  ['AUTO', 'Detección automática (recomendado)'],
  ['RSS', 'RSS fijo'],
  ['ATOM', 'Atom fijo'],
  ['SITEMAP', 'Sitemap fijo'],
  ['HTML', 'Página web HTML'],
  ['MANUAL', 'Carga manual'],
] as const;

const removeResultSchema = z.object({ id: z.string().uuid(), removed: z.boolean() });
const syncAllResultSchema = z.object({
  total: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  results: z.array(z.unknown()),
});

type SourcePayload = {
  name: string;
  domain?: string;
  websiteUrl: string;
  listingUrl: string | null;
  feedUrl: string | null;
  type: string;
  status: 'ACTIVE' | 'PAUSED';
  ingestionMethod: string;
  reviewMode: 'REQUIRED';
  language: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  includeUrlPatterns: string[];
  excludeUrlPatterns: string[];
  minimumRelevanceScore: number;
  maxItemsPerSync: number;
  checkIntervalMinutes: number;
};

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSourcePayload(form: HTMLFormElement): SourcePayload {
  const data = new FormData(form);
  const domain = String(data.get('domain') ?? '').trim();
  const listingUrl = String(data.get('listingUrl') ?? '').trim();
  const feedUrl = String(data.get('feedUrl') ?? '').trim();

  return {
    name: String(data.get('name') ?? '').trim(),
    ...(domain ? { domain } : {}),
    websiteUrl: String(data.get('websiteUrl') ?? '').trim(),
    listingUrl: listingUrl || null,
    feedUrl: feedUrl || null,
    type: String(data.get('type') ?? 'OTHER'),
    status: data.get('active') === 'on' ? 'ACTIVE' : 'PAUSED',
    ingestionMethod: String(data.get('ingestionMethod') ?? 'AUTO'),
    reviewMode: 'REQUIRED',
    language: String(data.get('language') ?? 'es'),
    includeKeywords: splitList(data.get('includeKeywords')),
    excludeKeywords: splitList(data.get('excludeKeywords')),
    includeUrlPatterns: splitList(data.get('includeUrlPatterns')),
    excludeUrlPatterns: splitList(data.get('excludeUrlPatterns')),
    minimumRelevanceScore: Number(data.get('minimumRelevanceScore') ?? 30),
    maxItemsPerSync: Number(data.get('maxItemsPerSync') ?? 15),
    checkIntervalMinutes: Number(data.get('checkIntervalMinutes') ?? 360),
  };
}

function sourceTypeLabel(type: ExternalNewsSource['type']): string {
  return sourceTypeOptions.find(([value]) => value === type)?.[1] ?? type;
}

function methodLabel(method: ExternalNewsSource['ingestionMethod']): string {
  return ingestionMethodOptions.find(([value]) => value === method)?.[1] ?? method;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('es-PE') : 'Sin ejecutar';
}

function formatInterval(minutes: number): string {
  if (minutes < 60) return `Cada ${minutes} min`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Cada día' : `Cada ${days} días`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? 'Cada hora' : `Cada ${hours} h`;
  }
  return `Cada ${minutes} min`;
}

function syncStatusLabel(value: string): string {
  if (value === 'SUCCESS') return 'Correcta';
  if (value === 'FAILED') return 'Con error';
  if (value === 'RUNNING') return 'En proceso';
  return value;
}

function SourceFormFields({ source }: { source?: ExternalNewsSource }) {
  return (
    <>
      <label>
        Nombre
        <input
          name="name"
          defaultValue={source?.name ?? ''}
          placeholder="Ej. Databricks Blog"
          required
        />
      </label>
      <label>
        Dominio aprobado
        <input
          name="domain"
          defaultValue={source?.domain ?? ''}
          placeholder="Se detecta desde la URL si lo dejas vacío"
        />
      </label>
      <label className="wide">
        URL oficial
        <input
          name="websiteUrl"
          type="url"
          defaultValue={source?.websiteUrl ?? ''}
          placeholder="https://www.databricks.com/"
          required
        />
      </label>
      <label className="wide">
        URL donde aparecen las noticias
        <input
          name="listingUrl"
          type="url"
          defaultValue={source?.listingUrl ?? source?.websiteUrl ?? ''}
          placeholder="https://www.databricks.com/es/blog"
        />
        <small>
          Puede ser una portada, categoría, blog, artículo, RSS o sitemap. En automático el sistema
          decide cómo leerla.
        </small>
      </label>
      <label className="wide">
        URL técnica opcional
        <input
          name="feedUrl"
          type="url"
          defaultValue={source?.feedUrl ?? ''}
          placeholder="RSS, Atom o sitemap conocido; puede quedar vacío en automático"
        />
      </label>
      <label>
        Tipo de fuente
        <select name="type" defaultValue={source?.type ?? 'OTHER'}>
          {sourceTypeOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Método
        <select name="ingestionMethod" defaultValue={source?.ingestionMethod ?? 'AUTO'}>
          {ingestionMethodOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Idioma
        <select name="language" defaultValue={source?.language ?? 'es'}>
          <option value="es">Español</option>
          <option value="en">Inglés</option>
          <option value="pt">Portugués</option>
        </select>
      </label>
      <label>
        Frecuencia
        <select
          name="checkIntervalMinutes"
          defaultValue={String(source?.checkIntervalMinutes ?? 360)}
        >
          <option value="30">Cada 30 minutos</option>
          <option value="60">Cada hora</option>
          <option value="120">Cada 2 horas</option>
          <option value="180">Cada 3 horas</option>
          <option value="360">Cada 6 horas</option>
          <option value="720">Cada 12 horas</option>
          <option value="1440">Cada día</option>
        </select>
      </label>
      <label>
        Puntaje mínimo
        <input
          name="minimumRelevanceScore"
          type="number"
          min="0"
          max="100"
          defaultValue={source?.minimumRelevanceScore ?? 30}
        />
      </label>
      <label>
        Máximo por búsqueda
        <input
          name="maxItemsPerSync"
          type="number"
          min="1"
          max="100"
          defaultValue={source?.maxItemsPerSync ?? 15}
        />
      </label>
      <label className="wide">
        Palabras incluidas
        <textarea
          name="includeKeywords"
          defaultValue={source?.includeKeywords.join(', ') ?? ''}
          placeholder="inteligencia artificial, machine learning, generative AI"
        />
      </label>
      <label className="wide">
        Palabras excluidas
        <textarea
          name="excludeKeywords"
          defaultValue={source?.excludeKeywords.join(', ') ?? ''}
          placeholder="promoción, descuento, patrocinado"
        />
      </label>
      <label className="wide">
        Patrones de URL incluidos
        <textarea
          name="includeUrlPatterns"
          defaultValue={source?.includeUrlPatterns.join(', ') ?? ''}
          placeholder="/blog/, /news/, /tecnologia/"
        />
        <small>
          Ayudan a reconocer artículos, pero no son obligatorios. Se aceptan fragmentos o
          expresiones como /\/20\d{2}\//.
        </small>
      </label>
      <label className="wide">
        Patrones de URL excluidos
        <textarea
          name="excludeUrlPatterns"
          defaultValue={source?.excludeUrlPatterns.join(', ') ?? ''}
          placeholder="/events/, /author/, /category/"
        />
      </label>
      <label className="checkbox">
        <input
          name="active"
          type="checkbox"
          defaultChecked={source ? source.status === 'ACTIVE' : true}
        />
        Fuente activa
      </label>
    </>
  );
}

export default function NewsSourcesManager() {
  const [sources, setSources] = useState<ExternalNewsSource[]>([]);
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PAUSED'>('ALL');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<ExternalNewsSource | null>(null);
  const [detection, setDetection] = useState<ExternalNewsSourceDetection | null>(null);

  const activeCount = useMemo(
    () => sources.filter((source) => source.status === 'ACTIVE').length,
    [sources],
  );

  const automaticCount = useMemo(
    () => sources.filter((source) => source.ingestionMethod !== 'MANUAL').length,
    [sources],
  );

  const filteredSources = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return sources.filter((source) => {
      const matchesStatus = statusFilter === 'ALL' || source.status === statusFilter;
      const matchesQuery =
        !normalized ||
        `${source.name} ${source.domain} ${source.type}`.toLowerCase().includes(normalized);
      return matchesStatus && matchesQuery;
    });
  }, [query, sources, statusFilter]);

  async function loadSources(token: string) {
    const result = await apiRequest('/editor/news-sources', externalNewsSourceListSchema, {
      accessToken: token,
    });
    setSources(result.items);
  }

  useEffect(() => {
    const token = getEditorAccessToken();
    if (!token) return;

    void loadSources(token)
      .catch((error: unknown) =>
        setMessage(error instanceof Error ? error.message : 'No fue posible cargar las fuentes.'),
      )
      .finally(() => setLoading(false));
  }, []);

  function token(): string | null {
    const accessToken = getEditorAccessToken();
    if (!accessToken) setMessage('La sesión editorial no está disponible.');
    return accessToken;
  }

  function openCreate() {
    setEditingSource(null);
    setDetection(null);
    setFormOpen(true);
  }

  function openEdit(source: ExternalNewsSource) {
    setEditingSource(source);
    setDetection(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingSource(null);
    setDetection(null);
  }

  async function detectConfiguration(form: HTMLFormElement) {
    const accessToken = token();
    if (!accessToken) return;
    const payload = readSourcePayload(form);
    setBusyId('detect');
    setDetection(null);
    setMessage('');

    try {
      const result = await apiRequest(
        '/editor/news-sources/detect',
        externalNewsSourceDetectionSchema,
        {
          method: 'POST',
          accessToken,
          body: JSON.stringify({ ...payload, maxItemsPerSync: 5 }),
        },
      );
      setDetection(result);
      setMessage(
        `Detección correcta: ${result.strategy}, ${result.accepted} candidatas relevantes.`,
      );
    } catch (error: unknown) {
      const prefix = error instanceof ApiRequestError ? `[${error.code}] ` : '';
      setMessage(
        `${prefix}${error instanceof Error ? error.message : 'No fue posible detectar la fuente.'}`,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const accessToken = token();
    if (!accessToken) return;

    const payload = readSourcePayload(event.currentTarget);
    const id = editingSource?.id ?? 'create';
    setBusyId(id);
    setMessage('');

    try {
      const saved = await apiRequest(
        editingSource ? `/editor/news-sources/${editingSource.id}` : '/editor/news-sources',
        externalNewsSourceSchema,
        {
          method: editingSource ? 'PATCH' : 'POST',
          accessToken,
          body: JSON.stringify(payload),
        },
      );

      setSources((current) => {
        const next = editingSource
          ? current.map((source) => (source.id === saved.id ? saved : source))
          : [...current, saved];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      closeForm();
      setMessage(editingSource ? 'Fuente actualizada.' : 'Fuente guardada correctamente.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible guardar la fuente.');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSource(source: ExternalNewsSource) {
    const accessToken = token();
    if (!accessToken) return;
    setBusyId(source.id);

    try {
      const updated = await apiRequest(
        `/editor/news-sources/${source.id}`,
        externalNewsSourceSchema,
        {
          method: 'PATCH',
          accessToken,
          body: JSON.stringify({ status: source.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }),
        },
      );
      setSources((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(updated.status === 'ACTIVE' ? 'Fuente activada.' : 'Fuente pausada.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible cambiar el estado.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeSource(source: ExternalNewsSource) {
    const accessToken = token();
    if (!accessToken) return;
    if (
      !window.confirm(
        `¿Quitar ${source.name} de las fuentes autorizadas? Las noticias históricas se conservarán.`,
      )
    )
      return;
    setBusyId(source.id);

    try {
      await apiRequest(`/editor/news-sources/${source.id}`, removeResultSchema, {
        method: 'DELETE',
        accessToken,
      });
      setSources((current) => current.filter((item) => item.id !== source.id));
      setMessage('Fuente retirada del catálogo activo.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible quitar la fuente.');
    } finally {
      setBusyId(null);
    }
  }

  async function syncSource(source: ExternalNewsSource) {
    const accessToken = token();
    if (!accessToken) return;
    setBusyId(source.id);

    try {
      const result = await apiRequest(
        `/editor/news-sources/${source.id}/sync`,
        externalNewsSyncResultSchema,
        { method: 'POST', accessToken },
      );
      await loadSources(accessToken);
      setMessage(
        `${result.sourceName}: ${result.inserted} nuevas, ${result.updated} actualizadas y ${result.duplicates} duplicadas.`,
      );
    } catch (error: unknown) {
      const prefix = error instanceof ApiRequestError ? `[${error.code}] ` : '';
      setMessage(`${prefix}${error instanceof Error ? error.message : 'Falló la búsqueda.'}`);
    } finally {
      setBusyId(null);
    }
  }

  async function syncAll() {
    const accessToken = token();
    if (!accessToken) return;
    setBusyId('sync-all');

    try {
      const result = await apiRequest('/editor/news-sources/sync', syncAllResultSchema, {
        method: 'POST',
        accessToken,
      });
      await loadSources(accessToken);
      setMessage(`Búsqueda terminada: ${result.succeeded} correctas y ${result.failed} con error.`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible buscar en las fuentes.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="sources-manager">
      <EditorialLoadingOverlay
        visible={loading || busyId !== null}
        label={loading ? 'Cargando fuentes…' : 'Procesando operación…'}
      />
      <section className="sources-metrics">
        <article className="editorial-card">
          <span>Total</span>
          <strong>{sources.length}</strong>
          <small>Fuentes registradas</small>
        </article>
        <article className="editorial-card">
          <span>Activas</span>
          <strong>{activeCount}</strong>
          <small>Participan en búsquedas</small>
        </article>
        <article className="editorial-card">
          <span>Automáticas</span>
          <strong>{automaticCount}</strong>
          <small>RSS, sitemap o HTML</small>
        </article>
      </section>

      <section className="sources-toolbar editorial-card">
        <div className="sources-search">
          <span aria-hidden="true"></span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setQuery(searchInput.trim());
            }}
            placeholder="Buscar por nombre o dominio"
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
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as 'ALL' | 'ACTIVE' | 'PAUSED')}
        >
          <option value="ALL">Todos los estados</option>
          <option value="ACTIVE">Activas</option>
          <option value="PAUSED">Pausadas</option>
        </select>
        <button
          className="editorial-button editorial-button--secondary"
          type="button"
          onClick={syncAll}
          disabled={busyId !== null}
        >
          {busyId === 'sync-all' ? 'Actualizando…' : '↻ Actualizar fuentes'}
        </button>
        <button className="editorial-button" type="button" onClick={openCreate}>
          Agregar fuente
        </button>
      </section>

      <section className="editorial-card sources-table-card">
        <header className="editorial-card__header">
          <div>
            <h2>Fuentes autorizadas</h2>
            <p>{filteredSources.length} registros visibles</p>
          </div>
        </header>
        <div className="sources-table-wrap">
          <table className="sources-table">
            <thead>
              <tr>
                <th>Fuente</th>
                <th>Método</th>
                <th>Estado</th>
                <th>Actualización</th>
                <th>Última búsqueda</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSources.map((source) => (
                <tr key={source.id}>
                  <td>
                    <div className="source-name">
                      <span>{source.name.slice(0, 2).toUpperCase()}</span>
                      <div>
                        <strong>{source.name}</strong>
                        <a
                          href={source.listingUrl ?? source.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {source.domain} ↗
                        </a>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong className="source-method">{methodLabel(source.ingestionMethod)}</strong>
                    <small>{sourceTypeLabel(source.type)}</small>
                  </td>
                  <td>
                    <span
                      className={`editorial-status ${source.status === 'ACTIVE' ? 'editorial-status--success' : 'editorial-status--warning'}`}
                    >
                      {source.status === 'ACTIVE' ? 'Activa' : 'Pausada'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="source-schedule"
                      type="button"
                      onClick={() => openEdit(source)}
                      title="Cambiar frecuencia de actualización"
                    >
                      <span aria-hidden="true">↻</span>{' '}
                      {formatInterval(source.checkIntervalMinutes)}
                    </button>
                  </td>
                  <td>
                    <small>{formatDate(source.lastSyncAt)}</small>
                    {source.lastSyncStatus && (
                      <small
                        className={
                          source.lastSyncStatus === 'FAILED' ? 'source-error' : 'source-success'
                        }
                      >
                        {syncStatusLabel(source.lastSyncStatus)}
                      </small>
                    )}
                  </td>
                  <td>
                    <div className="source-actions">
                      <button
                        type="button"
                        onClick={() => openEdit(source)}
                        disabled={busyId !== null}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSource(source)}
                        disabled={busyId !== null}
                      >
                        {source.status === 'ACTIVE' ? 'Pausar' : 'Activar'}
                      </button>
                      {source.status === 'ACTIVE' && source.ingestionMethod !== 'MANUAL' && (
                        <button
                          type="button"
                          onClick={() => syncSource(source)}
                          disabled={busyId !== null}
                        >
                          Buscar ahora
                        </button>
                      )}
                      <button
                        className="is-danger"
                        type="button"
                        onClick={() => removeSource(source)}
                        disabled={busyId !== null}
                      >
                        Quitar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredSources.length === 0 && (
            <p className="editorial-empty">No hay fuentes que coincidan con los filtros.</p>
          )}
        </div>
      </section>

      {formOpen && (
        <div
          className="source-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="source-form-title"
        >
          <button
            className="source-modal__backdrop"
            type="button"
            onClick={closeForm}
            aria-label="Cerrar formulario"
          ></button>
          <section className="source-modal__panel">
            <header>
              <div>
                <span>{editingSource ? 'Editar fuente' : 'Nueva fuente'}</span>
                <h2 id="source-form-title">
                  {editingSource?.name ?? 'Configurar fuente confiable'}
                </h2>
              </div>
              <button type="button" onClick={closeForm} aria-label="Cerrar">
                ×
              </button>
            </header>
            <form key={editingSource?.id ?? 'new'} onSubmit={saveSource}>
              <div className="source-form-grid">
                <SourceFormFields source={editingSource ?? undefined} />
              </div>
              {detection && (
                <aside className="source-detection">
                  <strong>Detección: {detection.strategy}</strong>
                  <span>
                    {detection.accepted} candidatas relevantes de {detection.fetched} enlaces
                    evaluados.
                  </span>
                  <a href={detection.discoveryUrl} target="_blank" rel="noreferrer">
                    Abrir URL detectada ↗
                  </a>
                  {detection.samples.length > 0 && (
                    <ul>
                      {detection.samples.slice(0, 3).map((sample) => (
                        <li key={sample.canonicalUrl}>{sample.title}</li>
                      ))}
                    </ul>
                  )}
                </aside>
              )}
              <footer>
                <button
                  className="editorial-button editorial-button--secondary"
                  type="button"
                  onClick={(event) => void detectConfiguration(event.currentTarget.form!)}
                  disabled={busyId !== null}
                >
                  {busyId === 'detect' ? 'Analizando…' : 'Probar detección'}
                </button>
                <span></span>
                <button
                  className="editorial-button editorial-button--secondary"
                  type="button"
                  onClick={closeForm}
                >
                  Cancelar
                </button>
                <button className="editorial-button" type="submit" disabled={busyId !== null}>
                  {busyId === (editingSource?.id ?? 'create') ? 'Guardando…' : 'Guardar fuente'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      <EditorialToast message={message} onClose={() => setMessage('')} />

      <style>{`
        .sources-manager { display:grid; gap:16px; }
        .sources-metrics { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
        .sources-metrics article { padding:17px 19px; display:grid; gap:2px; box-shadow:none; }
        .sources-metrics span { color:var(--editorial-muted); font-size:.88rem; font-weight:700; }
        .sources-metrics strong { color:var(--color-navy); font-size:1.7rem; }
        .sources-metrics small { color:var(--editorial-muted); font-size:.84rem; }
        .sources-toolbar { padding:14px; display:grid; grid-template-columns:minmax(260px,1fr) auto 180px auto auto; gap:10px; box-shadow:none; }
        .sources-toolbar select { min-height:42px; padding:0 11px; border:1px solid var(--editorial-line); border-radius:10px; background:white; font-size:.84rem; }
        .sources-search { min-height:42px; display:flex; align-items:center; border:1px solid var(--editorial-line); border-radius:10px; background:white; }
        .sources-search span { position:relative; width:38px; height:38px; }
        .sources-search span::before { content:''; position:absolute; width:10px; height:10px; left:12px; top:10px; border:1.6px solid var(--editorial-muted); border-radius:50%; }
        .sources-search span::after { content:''; position:absolute; width:6px; left:22px; top:22px; border-top:1.6px solid var(--editorial-muted); transform:rotate(45deg); }
        .sources-search input { min-width:0; flex:1; height:40px; padding:0 12px 0 0; border:0; outline:0; background:transparent; font-size:.88rem; }
        .sources-table-card { overflow:hidden; }
        .sources-table-card .editorial-card__header > span { color:var(--editorial-muted); font-size:.87rem; }
        .sources-table-wrap { overflow-x:auto; }
        .sources-table { width:100%; min-width:1120px; border-collapse:collapse; }
        .sources-table th { padding:11px 18px; color:var(--editorial-muted); background:#faf9f6; font-size:.82rem; letter-spacing:.06em; text-align:left; text-transform:uppercase; }
        .sources-table td { padding:14px 18px; border-top:1px solid var(--editorial-line); vertical-align:middle; font-size:.82rem; }
        .source-name { display:flex; align-items:center; gap:11px; min-width:220px; }
        .source-name > span { width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; border-radius:9px; color:var(--editorial-accent); background:var(--editorial-accent-soft); font-size:.79rem; font-weight:800; }
        .source-name strong,.source-name a,.sources-table td small { display:block; }
        .source-name strong { color:var(--color-navy); font-size:.88rem; }
        .source-name a { margin-top:3px; color:var(--editorial-accent); font-size:.85rem; }
        .source-method { display:block; color:var(--color-navy); font-size:.82rem; }
        .sources-table td small { margin-top:4px; max-width:230px; overflow:hidden; color:var(--editorial-muted); font-size:.84rem; text-overflow:ellipsis; white-space:nowrap; }
        .sources-table .source-error { color:var(--editorial-danger); font-weight:700; }
        .sources-table .source-success { color:var(--editorial-success); font-weight:700; }
        .source-schedule { min-height:34px; padding:0 10px; display:inline-flex; align-items:center; gap:6px; border:1px solid rgb(119 37 54 / 18%); border-radius:999px; color:var(--editorial-accent); background:var(--editorial-accent-soft); font-size:.84rem; font-weight:800; white-space:nowrap; cursor:pointer; }
        .source-schedule:hover { border-color:rgb(119 37 54 / 38%); background:#f1dfe4; }
        .source-actions { display:flex; justify-content:flex-end; gap:7px; flex-wrap:wrap; }
        .source-actions button { min-height:36px; padding:0 11px; border:1px solid var(--editorial-line); border-radius:7px; color:var(--color-navy); background:white; font-size:.82rem; font-weight:750; cursor:pointer; }
        .source-actions button:hover { color:var(--editorial-accent); border-color:rgb(119 37 54 / 35%); }
        .source-actions .is-danger { color:var(--editorial-danger); }
        .source-modal { position:fixed; z-index:70; inset:0; display:flex; justify-content:flex-end; }
        .source-modal__backdrop { position:absolute; inset:0; border:0; background:rgb(13 25 37 / 48%); backdrop-filter:blur(2px); }
        .source-modal__panel { position:relative; width:min(780px,100%); height:100%; overflow-y:auto; background:white; box-shadow:-20px 0 50px rgb(13 25 37 / 16%); }
        .source-modal__panel > header { position:sticky; z-index:2; top:0; padding:21px 25px; display:flex; align-items:flex-start; justify-content:space-between; border-bottom:1px solid var(--editorial-line); background:rgb(255 255 255 / 94%); backdrop-filter:blur(12px); }
        .source-modal__panel > header span { color:var(--editorial-accent); font-size:.84rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
        .source-modal__panel > header h2 { margin:5px 0 0; color:var(--color-navy); font-family:var(--font-body); font-size:1.18rem; }
        .source-modal__panel > header button { border:0; color:var(--editorial-muted); background:transparent; font-size:1.7rem; cursor:pointer; }
        .source-modal__panel form { padding:23px 25px; }
        .source-form-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
        .source-form-grid label { display:grid; gap:7px; color:var(--editorial-text); font-size:.81rem; font-weight:700; }
        .source-form-grid .wide { grid-column:1/-1; }
        .source-form-grid input,.source-form-grid select,.source-form-grid textarea { width:100%; min-height:42px; padding:9px 11px; border:1px solid var(--editorial-line); border-radius:10px; outline:0; background:white; font-size:.86rem; font-weight:400; }
        .source-form-grid textarea { min-height:72px; resize:vertical; }
        .source-form-grid small { color:var(--editorial-muted); font-size:.83rem; font-weight:400; }
        .source-form-grid .checkbox { display:flex; align-items:center; gap:8px; }
        .source-form-grid .checkbox input { width:auto; min-height:auto; accent-color:var(--editorial-accent); }
        .source-detection { margin-top:18px; padding:14px 16px; display:grid; gap:5px; border:1px solid #c8ded0; border-radius:11px; color:var(--editorial-text); background:var(--editorial-success-soft); font-size:.79rem; }
        .source-detection strong { color:var(--editorial-success); }
        .source-detection a { color:var(--editorial-accent); font-weight:700; }
        .source-detection ul { margin:5px 0 0; padding-left:18px; }
        .source-modal footer { margin-top:22px; padding-top:17px; display:grid; grid-template-columns:auto 1fr auto auto; gap:8px; border-top:1px solid var(--editorial-line); }
        @media(max-width:1100px){.sources-toolbar{grid-template-columns:1fr 1fr 1fr}.sources-search{grid-column:1/-1}.sources-toolbar .editorial-button{width:100%}}
        @media(max-width:650px){.sources-metrics{grid-template-columns:1fr}.sources-toolbar{grid-template-columns:1fr}.sources-search{grid-column:auto}.source-form-grid{grid-template-columns:1fr}.source-form-grid .wide{grid-column:auto}.source-modal footer{grid-template-columns:1fr 1fr}.source-modal footer span{display:none}.source-modal__panel form,.source-modal__panel>header{padding-inline:17px}}
      `}</style>
    </div>
  );
}
