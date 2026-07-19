import { spawn } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const serviceDefinitions = [
  {
    name: 'api',
    args: ['--filter', '@intgarti/api', 'start'],
  },
  {
    name: 'image-worker',
    args: ['--filter', '@intgarti/worker', 'start'],
  },
];

const children = new Map();

let shuttingDown = false;
let requestedExitCode = 0;
let runningChildren = 0;
let forceExitTimer;

function completeShutdown() {
  if (forceExitTimer) {
    clearTimeout(forceExitTimer);
  }

  process.exit(requestedExitCode);
}

function initiateShutdown(exitCode = 0, signal = 'SIGTERM') {
  requestedExitCode = Math.max(requestedExitCode, exitCode);

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`[render] Deteniendo servicios con ${signal}.`);

  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }

  if (runningChildren === 0) {
    completeShutdown();
    return;
  }

  forceExitTimer = setTimeout(() => {
    console.error('[render] Forzando la detención de los procesos.');

    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }

    setTimeout(completeShutdown, 250).unref();
  }, 10_000);

  forceExitTimer.unref();
}

function startService(definition) {
  console.log(`[render] Iniciando ${definition.name}.`);

  const child = spawn(pnpmCommand, definition.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });

  children.set(definition.name, child);
  runningChildren += 1;

  child.once('error', (error) => {
    console.error(`[render] No se pudo iniciar ${definition.name}.`, error);

    initiateShutdown(1);
  });

  child.once('exit', (code, signal) => {
    children.delete(definition.name);
    runningChildren -= 1;

    if (!shuttingDown) {
      console.error(
        `[render] ${definition.name} terminó inesperadamente. Código: ${
          code ?? 'sin código'
        }. Señal: ${signal ?? 'ninguna'}.`,
      );

      const unexpectedExitCode = typeof code === 'number' && code !== 0 ? code : 1;

      initiateShutdown(unexpectedExitCode);
    }

    if (shuttingDown && runningChildren === 0) {
      completeShutdown();
    }
  });
}

process.once('SIGINT', () => {
  initiateShutdown(0, 'SIGINT');
});

process.once('SIGTERM', () => {
  initiateShutdown(0, 'SIGTERM');
});

for (const definition of serviceDefinitions) {
  startService(definition);
}
