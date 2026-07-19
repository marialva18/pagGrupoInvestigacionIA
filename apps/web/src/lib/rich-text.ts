import type { RichTextBody } from '@intgarti/contracts';

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as Record<string, unknown>;
  const ownText = typeof record.text === 'string' ? record.text : '';
  const children = Array.isArray(record.content) ? record.content.map(collectText).join('') : '';
  return `${ownText}${children}`;
}

export function richTextToParagraphs(body: RichTextBody): string[] {
  return body.document.content
    .map((node) => collectText(node).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
