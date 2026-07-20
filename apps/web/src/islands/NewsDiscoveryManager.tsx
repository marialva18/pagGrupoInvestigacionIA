import {
  externalNewsItemListSchema,
  externalNewsSourceListSchema,
  type ExternalNewsItem,
} from '@intgarti/contracts';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { EditorialLoadingOverlay, EditorialToast } from '../components/editorial/EditorialFeedback';
import { apiRequest } from '../lib/api-client';
import { getEditorAccessToken } from '../lib/auth/editor-session';

const publicationActionSchema = z
  .object({
    id: z.string().uuid(),
    status: z.string(),
  })
  .passthrough();

const discardSchema = z.object({
  id: z.string().uuid(),
  status: z.literal('DISCARDED'),
});

const syncAllSchema = z.object({
  total: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  results: z.array(z.unknown()),
});

function formatDate(value: string | null): string {
  if (!value) return 'Fecha no informada';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function scoreClass(score: number): string {
  if (score >= 70) return 'is-high';
  if (score >= 40) return 'is-medium';
  return 'is-low';
}

export default function NewsDiscoveryManager() {
  const [items, setItems] = useState<ExternalNewsItem[]>([]);
  const [sources, setSources] = useState<Array<{ id: string; name: string }>>([]);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sourceId, setSourceId] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function load(token: string) {
    const [candidateResult, sourceResult] = await Promise.all([
      apiRequest(
        '/editor/external-news?page=1&pageSize=100&status=DISCOVERED',
        externalNewsItemListSchema,
        {
          accessToken: token,
        },
      ),
      apiRequest('/editor/news-sources', externalNewsSourceListSchema, {
        accessToken: token,
      }),
    ]);

    setItems(candidateResult.items);
    setSources(sourceResult.items.map((source) => ({ id: source.id, name: source.name })));
    setSummaries((current) =>
      Object.fromEntries(
        candidateResult.items.map((item) => [
          item.id,
          current[item.id] ?? item.generatedSummary ?? item.sourceSummary ?? '',
        ]),
      ),
    );
  }

  useEffect(() => {
    const token = getEditorAccessToken();
    if (!token) return;

    void load(token)
      .catch((error: unknown) =>
        setMessage(
          error instanceof Error
            ? error.message
            : 'No fue posible cargar las noticias encontradas.',
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSource = sourceId === 'ALL' || item.source?.id === sourceId;
      const matchesQuery =
        !normalized ||
        `${item.title} ${item.generatedSummary ?? ''} ${item.sourceSummary ?? ''} ${item.source?.name ?? item.sourceKey}`
          .toLowerCase()
          .includes(normalized);
      return matchesSource && matchesQuery;
    });
  }, [items, query, sourceId]);

  function accessToken(): string | null {
    const token = getEditorAccessToken();
    if (!token) setMessage('La sesión editorial no está disponible.');
    return token;
  }

  async function searchNow() {
    const token = accessToken();
    if (!token) return;
    setBusyId('sync');
    setMessage('');

    try {
      const result = await apiRequest('/editor/news-sources/sync', syncAllSchema, {
        method: 'POST',
        accessToken: token,
      });
      await load(token);
      setMessage(
        `Búsqueda completada: ${result.succeeded} fuentes correctas y ${result.failed} con error.`,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible buscar publicaciones.');
    } finally {
      setBusyId(null);
    }
  }

  async function importItem(item: ExternalNewsItem, featured: boolean) {
    const token = accessToken();
    if (!token) return;
    const summary = summaries[item.id]?.trim() ?? '';

    if (summary.length < 20) {
      setMessage('El resumen editorial debe tener al menos 20 caracteres.');
      return;
    }

    setBusyId(item.id);
    try {
      await apiRequest(`/editor/external-news/${item.id}/import`, publicationActionSchema, {
        method: 'POST',
        accessToken: token,
        body: JSON.stringify({
          summary,
          categoryIds: [],
          featured,
          publishNow: true,
        }),
      });
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage(
        featured
          ? 'Noticia publicada y marcada como destacada.'
          : 'Noticia publicada correctamente.',
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible importar la noticia.');
    } finally {
      setBusyId(null);
    }
  }

  async function discardItem(item: ExternalNewsItem) {
    const token = accessToken();
    if (!token) return;
    if (!window.confirm(`¿Descartar “${item.title}”?`)) return;

    setBusyId(item.id);
    try {
      await apiRequest(`/editor/external-news/${item.id}/discard`, discardSchema, {
        method: 'POST',
        accessToken: token,
        body: JSON.stringify({ reason: 'Descartada desde la bandeja de descubrimiento.' }),
      });
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setMessage('Noticia descartada.');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No fue posible descartar la noticia.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="discovery-manager">
      <EditorialLoadingOverlay
        visible={loading || busyId !== null}
        label={loading ? 'Cargando noticias…' : 'Procesando operación…'}
      />
      <section className="discovery-summary editorial-card">
        <div>
          <span className="discovery-summary__number">{items.length}</span>
          <span>
            <strong>Pendientes de revisión</strong>
            <small>Solo se publican después de una decisión editorial.</small>
          </span>
        </div>
        <button
          className="editorial-button"
          type="button"
          onClick={searchNow}
          disabled={busyId !== null}
        >
          {busyId === 'sync' ? 'Actualizando…' : '↻ Actualizar noticias'}
        </button>
      </section>

      <section className="discovery-toolbar editorial-card">
        <div className="discovery-search">
          <span aria-hidden="true"></span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') setQuery(searchInput.trim());
            }}
            placeholder="Buscar por título, resumen o fuente"
          />
        </div>
        <button
          className="editorial-button editorial-button--secondary"
          type="button"
          onClick={() => setQuery(searchInput.trim())}
        >
          Buscar
        </button>
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
          <option value="ALL">Todas las fuentes</option>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      </section>

      <section className="discovery-list">
        {filtered.length === 0 ? (
          <div className="editorial-card editorial-empty">
            No hay noticias pendientes. Ejecuta una búsqueda o revisa la configuración de las
            fuentes.
          </div>
        ) : (
          filtered.map((item) => (
            <article className="discovery-item editorial-card" key={item.id}>
              <div className="discovery-item__content">
                <div className="discovery-item__meta">
                  <span>{item.source?.name ?? item.sourceKey}</span>
                  <span>{formatDate(item.publishedAt)}</span>
                  <span className={`discovery-score ${scoreClass(item.relevanceScore)}`}>
                    Relevancia {item.relevanceScore}/100
                  </span>
                </div>
                <h2>{item.title}</h2>
                <p>{item.sourceSummary ?? 'La fuente no proporcionó un resumen.'}</p>
                <a href={item.canonicalUrl} target="_blank" rel="noopener noreferrer">
                  Abrir publicación original ↗
                </a>
              </div>

              <div className="discovery-item__review">
                <label className="editorial-field">
                  Resumen editorial
                  <textarea
                    rows={5}
                    minLength={20}
                    maxLength={600}
                    value={summaries[item.id] ?? ''}
                    onChange={(event) =>
                      setSummaries((current) => ({ ...current, [item.id]: event.target.value }))
                    }
                  />
                  <small>
                    {item.summaryStatus === 'EXTRACTIVE'
                      ? 'Extracto automático. Verifícalo con el contenido original.'
                      : 'Resumen recibido desde la fuente. Revísalo antes de publicar.'}
                  </small>
                </label>
                <div className="discovery-item__actions">
                  <button
                    className="editorial-button editorial-button--danger"
                    type="button"
                    onClick={() => discardItem(item)}
                    disabled={busyId !== null}
                  >
                    Descartar
                  </button>
                  <button
                    className="editorial-button editorial-button--secondary"
                    type="button"
                    onClick={() => importItem(item, false)}
                    disabled={busyId !== null}
                  >
                    Publicar
                  </button>
                  <button
                    className="editorial-button"
                    type="button"
                    onClick={() => importItem(item, true)}
                    disabled={busyId !== null}
                  >
                    Publicar destacada
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      <EditorialToast message={message} onClose={() => setMessage('')} />

      <style>{`
        .discovery-manager { display:grid; gap:16px; }
        .discovery-summary { padding:18px 20px; display:flex; align-items:center; justify-content:space-between; gap:20px; box-shadow:none; }
        .discovery-summary > div { display:flex; align-items:center; gap:14px; }
        .discovery-summary__number { width:48px; height:48px; display:inline-flex; align-items:center; justify-content:center; border-radius:13px; color:white; background:var(--color-navy); font-size:1.15rem; font-weight:700; }
        .discovery-summary strong,.discovery-summary small { display:block; }
        .discovery-summary strong { color:var(--color-navy); font-size:.96rem; }
        .discovery-summary small { margin-top:3px; color:var(--editorial-muted); font-size:.79rem; }
        .discovery-toolbar { padding:13px; display:grid; grid-template-columns:minmax(280px,1fr) auto 240px; gap:10px; box-shadow:none; }
        .discovery-toolbar select { min-height:42px; padding:0 11px; border:1px solid var(--editorial-line); border-radius:10px; color:var(--editorial-text); background:white; font-size:.88rem; }
        .discovery-search { min-height:42px; display:flex; align-items:center; border:1px solid var(--editorial-line); border-radius:10px; background:white; }
        .discovery-search span { position:relative; width:38px; height:38px; }
        .discovery-search span::before { content:''; position:absolute; width:10px; height:10px; left:12px; top:10px; border:1.6px solid var(--editorial-muted); border-radius:50%; }
        .discovery-search span::after { content:''; position:absolute; width:6px; left:22px; top:22px; border-top:1.6px solid var(--editorial-muted); transform:rotate(45deg); }
        .discovery-search input { min-width:0; flex:1; height:40px; padding:0 12px 0 0; border:0; outline:0; background:transparent; font-size:.9rem; }
        .discovery-list { display:grid; gap:14px; }
        .discovery-item { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(340px,.85fr); overflow:hidden; }
        .discovery-item__content { padding:22px 24px; }
        .discovery-item__meta { display:flex; flex-wrap:wrap; align-items:center; gap:9px; color:var(--editorial-muted); font-size:.83rem; font-weight:700; text-transform:uppercase; }
        .discovery-item__meta > span:not(:last-child)::after { content:'·'; margin-left:9px; color:var(--editorial-line); }
        .discovery-score { padding:4px 7px; border-radius:999px; }
        .discovery-score.is-high { color:var(--editorial-success); background:var(--editorial-success-soft); }
        .discovery-score.is-medium { color:var(--editorial-warning); background:var(--editorial-warning-soft); }
        .discovery-score.is-low { color:var(--editorial-danger); background:var(--editorial-danger-soft); }
        .discovery-item h2 { margin:12px 0 8px; color:var(--color-navy); font-family:var(--font-body); font-size:1.18rem; line-height:1.25; }
        .discovery-item__content p { display:-webkit-box; margin:0 0 13px; overflow:hidden; color:var(--editorial-muted); font-size:.88rem; line-height:1.52; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
        .discovery-item__content a { color:var(--editorial-accent); font-size:.8rem; font-weight:700; }
        .discovery-item__review { padding:20px; border-left:1px solid var(--editorial-line); background:#fbfaf7; }
        .discovery-item__review small { color:var(--editorial-muted); font-size:.84rem; font-weight:400; }
        .discovery-item__actions { margin-top:13px; display:flex; justify-content:flex-end; gap:7px; flex-wrap:wrap; }
        .discovery-item__actions .editorial-button { min-height:40px; padding-inline:13px; font-size:.88rem; }
        @media(max-width:980px){.discovery-item{grid-template-columns:1fr}.discovery-item__review{border-top:1px solid var(--editorial-line);border-left:0}}
        @media(max-width:720px){.discovery-summary{align-items:flex-start;flex-direction:column}.discovery-summary .editorial-button{width:100%}.discovery-toolbar{grid-template-columns:1fr}.discovery-item__content,.discovery-item__review{padding:18px}.discovery-item__actions{justify-content:stretch}.discovery-item__actions .editorial-button{flex:1}}
      `}</style>
    </div>
  );
}
