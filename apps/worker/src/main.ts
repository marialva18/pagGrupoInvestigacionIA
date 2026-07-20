import pino from 'pino';
import { getPrismaClient } from '@intgarti/database';
import { env } from './config/env.js';
import { processNextImage } from './jobs/process-image.job.js';
import { ingestExternalNewsSources } from './jobs/ingest-external-news.job.js';
import { archiveExpiredContent } from './jobs/archive-expired-content.job.js';

const logger = pino({
  level: env.LOG_LEVEL,
});

let stopping = false;
let processedJobs = 0;
let nextExternalNewsSyncAt = 0;
let nextContentExpirationCheckAt = 0;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function requestShutdown(signal: string): void {
  logger.info(
    {
      signal,
    },
    'Worker shutdown requested.',
  );

  stopping = true;
}

process.once('SIGINT', () => {
  requestShutdown('SIGINT');
});

process.once('SIGTERM', () => {
  requestShutdown('SIGTERM');
});

async function runWorker(): Promise<void> {
  logger.info(
    {
      pollIntervalMs: env.IMAGE_WORKER_POLL_MS,
      maxJobsPerProcess: env.IMAGE_WORKER_MAX_JOBS_PER_PROCESS,
      maxPixels: env.IMAGE_MAX_PIXELS,
      externalNewsSyncEnabled: env.EXTERNAL_NEWS_SYNC_ENABLED,
      externalNewsSyncIntervalMs: env.EXTERNAL_NEWS_SYNC_INTERVAL_MS,
      contentExpirationCheckIntervalMs: env.CONTENT_EXPIRATION_CHECK_INTERVAL_MS,
    },
    'INTGARTI image worker started.',
  );

  while (!stopping) {
    if (env.EXTERNAL_NEWS_SYNC_ENABLED && Date.now() >= nextExternalNewsSyncAt) {
      try {
        const ingestionResult = await ingestExternalNewsSources();

        logger.info(ingestionResult, 'External news synchronization completed.');
      } catch (error: unknown) {
        logger.error({ error }, 'External news synchronization failed.');
      } finally {
        nextExternalNewsSyncAt = Date.now() + env.EXTERNAL_NEWS_SYNC_INTERVAL_MS;
      }
    }

    if (Date.now() >= nextContentExpirationCheckAt) {
      try {
        const expirationResult = await archiveExpiredContent();

        if (expirationResult.archived > 0) {
          logger.info(expirationResult, 'Expired content archived.');
        }
      } catch (error: unknown) {
        logger.error({ error }, 'Expired content archival failed.');
      } finally {
        nextContentExpirationCheckAt = Date.now() + env.CONTENT_EXPIRATION_CHECK_INTERVAL_MS;
      }
    }

    try {
      const result = await processNextImage();

      if (result) {
        processedJobs += 1;

        logger.info(
          {
            ...result,
            processedJobs,
          },
          'Image processed successfully.',
        );

        if (processedJobs >= env.IMAGE_WORKER_MAX_JOBS_PER_PROCESS) {
          logger.info(
            {
              processedJobs,
            },
            'Worker job limit reached. Restarting to release native image memory.',
          );

          break;
        }

        continue;
      }
    } catch (error: unknown) {
      logger.error(
        {
          error,
        },
        'Image processing failed.',
      );
    }

    await sleep(env.IMAGE_WORKER_POLL_MS);
  }

  await getPrismaClient().$disconnect();

  logger.info('INTGARTI image worker stopped.');
}

void runWorker().catch((error: unknown) => {
  logger.fatal(
    {
      error,
    },
    'INTGARTI image worker terminated unexpectedly.',
  );

  process.exitCode = 1;
});
