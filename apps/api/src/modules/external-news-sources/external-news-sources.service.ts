import type { AuthenticatedUser } from '@intgarti/contracts';
import { getPrismaClient } from '@intgarti/database';
import {
  detectNewsSource,
  fetchAndParseSourceResult,
  hostnameBelongsToDomain,
  normalizeDomain,
  validateSourceUrl,
  type NewsSourceConfig,
  type ParsedNewsEntry,
} from '@intgarti/news-ingestion';
import { AppError } from '../../common/errors/app-error.js';
import { toJsonObject, toJsonValue } from '../../common/json.js';
import type {
  CreateExternalNewsSourceInput,
  DetectExternalNewsSourceInput,
  ListExternalNewsSourcesInput,
  UpdateExternalNewsSourceInput,
} from './external-news-sources.schema.js';

type SourceActor = Pick<AuthenticatedUser, 'id'>;
type NewsSourceTransactionClient = Pick<
  ReturnType<typeof getPrismaClient>,
  'externalNewsSource' | 'externalNewsItem' | 'externalNewsSyncRun' | 'auditLog'
>;

const sourceSelect = {
  id: true,
  key: true,
  name: true,
  domain: true,
  websiteUrl: true,
  listingUrl: true,
  feedUrl: true,
  discoveryUrl: true,
  detectedMethod: true,
  type: true,
  status: true,
  ingestionMethod: true,
  reviewMode: true,
  language: true,
  includeKeywords: true,
  excludeKeywords: true,
  includeUrlPatterns: true,
  excludeUrlPatterns: true,
  minimumRelevanceScore: true,
  maxItemsPerSync: true,
  checkIntervalMinutes: true,
  nextSyncAt: true,
  lastSyncAt: true,
  lastSuccessAt: true,
  lastSyncStatus: true,
  lastSyncMessage: true,
  consecutiveFailures: true,
  createdAt: true,
  updatedAt: true,
} as const;

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function hostBelongsToDomain(hostname: string, domain: string): boolean {
  return hostnameBelongsToDomain(hostname, domain);
}

function parseApprovedUrl(value: string, fieldName: string): URL {
  try {
    return validateSourceUrl(value);
  } catch (error: unknown) {
    throw new AppError(
      `${fieldName}: ${error instanceof Error ? error.message : 'URL no válida.'}`,
      422,
      'EXTERNAL_NEWS_SOURCE_URL_INVALID',
    );
  }
}

interface NormalizedCreateSourceData {
  name: string;
  domain: string;
  websiteUrl: string;
  listingUrl: string;
  feedUrl: string | null;
  type: CreateExternalNewsSourceInput['type'];
  status: CreateExternalNewsSourceInput['status'];
  ingestionMethod: CreateExternalNewsSourceInput['ingestionMethod'];
  reviewMode: CreateExternalNewsSourceInput['reviewMode'];
  language: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  includeUrlPatterns: string[];
  excludeUrlPatterns: string[];
  minimumRelevanceScore: number;
  maxItemsPerSync: number;
  checkIntervalMinutes: number;
}

type NormalizedUpdateSourceData = Partial<NormalizedCreateSourceData>;

function normalizeSourceInput(input: CreateExternalNewsSourceInput): NormalizedCreateSourceData;
function normalizeSourceInput(input: UpdateExternalNewsSourceInput): NormalizedUpdateSourceData;
function normalizeSourceInput(
  input: CreateExternalNewsSourceInput | UpdateExternalNewsSourceInput,
): NormalizedCreateSourceData | NormalizedUpdateSourceData {
  const websiteUrl = input.websiteUrl
    ? parseApprovedUrl(input.websiteUrl, 'URL oficial')
    : undefined;
  const listingUrl =
    input.listingUrl === undefined
      ? undefined
      : input.listingUrl === null
        ? null
        : parseApprovedUrl(input.listingUrl, 'URL de noticias');
  const feedUrl =
    input.feedUrl === undefined
      ? undefined
      : input.feedUrl === null
        ? null
        : parseApprovedUrl(input.feedUrl, 'URL técnica');
  const inferredDomain = input.domain ?? listingUrl?.hostname ?? websiteUrl?.hostname ?? '';
  const domain = normalizeDomain(inferredDomain);

  if (!domain || domain.includes('/') || domain.includes(':') || domain.includes(' ')) {
    throw new AppError(
      'El dominio aprobado debe escribirse sin protocolo ni ruta.',
      422,
      'EXTERNAL_NEWS_SOURCE_DOMAIN_INVALID',
    );
  }

  for (const [url, fieldName] of [
    [websiteUrl, 'URL oficial'],
    [listingUrl, 'URL de noticias'],
    [feedUrl, 'URL técnica'],
  ] as const) {
    if (url && !hostBelongsToDomain(url.hostname, domain)) {
      throw new AppError(
        `${fieldName}: el dominio no coincide con el dominio aprobado.`,
        422,
        'EXTERNAL_NEWS_SOURCE_DOMAIN_MISMATCH',
      );
    }
  }

  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(domain ? { domain } : {}),
    ...(websiteUrl ? { websiteUrl: websiteUrl.toString() } : {}),
    ...(input.listingUrl !== undefined
      ? { listingUrl: listingUrl?.toString() ?? websiteUrl?.toString() ?? '' }
      : websiteUrl
        ? { listingUrl: websiteUrl.toString() }
        : {}),
    ...(input.feedUrl !== undefined ? { feedUrl: feedUrl?.toString() ?? null } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.ingestionMethod !== undefined ? { ingestionMethod: input.ingestionMethod } : {}),
    ...(input.reviewMode !== undefined ? { reviewMode: input.reviewMode } : {}),
    ...(input.language !== undefined ? { language: input.language.toLowerCase() } : {}),
    ...(input.includeKeywords !== undefined ? { includeKeywords: input.includeKeywords } : {}),
    ...(input.excludeKeywords !== undefined ? { excludeKeywords: input.excludeKeywords } : {}),
    ...(input.includeUrlPatterns !== undefined
      ? { includeUrlPatterns: input.includeUrlPatterns }
      : {}),
    ...(input.excludeUrlPatterns !== undefined
      ? { excludeUrlPatterns: input.excludeUrlPatterns }
      : {}),
    ...(input.minimumRelevanceScore !== undefined
      ? { minimumRelevanceScore: input.minimumRelevanceScore }
      : {}),
    ...(input.maxItemsPerSync !== undefined ? { maxItemsPerSync: input.maxItemsPerSync } : {}),
    ...(input.checkIntervalMinutes !== undefined
      ? { checkIntervalMinutes: input.checkIntervalMinutes }
      : {}),
  };
}

function mapSource(source: {
  id: string;
  key: string;
  name: string;
  domain: string;
  websiteUrl: string;
  listingUrl: string | null;
  feedUrl: string | null;
  discoveryUrl: string | null;
  detectedMethod: string | null;
  type:
    | 'ACADEMIC'
    | 'NEWS_AGENCY'
    | 'NEWS_MEDIA'
    | 'CORPORATE_RESEARCH'
    | 'CORPORATE_BLOG'
    | 'GOVERNMENT'
    | 'UNIVERSITY'
    | 'OTHER';
  status: 'ACTIVE' | 'PAUSED';
  ingestionMethod: 'AUTO' | 'RSS' | 'ATOM' | 'SITEMAP' | 'HTML' | 'MANUAL';
  reviewMode: 'REQUIRED' | 'AUTOMATIC';
  language: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  includeUrlPatterns: string[];
  excludeUrlPatterns: string[];
  minimumRelevanceScore: number;
  maxItemsPerSync: number;
  checkIntervalMinutes: number;
  nextSyncAt: Date | null;
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  const detectedMethod = [
    'RSS',
    'ATOM',
    'NEWS_SITEMAP',
    'SITEMAP',
    'JSON_LD',
    'HTML',
    'ARTICLE',
  ].includes(source.detectedMethod ?? '')
    ? source.detectedMethod
    : null;

  return {
    ...source,
    detectedMethod,
    nextSyncAt: source.nextSyncAt?.toISOString() ?? null,
    lastSyncAt: source.lastSyncAt?.toISOString() ?? null,
    lastSuccessAt: source.lastSuccessAt?.toISOString() ?? null,
    createdAt: source.createdAt.toISOString(),
    updatedAt: source.updatedAt.toISOString(),
  };
}

function toSourceConfig(source: {
  key: string;
  name: string;
  domain: string;
  websiteUrl: string;
  listingUrl: string | null;
  feedUrl: string | null;
  discoveryUrl: string | null;
  detectedMethod: string | null;
  ingestionMethod: 'AUTO' | 'RSS' | 'ATOM' | 'SITEMAP' | 'HTML' | 'MANUAL';
  language: string;
  includeKeywords: string[];
  excludeKeywords: string[];
  includeUrlPatterns: string[];
  excludeUrlPatterns: string[];
  minimumRelevanceScore: number;
  maxItemsPerSync: number;
}): NewsSourceConfig {
  return { ...source };
}

function nextSyncDate(intervalMinutes: number, failures = 0): Date {
  const multiplier = 2 ** Math.min(failures, 4);
  const minutes = Math.min(intervalMinutes * multiplier, 10_080);
  return new Date(Date.now() + minutes * 60_000);
}

type NewsPersistenceClient = Pick<ReturnType<typeof getPrismaClient>, 'externalNewsItem'>;

async function persistEntries(
  transaction: NewsPersistenceClient,
  source: {
    id: string;
    key: string;
    reviewMode: 'REQUIRED' | 'AUTOMATIC';
  },
  entries: ParsedNewsEntry[],
): Promise<{ inserted: number; updated: number; duplicates: number }> {
  let inserted = 0;
  let updated = 0;
  let duplicates = 0;

  for (const entry of entries) {
    const existing = await transaction.externalNewsItem.findUnique({
      where: { canonicalUrlHash: entry.canonicalUrlHash },
      select: { id: true, status: true },
    });

    if (!existing) {
      await transaction.externalNewsItem.create({
        data: {
          sourceId: source.id,
          sourceKey: source.key,
          externalId: entry.externalId,
          canonicalUrl: entry.canonicalUrl,
          canonicalUrlHash: entry.canonicalUrlHash,
          title: entry.title,
          sourceSummary: entry.sourceSummary,
          generatedSummary: entry.generatedSummary,
          summaryStatus: entry.summaryStatus,
          language: entry.language,
          author: entry.author,
          imageUrl: entry.imageUrl,
          matchedKeywords: entry.matchedKeywords,
          relevanceScore: entry.relevanceScore,
          publishedAt: entry.publishedAt,
          contentHash: entry.contentHash,
          status: source.reviewMode === 'AUTOMATIC' ? 'REVIEWED' : 'DISCOVERED',
          rawMetadata: toJsonObject(entry.rawMetadata),
          reviewedAt: source.reviewMode === 'AUTOMATIC' ? new Date() : null,
        },
      });
      inserted += 1;
      continue;
    }

    if (existing.status === 'IMPORTED' || existing.status === 'DISCARDED') {
      duplicates += 1;
      continue;
    }

    await transaction.externalNewsItem.update({
      where: { id: existing.id },
      data: {
        sourceId: source.id,
        sourceKey: source.key,
        externalId: entry.externalId,
        title: entry.title,
        sourceSummary: entry.sourceSummary,
        generatedSummary: entry.generatedSummary,
        summaryStatus: entry.summaryStatus,
        language: entry.language,
        author: entry.author,
        imageUrl: entry.imageUrl,
        matchedKeywords: entry.matchedKeywords,
        relevanceScore: entry.relevanceScore,
        publishedAt: entry.publishedAt,
        contentHash: entry.contentHash,
        rawMetadata: toJsonObject(entry.rawMetadata),
        failureReason: null,
        status: source.reviewMode === 'AUTOMATIC' ? 'REVIEWED' : existing.status,
      },
    });
    updated += 1;
  }

  return { inserted, updated, duplicates };
}

export async function listExternalNewsSources(input: ListExternalNewsSourcesInput) {
  const prisma = getPrismaClient();
  const where = {
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: 'insensitive' as const } },
            { domain: { contains: input.q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };
  const [items, total, active] = await prisma.$transaction([
    prisma.externalNewsSource.findMany({
      where,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: sourceSelect,
    }),
    prisma.externalNewsSource.count({ where: { deletedAt: null } }),
    prisma.externalNewsSource.count({ where: { deletedAt: null, status: 'ACTIVE' } }),
  ]);

  return {
    items: items.map(mapSource),
    summary: { total, active, paused: total - active },
  };
}

export async function detectExternalNewsSource(input: DetectExternalNewsSourceInput) {
  const normalizedWebsite = parseApprovedUrl(input.websiteUrl, 'URL oficial');
  const normalizedListing = input.listingUrl
    ? parseApprovedUrl(input.listingUrl, 'URL de noticias')
    : normalizedWebsite;
  const normalizedFeed = input.feedUrl ? parseApprovedUrl(input.feedUrl, 'URL técnica') : null;
  const domain = normalizeDomain(
    input.domain ?? normalizedListing.hostname ?? normalizedWebsite.hostname,
  );

  for (const [url, field] of [
    [normalizedWebsite, 'URL oficial'],
    [normalizedListing, 'URL de noticias'],
    [normalizedFeed, 'URL técnica'],
  ] as const) {
    if (url && !hostBelongsToDomain(url.hostname, domain)) {
      throw new AppError(
        `${field}: el dominio no coincide con el dominio aprobado.`,
        422,
        'EXTERNAL_NEWS_SOURCE_DOMAIN_MISMATCH',
      );
    }
  }

  try {
    return await detectNewsSource({
      key: 'source-preview',
      name: input.name,
      domain,
      websiteUrl: normalizedWebsite.toString(),
      listingUrl: normalizedListing.toString(),
      feedUrl: normalizedFeed?.toString() ?? null,
      discoveryUrl: null,
      detectedMethod: null,
      ingestionMethod: input.ingestionMethod,
      language: input.language,
      includeKeywords: input.includeKeywords,
      excludeKeywords: input.excludeKeywords,
      includeUrlPatterns: input.includeUrlPatterns,
      excludeUrlPatterns: input.excludeUrlPatterns,
      minimumRelevanceScore: input.minimumRelevanceScore,
      maxItemsPerSync: input.maxItemsPerSync,
    });
  } catch (error: unknown) {
    throw new AppError(
      error instanceof Error ? error.message : 'No fue posible detectar la fuente.',
      422,
      'EXTERNAL_NEWS_SOURCE_DETECTION_FAILED',
    );
  }
}

export async function createExternalNewsSource(
  actor: SourceActor,
  input: CreateExternalNewsSourceInput,
) {
  const prisma = getPrismaClient();
  const data = normalizeSourceInput(input);
  const key = normalizeKey(data.domain || input.name);

  if (!key || !data.domain || !data.websiteUrl || !data.listingUrl) {
    throw new AppError('No fue posible normalizar la fuente.', 400, 'EXTERNAL_NEWS_SOURCE_INVALID');
  }

  return prisma.$transaction(async (transaction: NewsSourceTransactionClient) => {
    const existing = await transaction.externalNewsSource.findFirst({
      where: { OR: [{ key }, { domain: data.domain }] },
      select: { id: true, deletedAt: true },
    });

    if (existing && !existing.deletedAt) {
      throw new AppError(
        'Ya existe una fuente con ese dominio.',
        409,
        'EXTERNAL_NEWS_SOURCE_CONFLICT',
      );
    }

    const source = existing
      ? await transaction.externalNewsSource.update({
          where: { id: existing.id },
          data: {
            ...data,
            key,
            discoveryUrl: null,
            detectedMethod: null,
            consecutiveFailures: 0,
            nextSyncAt:
              data.status === 'ACTIVE' && data.ingestionMethod !== 'MANUAL' ? new Date() : null,
            deletedAt: null,
            lastSyncStatus: null,
            lastSyncMessage: null,
          },
          select: sourceSelect,
        })
      : await transaction.externalNewsSource.create({
          data: {
            ...data,
            key,
            nextSyncAt:
              data.status === 'ACTIVE' && data.ingestionMethod !== 'MANUAL' ? new Date() : null,
          },
          select: sourceSelect,
        });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: existing ? 'EXTERNAL_NEWS_SOURCE_RESTORED' : 'EXTERNAL_NEWS_SOURCE_CREATED',
        entityType: 'ExternalNewsSource',
        entityId: source.id,
        after: {
          key: source.key,
          name: source.name,
          domain: source.domain,
          status: source.status,
          ingestionMethod: source.ingestionMethod,
          listingUrl: source.listingUrl,
        },
      },
    });

    return mapSource(source);
  });
}

export async function updateExternalNewsSource(
  actor: SourceActor,
  sourceId: string,
  input: UpdateExternalNewsSourceInput,
) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction: NewsSourceTransactionClient) => {
    const existing = await transaction.externalNewsSource.findFirst({
      where: { id: sourceId, deletedAt: null },
      select: sourceSelect,
    });

    if (!existing) {
      throw new AppError('No se encontró la fuente.', 404, 'EXTERNAL_NEWS_SOURCE_NOT_FOUND');
    }

    const mergedInput: CreateExternalNewsSourceInput = {
      name: input.name ?? existing.name,
      domain: input.domain ?? existing.domain,
      websiteUrl: input.websiteUrl ?? existing.websiteUrl,
      listingUrl:
        input.listingUrl === undefined
          ? (existing.listingUrl ?? existing.websiteUrl)
          : input.listingUrl,
      feedUrl: input.feedUrl === undefined ? existing.feedUrl : input.feedUrl,
      type: input.type ?? existing.type,
      status: input.status ?? existing.status,
      ingestionMethod: input.ingestionMethod ?? existing.ingestionMethod,
      reviewMode: input.reviewMode ?? existing.reviewMode,
      language: input.language ?? existing.language,
      includeKeywords: input.includeKeywords ?? existing.includeKeywords,
      excludeKeywords: input.excludeKeywords ?? existing.excludeKeywords,
      includeUrlPatterns: input.includeUrlPatterns ?? existing.includeUrlPatterns,
      excludeUrlPatterns: input.excludeUrlPatterns ?? existing.excludeUrlPatterns,
      minimumRelevanceScore: input.minimumRelevanceScore ?? existing.minimumRelevanceScore,
      maxItemsPerSync: input.maxItemsPerSync ?? existing.maxItemsPerSync,
      checkIntervalMinutes: input.checkIntervalMinutes ?? existing.checkIntervalMinutes,
    };
    const data = normalizeSourceInput(mergedInput);
    const domainConflict = await transaction.externalNewsSource.findFirst({
      where: {
        id: { not: sourceId },
        deletedAt: null,
        domain: data.domain,
      },
      select: { id: true },
    });

    if (domainConflict) {
      throw new AppError(
        'Otra fuente ya utiliza ese dominio.',
        409,
        'EXTERNAL_NEWS_SOURCE_CONFLICT',
      );
    }

    const discoveryConfigChanged = Boolean(
      input.domain !== undefined ||
      input.websiteUrl !== undefined ||
      input.listingUrl !== undefined ||
      input.feedUrl !== undefined ||
      input.ingestionMethod !== undefined ||
      input.includeUrlPatterns !== undefined ||
      input.excludeUrlPatterns !== undefined,
    );
    const source = await transaction.externalNewsSource.update({
      where: { id: sourceId },
      data: {
        ...data,
        ...(discoveryConfigChanged
          ? {
              discoveryUrl: null,
              detectedMethod: null,
              consecutiveFailures: 0,
              lastSyncStatus: null,
              lastSyncMessage: null,
            }
          : {}),
        nextSyncAt:
          data.status === 'ACTIVE' && data.ingestionMethod !== 'MANUAL' ? new Date() : null,
      },
      select: sourceSelect,
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXTERNAL_NEWS_SOURCE_UPDATED',
        entityType: 'ExternalNewsSource',
        entityId: source.id,
        before: {
          status: existing.status,
          listingUrl: existing.listingUrl,
          feedUrl: existing.feedUrl,
          ingestionMethod: existing.ingestionMethod,
        },
        after: {
          status: source.status,
          listingUrl: source.listingUrl,
          feedUrl: source.feedUrl,
          ingestionMethod: source.ingestionMethod,
        },
      },
    });

    return mapSource(source);
  });
}

export async function removeExternalNewsSource(actor: SourceActor, sourceId: string) {
  const prisma = getPrismaClient();

  return prisma.$transaction(async (transaction: NewsSourceTransactionClient) => {
    const existing = await transaction.externalNewsSource.findFirst({
      where: { id: sourceId, deletedAt: null },
      select: { id: true, name: true, domain: true },
    });

    if (!existing) {
      throw new AppError('No se encontró la fuente.', 404, 'EXTERNAL_NEWS_SOURCE_NOT_FOUND');
    }

    await transaction.externalNewsSource.update({
      where: { id: sourceId },
      data: { status: 'PAUSED', nextSyncAt: null, deletedAt: new Date() },
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'EXTERNAL_NEWS_SOURCE_REMOVED',
        entityType: 'ExternalNewsSource',
        entityId: sourceId,
        before: existing,
      },
    });

    return { id: sourceId, removed: true };
  });
}

export async function syncExternalNewsSource(actor: SourceActor, sourceId: string) {
  const prisma = getPrismaClient();
  const source = await prisma.externalNewsSource.findFirst({
    where: { id: sourceId, deletedAt: null },
    select: {
      ...sourceSelect,
      deletedAt: true,
    },
  });

  if (!source) {
    throw new AppError('No se encontró la fuente.', 404, 'EXTERNAL_NEWS_SOURCE_NOT_FOUND');
  }

  if (source.status !== 'ACTIVE') {
    throw new AppError(
      'La fuente está pausada. Actívala antes de buscar.',
      409,
      'EXTERNAL_NEWS_SOURCE_PAUSED',
    );
  }

  if (source.ingestionMethod === 'MANUAL') {
    throw new AppError(
      'La fuente está configurada para carga manual.',
      422,
      'EXTERNAL_NEWS_SOURCE_MANUAL',
    );
  }

  const startedAt = Date.now();
  const run = await prisma.externalNewsSyncRun.create({
    data: { sourceId: source.id, status: 'RUNNING' },
    select: { id: true },
  });

  try {
    const discoveryResult = await fetchAndParseSourceResult(toSourceConfig(source));
    let counts = { inserted: 0, updated: 0, duplicates: 0 };

    await prisma.$transaction(async (transaction: NewsSourceTransactionClient) => {
      counts = await persistEntries(transaction, source, discoveryResult.entries);
      const now = new Date();

      await transaction.externalNewsSource.update({
        where: { id: source.id },
        data: {
          discoveryUrl: discoveryResult.discoveryUrl,
          detectedMethod: discoveryResult.strategy,
          lastSyncAt: now,
          lastSuccessAt: now,
          lastSyncStatus: 'SUCCESS',
          lastSyncMessage: `${discoveryResult.accepted} candidatas aceptadas mediante ${discoveryResult.strategy}.`,
          consecutiveFailures: 0,
          nextSyncAt: nextSyncDate(source.checkIntervalMinutes),
        },
      });

      await transaction.externalNewsSyncRun.update({
        where: { id: run.id },
        data: {
          finishedAt: now,
          status: 'SUCCESS',
          strategy: discoveryResult.strategy,
          discoveryUrl: discoveryResult.discoveryUrl,
          fetched: discoveryResult.fetched,
          accepted: discoveryResult.accepted,
          inserted: counts.inserted,
          updated: counts.updated,
          duplicates: counts.duplicates,
          excluded: discoveryResult.excluded,
          durationMs: Date.now() - startedAt,
          diagnostics: toJsonValue(discoveryResult.diagnostics) ?? [],
        },
      });

      await transaction.auditLog.create({
        data: {
          actorId: actor.id,
          action: 'EXTERNAL_NEWS_SOURCE_SYNCED',
          entityType: 'ExternalNewsSource',
          entityId: source.id,
          metadata: {
            strategy: discoveryResult.strategy,
            discoveryUrl: discoveryResult.discoveryUrl,
            ...counts,
            accepted: discoveryResult.accepted,
          },
        },
      });
    });

    return {
      sourceId: source.id,
      sourceName: source.name,
      strategy: discoveryResult.strategy,
      discoveryUrl: discoveryResult.discoveryUrl,
      fetched: discoveryResult.fetched,
      accepted: discoveryResult.accepted,
      inserted: counts.inserted,
      updated: counts.updated,
      duplicates: counts.duplicates,
      excluded: discoveryResult.excluded,
      diagnostics: discoveryResult.diagnostics.slice(0, 12),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido al sincronizar.';
    const failures = source.consecutiveFailures + 1;
    const now = new Date();

    await prisma.$transaction([
      prisma.externalNewsSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: now,
          lastSyncStatus: 'FAILED',
          lastSyncMessage: message.slice(0, 1000),
          consecutiveFailures: failures,
          nextSyncAt: nextSyncDate(source.checkIntervalMinutes, failures),
        },
      }),
      prisma.externalNewsSyncRun.update({
        where: { id: run.id },
        data: {
          finishedAt: now,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          errorMessage: message.slice(0, 4000),
        },
      }),
    ]);

    throw new AppError(
      `No fue posible buscar en ${source.name}: ${message}`,
      502,
      'EXTERNAL_NEWS_SOURCE_SYNC_FAILED',
    );
  }
}

export async function syncAllExternalNewsSources(actor: SourceActor) {
  const prisma = getPrismaClient();
  const sources = await prisma.externalNewsSource.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ingestionMethod: { not: 'MANUAL' },
    },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  const results: Array<
    | {
        sourceId: string;
        sourceName: string;
        ok: true;
        result: Awaited<ReturnType<typeof syncExternalNewsSource>>;
      }
    | { sourceId: string; sourceName: string; ok: false; error: string }
  > = [];

  for (const source of sources) {
    try {
      const result = await syncExternalNewsSource(actor, source.id);
      results.push({ sourceId: source.id, sourceName: source.name, ok: true, result });
    } catch (error: unknown) {
      results.push({
        sourceId: source.id,
        sourceName: source.name,
        ok: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
      });
    }
  }

  return {
    total: sources.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}
