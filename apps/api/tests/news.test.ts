import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createApp } from '../src/app.ts';
import { authenticatedFetch, testAuthenticateAccessToken } from './helpers/test-auth.ts';
import { mapMediaReference } from '../src/modules/media/media-reference.ts';
import { createNewsSchema, updateNewsSchema } from '../src/modules/news/news.schema.ts';
import { normalizeStoredRichTextBody } from '../src/common/content/rich-text-body.ts';

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

test('rejects a publish request without lock version', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/news/00000000-0000-4000-8000-000000000001/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_PUBLISH_INVALID_INPUT');
  });
});

test('rejects an unpublish request without lock version', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await authenticatedFetch(
      `${baseUrl}/api/v1/editor/news/00000000-0000-4000-8000-000000000001/unpublish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    assert.equal(response.status, 400);

    const body = (await response.json()) as {
      error: {
        code: string;
      };
    };

    assert.equal(body.error.code, 'NEWS_UNPUBLISH_INVALID_INPUT');
  });
});

test('accepts a canonical TipTap news body', () => {
  const result = createNewsSchema.safeParse({
    title: 'Noticia con contenido estructurado',
    summary: 'Resumen suficientemente extenso para validar una noticia con cuerpo TipTap.',
    body: {
      schemaVersion: 1,
      editor: 'tiptap',
      document: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Contenido público de la noticia.',
              },
            ],
          },
        ],
      },
    },
    categoryIds: ['00000000-0000-4000-8000-000000000002'],
  });

  assert.equal(result.success, true);

  if (!result.success) {
    return;
  }

  assert.equal(result.data.body.editor, 'tiptap');
  assert.equal(result.data.body.document.type, 'doc');
});

test('normalizes the legacy news body into TipTap', () => {
  const body = normalizeStoredRichTextBody({
    version: 1,
    blocks: [
      {
        type: 'heading',
        data: {
          level: 2,
          text: 'Título anterior',
        },
      },
      {
        type: 'paragraph',
        data: {
          text: 'Contenido anterior que debe seguir apareciendo públicamente.',
        },
      },
    ],
  });

  assert.equal(body.schemaVersion, 1);
  assert.equal(body.editor, 'tiptap');
  assert.equal(body.document.content.length, 2);

  const heading = body.document.content[0] as {
    type?: string;
    content?: Array<{
      text?: string;
    }>;
  };

  const paragraph = body.document.content[1] as {
    type?: string;
    content?: Array<{
      text?: string;
    }>;
  };

  assert.equal(heading.type, 'heading');
  assert.equal(heading.content?.[0]?.text, 'Título anterior');
  assert.equal(paragraph.type, 'paragraph');
  assert.equal(
    paragraph.content?.[0]?.text,
    'Contenido anterior que debe seguir apareciendo públicamente.',
  );
});

test('maps an editorial cover into public URLs', () => {
  const mapped = mapMediaReference({
    id: '00000000-0000-4000-8000-000000000010',
    bucket: 'intgarti-media',
    objectKey: 'news/example/original image.webp',
    altText: 'Imagen de portada',
    caption: null,
    credit: null,
    rightsStatus: 'VERIFIED',
    status: 'READY',
    archivedAt: null,
    width: 1200,
    height: 800,
    variants: [
      {
        id: '00000000-0000-4000-8000-000000000011',
        kind: 'THUMBNAIL',
        objectKey: 'news/example/thumbnail image.webp',
        mimeType: 'image/webp',
        sizeBytes: 2048n,
        width: 320,
        height: 213,
      },
    ],
  });

  assert.ok(mapped);
  assert.equal(mapped.id, '00000000-0000-4000-8000-000000000010');
  assert.ok(mapped.url.includes('original%20image.webp'));
  assert.equal(mapped.variants.length, 1);
  assert.equal(mapped.variants[0]?.kind, 'THUMBNAIL');
  assert.ok(mapped.variants[0]?.url.includes('thumbnail%20image.webp'));
  assert.equal('objectKey' in mapped, false);
});
