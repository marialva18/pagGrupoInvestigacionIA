import { spawn } from 'node:child_process';

const imageWorkerEnabled = process.env.ENABLE_IMAGE_WORKER === 'true';

const parsedRestartDelay = Number.parseInt(
  process.env.IMAGE_WORKER_RESTART_DELAY_MS ?? '10000',
  10,
);

const workerRestartDelayMs =
  Number.isFinite(parsedRestartDelay) && parsedRestartDelay >= 1000 ? parsedRestartDelay : 10000;

const children = new Map();

let shuttingDown = false;
let requestedExitCode = 0;
let forceExitTimer;
let workerRestartTimer;

function createWorkerNodeOptions() {
  const currentOptions = process.env.NODE_OPTIONS?.trim() ?? '';

  if (currentOptions.includes('--max-old-space-size')) {
    return currentOptions;
  }

  return [currentOptions, '--max-old-space-size=192'].filter(Boolean).join(' ');
}

const apiDefinition = {
  name: 'api',
  entry: 'apps/api/dist/server.js',
  critical: true,
  env: process.env,
};

const workerDefinition = {
  name: 'image-worker',
  entry: 'apps/worker/dist/main.js',
  critical: false,
  env: {
    ...process.env,
    MALLOC_ARENA_MAX: process.env.MALLOC_ARENA_MAX ?? '2',
    NODE_OPTIONS: createWorkerNodeOptions(),
  },
};

function completeShutdown() {
  if (forceExitTimer) {
    clearTimeout(forceExitTimer);
  }

  if (workerRestartTimer) {
    clearTimeout(workerRestartTimer);
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

  if (workerRestartTimer) {
    clearTimeout(workerRestartTimer);
    workerRestartTimer = undefined;
  }

  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill(signal);
    }
  }

  if (children.size === 0) {
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

function scheduleWorkerRestart() {
  if (shuttingDown || !imageWorkerEnabled || workerRestartTimer) {
    return;
  }

  console.log(
    `[render] Reiniciando image-worker en ${workerRestartDelayMs} ms para liberar memoria.`,
  );

  workerRestartTimer = setTimeout(() => {
    workerRestartTimer = undefined;
    startService(workerDefinition);
  }, workerRestartDelayMs);
}

function startService(definition) {
  if (shuttingDown) {
    return;
  }

  console.log(`[render] Iniciando ${definition.name}.`);

  const child = spawn(process.execPath, [definition.entry], {
    cwd: process.cwd(),
    env: definition.env,
    stdio: 'inherit',
  });

  children.set(definition.name, child);

  let settled = false;

  function handleTermination(code, signal, error) {
    if (settled) {
      return;
    }

    settled = true;

    if (children.get(definition.name) === child) {
      children.delete(definition.name);
    }

    if (error) {
      console.error(`[render] ${definition.name} no pudo iniciarse.`, error);
    } else {
      console.log(
        `[render] ${definition.name} terminó. Código: ${
          code ?? 'sin código'
        }. Señal: ${signal ?? 'ninguna'}.`,
      );
    }

    if (shuttingDown) {
      if (children.size === 0) {
        completeShutdown();
      }

      return;
    }

    if (definition.critical) {
      const exitCode = typeof code === 'number' && code !== 0 ? code : 1;
      initiateShutdown(exitCode);
      return;
    }

    scheduleWorkerRestart();
  }

  child.once('error', (error) => {
    handleTermination(null, null, error);
  });

  child.once('exit', (code, signal) => {
    handleTermination(code, signal, null);
  });
}

process.once('SIGINT', () => {
  initiateShutdown(0, 'SIGINT');
});

process.once('SIGTERM', () => {
  initiateShutdown(0, 'SIGTERM');
});

startService(apiDefinition);

if (imageWorkerEnabled) {
  startService(workerDefinition);
} else {
  console.log('[render] image-worker deshabilitado mediante ENABLE_IMAGE_WORKER.');
}
