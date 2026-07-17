import pino from 'pino';
import { getPrismaClient } from '@intgarti/database';
import { env } from './config/env.js';
import { processNextImage } from './jobs/process-image.job.js';

const logger = pino({
  level: env.LOG_LEVEL,
});

let stopping = false;

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
    },
    'INTGARTI image worker started.',
  );

  while (!stopping) {
    try {
      const result = await processNextImage();

      if (result) {
        logger.info(result, 'Image processed successfully.');

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
