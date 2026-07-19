import pino from 'pino';
import { getPrismaClient } from '@intgarti/database';
import { env } from './config/env.js';
import { processNextImage } from './jobs/process-image.job.js';

const logger = pino({
  level: env.LOG_LEVEL,
});

let stopping = false;
let processedJobs = 0;

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
    },
    'INTGARTI image worker started.',
  );

  while (!stopping) {
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
