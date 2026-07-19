import { getPrismaClient } from '@intgarti/database';
import { fetchAndParseSourceResult, type NewsSourceConfig } from '@intgarti/news-ingestion';
import { toJsonObject } from '../utils/json.js';

type NewsWorkerTransactionClient = Pick<
  ReturnType<typeof getPrismaClient>,
  'externalNewsSource' | 'externalNewsItem' | 'externalNewsSyncRun'
>;

export interface ExternalNewsIngestionResult {
  sources: number;
  succeeded: number;
  failed: number;
  inserted: number;
  updated: number;
  duplicates: number;
  strategies: Record<string, number>;
  errors: Array<{ sourceId: string; sourceName: string; message: string }>;
}

function nextSyncDate(intervalMinutes: number, failures = 0): Date {
  const multiplier = 2 ** Math.min(failures, 4);
  const minutes = Math.min(intervalMinutes * multiplier, 10_080);
  return new Date(Date.now() + minutes * 60_000);
}

export async function ingestExternalNewsSources(): Promise<ExternalNewsIngestionResult> {
  const prisma = getPrismaClient();
  const now = new Date();
  const sources = await prisma.externalNewsSource.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ingestionMethod: { not: 'MANUAL' },
      OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: now } }],
    },
    orderBy: [{ nextSyncAt: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      key: true,
      name: true,
      domain: true,
      websiteUrl: true,
      listingUrl: true,
      feedUrl: true,
      discoveryUrl: true,
      detectedMethod: true,
      ingestionMethod: true,
      language: true,
      includeKeywords: true,
      excludeKeywords: true,
      includeUrlPatterns: true,
      excludeUrlPatterns: true,
      minimumRelevanceScore: true,
      maxItemsPerSync: true,
      reviewMode: true,
      checkIntervalMinutes: true,
      consecutiveFailures: true,
    },
  });
  const result: ExternalNewsIngestionResult = {
    sources: sources.length,
    succeeded: 0,
    failed: 0,
    inserted: 0,
    updated: 0,
    duplicates: 0,
    strategies: {},
    errors: [],
  };

  for (const source of sources) {
    const startedAt = Date.now();
    const run = await prisma.externalNewsSyncRun.create({
      data: { sourceId: source.id, status: 'RUNNING' },
      select: { id: true },
    });

    try {
      const sourceConfig: NewsSourceConfig = {
        key: source.key,
        name: source.name,
        domain: source.domain,
        websiteUrl: source.websiteUrl,
        listingUrl: source.listingUrl,
        feedUrl: source.feedUrl,
        discoveryUrl: source.discoveryUrl,
        detectedMethod: source.detectedMethod,
        ingestionMethod: source.ingestionMethod,
        language: source.language,
        includeKeywords: source.includeKeywords,
        excludeKeywords: source.excludeKeywords,
        includeUrlPatterns: source.includeUrlPatterns,
        excludeUrlPatterns: source.excludeUrlPatterns,
        minimumRelevanceScore: source.minimumRelevanceScore,
        maxItemsPerSync: source.maxItemsPerSync,
      };
      const discovery = await fetchAndParseSourceResult(sourceConfig);
      let sourceInserted = 0;
      let sourceUpdated = 0;
      let sourceDuplicates = 0;

      await prisma.$transaction(async (transaction: NewsWorkerTransactionClient) => {
        for (const entry of discovery.entries) {
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
            sourceInserted += 1;
            continue;
          }

          if (existing.status === 'IMPORTED' || existing.status === 'DISCARDED') {
            sourceDuplicates += 1;
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
          sourceUpdated += 1;
        }

        const finishedAt = new Date();

        await transaction.externalNewsSource.update({
          where: { id: source.id },
          data: {
            discoveryUrl: discovery.discoveryUrl,
            detectedMethod: discovery.strategy,
            lastSyncAt: finishedAt,
            lastSuccessAt: finishedAt,
            lastSyncStatus: 'SUCCESS',
            lastSyncMessage: `${discovery.accepted} candidatas aceptadas mediante ${discovery.strategy}.`,
            consecutiveFailures: 0,
            nextSyncAt: nextSyncDate(source.checkIntervalMinutes),
          },
        });

        await transaction.externalNewsSyncRun.update({
          where: { id: run.id },
          data: {
            finishedAt,
            status: 'SUCCESS',
            strategy: discovery.strategy,
            discoveryUrl: discovery.discoveryUrl,
            fetched: discovery.fetched,
            accepted: discovery.accepted,
            inserted: sourceInserted,
            updated: sourceUpdated,
            duplicates: sourceDuplicates,
            excluded: discovery.excluded,
            durationMs: Date.now() - startedAt,
            diagnostics: toJsonObject(discovery.diagnostics),
          },
        });
      });

      result.succeeded += 1;
      result.inserted += sourceInserted;
      result.updated += sourceUpdated;
      result.duplicates += sourceDuplicates;
      result.strategies[discovery.strategy] = (result.strategies[discovery.strategy] ?? 0) + 1;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      const failures = source.consecutiveFailures + 1;
      const finishedAt = new Date();

      result.failed += 1;
      result.errors.push({ sourceId: source.id, sourceName: source.name, message });

      await prisma.$transaction([
        prisma.externalNewsSource.update({
          where: { id: source.id },
          data: {
            lastSyncAt: finishedAt,
            lastSyncStatus: 'FAILED',
            lastSyncMessage: message.slice(0, 1000),
            consecutiveFailures: failures,
            nextSyncAt: nextSyncDate(source.checkIntervalMinutes, failures),
          },
        }),
        prisma.externalNewsSyncRun.update({
          where: { id: run.id },
          data: {
            finishedAt,
            status: 'FAILED',
            durationMs: Date.now() - startedAt,
            errorMessage: message.slice(0, 4000),
          },
        }),
      ]);
    }
  }

  return result;
}
