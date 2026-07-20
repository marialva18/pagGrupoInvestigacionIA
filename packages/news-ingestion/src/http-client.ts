import {
  assertPublicNetworkTarget,
  hostnameBelongsToDomain,
  validateSourceUrl,
} from './security.js';

export interface FetchDocumentOptions {
  accept?: string;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface FetchedDocument {
  body: string;
  contentType: string;
  finalUrl: string;
  status: number;
}

const DEFAULT_ACCEPT = [
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
  'text/html',
  'application/xhtml+xml',
].join(', ');

export async function fetchPublicDocument(
  value: string,
  sourceDomain: string,
  options: FetchDocumentOptions = {},
): Promise<FetchedDocument> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const maxBytes = options.maxBytes ?? 2_000_000;
  let currentUrl = validateSourceUrl(value);

  try {
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      if (!hostnameBelongsToDomain(currentUrl.hostname, sourceDomain)) {
        throw new Error('La fuente redirigió fuera del dominio aprobado.');
      }

      await assertPublicNetworkTarget(currentUrl);

      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: options.accept ?? DEFAULT_ACCEPT,
          'Accept-Language': 'es-PE,es;q=0.9,en;q=0.7',
          'User-Agent': 'INTGARTI-News-Collector/2.0 (+academic research portal)',
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');

        if (!location) {
          throw new Error(
            `La fuente respondió con una redirección HTTP ${response.status} inválida.`,
          );
        }

        if (redirectCount === 5) {
          throw new Error('La fuente superó el máximo de redirecciones permitidas.');
        }

        currentUrl = validateSourceUrl(new URL(location, currentUrl).toString());
        continue;
      }

      if (!response.ok) {
        throw new Error(`La fuente respondió con HTTP ${response.status}.`);
      }

      const declaredLength = Number(response.headers.get('content-length') ?? '0');

      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new Error('El documento supera el tamaño máximo permitido.');
      }

      const bytes = new Uint8Array(await response.arrayBuffer());

      if (bytes.byteLength > maxBytes) {
        throw new Error('El documento supera el tamaño máximo permitido.');
      }

      return {
        body: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
        contentType: response.headers.get('content-type')?.toLowerCase() ?? '',
        finalUrl: currentUrl.toString(),
        status: response.status,
      };
    }

    throw new Error('No fue posible resolver la URL de la fuente.');
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('La fuente excedió el tiempo máximo de respuesta.', { cause: error });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function documentLooksLikeXml(document: FetchedDocument): boolean {
  const trimmed = document.body.trimStart();

  return (
    document.contentType.includes('xml') ||
    trimmed.startsWith('<?xml') ||
    /^<(rss|feed|rdf:RDF|urlset|sitemapindex)\b/i.test(trimmed)
  );
}

export function documentLooksLikeHtml(document: FetchedDocument): boolean {
  const trimmed = document.body.trimStart();

  return (
    document.contentType.includes('html') ||
    /^<!doctype html\b/i.test(trimmed) ||
    /^<html\b/i.test(trimmed)
  );
}
