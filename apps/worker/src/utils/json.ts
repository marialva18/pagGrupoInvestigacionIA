export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function toJsonValue(value: unknown, seen = new WeakSet<object>()): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  if (seen.has(value)) {
    return undefined;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item, seen) ?? null);
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  const jsonObject: JsonObject = {};

  for (const [key, item] of Object.entries(value)) {
    const normalized = toJsonValue(item, seen);

    if (normalized !== undefined) {
      jsonObject[key] = normalized;
    }
  }

  return jsonObject;
}

export function toJsonObject(value: unknown): JsonObject {
  const normalized = toJsonValue(value);
  return normalized && !Array.isArray(normalized) && typeof normalized === 'object'
    ? normalized
    : {};
}
