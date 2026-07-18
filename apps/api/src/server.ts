import { app } from './app.js';
import { env } from './config/env.js';

if (env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

const port = env.PORT ?? env.API_PORT;
const host = '0.0.0.0';

const server = app.listen(port, host, () => {
  console.log(`INTGARTI API listening on http://${host}:${port}/api/v1/health`);
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
