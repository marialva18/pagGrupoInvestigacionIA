import type { Request } from 'express';

export function getRequestId(request: Request): string | undefined {
  const requestId = request.id;

  if (requestId === undefined || requestId === null) {
    return undefined;
  }

  return String(requestId);
}
