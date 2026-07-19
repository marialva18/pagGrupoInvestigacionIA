import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { authenticatedFetch, testAuthenticateAccessToken } from './helpers/test-auth.ts';
import { createNewsSchema, updateNewsSchema } from '../src/modules/news/news.schema.ts';

const app = createApp({
  authenticateAccessToken: testAuthenticateAccessToken,
});

async function withApiServer(assertion: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0, '127.0.0.1');

  await once(server, 'listening');

  try {
    const address = server.address() as AddressInfo;

    await assertion(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

test('rejects an invalid news draft', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'No',
        summary: 'Muy corto',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_INVALID_INPUT');
  });
});

test('rejects invalid news list pagination', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news?page=0&pageSize=101`);

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_LIST_INVALID_QUERY');
  });
});

test('rejects an invalid news identifier', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news/not-a-uuid`);

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_INVALID_ID');
  });
});

test('rejects an empty news update', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/news/00000000-0000-4000-8000-000000000001`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lockVersion: 1,
        }),
      },
    );

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_UPDATE_INVALID_INPUT');
  });
});

test('rejects an invalid identifier when updating news', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news/not-a-uuid`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lockVersion: 1,
        title: 'Título actualizado válido',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_INVALID_ID');
  });
});

test('rejects an archive request without lock version', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/news/00000000-0000-4000-8000-000000000001`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Archivado durante una prueba del sistema.',
        }),
      },
    );

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_ARCHIVE_INVALID_INPUT');
  });
});

test('rejects an invalid identifier when archiving news', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news/not-a-uuid`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lockVersion: 1,
        reason: 'Archivado durante una prueba del sistema.',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_INVALID_ID');
  });
});

test('rejects a restore request without lock version', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/news/00000000-0000-4000-8000-000000000001/restore`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reason: 'Restauración durante una prueba del sistema.',
        }),
      },
    );

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_RESTORE_INVALID_INPUT');
  });
});

test('rejects an invalid identifier when restoring news', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news/not-a-uuid/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lockVersion: 1,
        reason: 'Restauración durante una prueba del sistema.',
      }),
    });

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_INVALID_ID');
  });
});

test('rejects an invalid identifier when listing revisions', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(`${baseUrl}/api/v1/editor/news/not-a-uuid/revisions`);

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_INVALID_ID');
  });
});

test('allows creating a draft without cover media', () => {
  const result = createNewsSchema.safeParse({
    title: 'Nuevo borrador académico',
    summary: 'Resumen válido para crear una noticia académica todavía sin portada.',
    body: {
      version: 1,
      blocks: [],
    },
    categoryIds: ['00000000-0000-4000-8000-000000000002'],
  });

  assert.equal(result.success, true);
});

test('accepts featured and nullable cover media in a news update', () => {
  const result = updateNewsSchema.safeParse({
    lockVersion: 1,
    featured: true,
    coverMediaId: null,
  });

  assert.equal(result.success, true);
});
