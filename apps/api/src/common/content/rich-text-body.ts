import { richTextBodySchema, type RichTextBody } from '@intgarti/contracts';
import { z } from 'zod';

type RichTextNode = RichTextBody['document']['content'][number];

export type DatabaseJsonValue =
  string | number | boolean | null | DatabaseJsonObject | DatabaseJsonValue[];

export interface DatabaseJsonObject {
  [key: string]: DatabaseJsonValue;
}

export const legacyNewsBlockSchema = z.object({
  type: z.string().trim().min(1).max(50),
  data: z.record(z.string(), z.unknown()).default({}),
});

export const legacyNewsBodySchema = z.object({
  version: z.number().int().positive().default(1),
  blocks: z.array(legacyNewsBlockSchema).max(500),
});

export const emptyRichTextBody: RichTextBody = {
  schemaVersion: 1,
  editor: 'tiptap',
  document: {
    type: 'doc',
    content: [],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getItemText(value: unknown): string {
  if (typeof value === 'string') {
    return stripHtml(value);
  }

  if (isRecord(value)) {
    const possibleText = value.text ?? value.content ?? value.value ?? value.html;

    if (typeof possibleText === 'string') {
      return stripHtml(possibleText);
    }
  }

  return '';
}

function getLegacyBlockText(data: Record<string, unknown>): string {
  const directText = data.text ?? data.content ?? data.value ?? data.html;

  if (typeof directText === 'string') {
    return stripHtml(directText);
  }

  if (Array.isArray(data.items)) {
    return data.items
      .map(getItemText)
      .filter((item) => item.length > 0)
      .join('\n');
  }

  return '';
}

function createTextContent(text: string): RichTextNode[] {
  if (!text) {
    return [];
  }

  return [
    {
      type: 'text',
      text,
    },
  ];
}

function normalizeHeadingLevel(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return 2;
  }

  return Math.min(6, Math.max(1, parsed));
}

function convertLegacyBlock(block: z.infer<typeof legacyNewsBlockSchema>): RichTextNode {
  const normalizedType = block.type.trim().toLowerCase();
  const text = getLegacyBlockText(block.data);
  const content = createTextContent(text);

  if (normalizedType === 'heading' || normalizedType === 'header') {
    return {
      type: 'heading',
      attrs: {
        level: normalizeHeadingLevel(block.data.level),
      },
      content,
    };
  }

  if (normalizedType === 'blockquote' || normalizedType === 'quote') {
    return {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content,
        },
      ],
    };
  }

  if (
    normalizedType === 'code' ||
    normalizedType === 'codeblock' ||
    normalizedType === 'code-block'
  ) {
    return {
      type: 'codeBlock',
      content,
    };
  }

  return {
    type: 'paragraph',
    content,
  };
}

export function normalizeStoredRichTextBody(value: unknown): RichTextBody {
  const canonical = richTextBodySchema.safeParse(value);

  if (canonical.success) {
    return canonical.data;
  }

  const legacy = legacyNewsBodySchema.safeParse(value);

  if (!legacy.success) {
    return emptyRichTextBody;
  }

  return {
    schemaVersion: 1,
    editor: 'tiptap',
    document: {
      type: 'doc',
      content: legacy.data.blocks.map(convertLegacyBlock),
    },
  };
}

function convertToDatabaseJsonValue(value: unknown): DatabaseJsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('El contenido JSON contiene un número no válido.');
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(convertToDatabaseJsonValue);
  }

  if (isRecord(value)) {
    const result: DatabaseJsonObject = {};

    for (const [key, entryValue] of Object.entries(value)) {
      if (entryValue === undefined) {
        continue;
      }

      result[key] = convertToDatabaseJsonValue(entryValue);
    }

    return result;
  }

  throw new TypeError('El contenido contiene un valor que no puede almacenarse como JSON.');
}

export function toDatabaseJsonObject(value: unknown): DatabaseJsonObject {
  const converted = convertToDatabaseJsonValue(value);

  if (converted === null || Array.isArray(converted) || typeof converted !== 'object') {
    throw new TypeError('Se esperaba un objeto JSON.');
  }

  return converted;
}

export const newsBodyInputSchema = z
  .union([richTextBodySchema, legacyNewsBodySchema])
  .transform((value) => normalizeStoredRichTextBody(value));
