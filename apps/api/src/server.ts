import { app } from './app.js';
import { env } from './config/env.js';

if (env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const server = app.listen(env.API_PORT, () => {
  console.log(`INTGARTI API: http://localhost:${env.API_PORT}/api/v1/health`);
});

function shutdown(signal: string): void {
  console.log(`${signal} received. Closing API server...`);

  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
