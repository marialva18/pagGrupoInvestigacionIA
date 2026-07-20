import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);

  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return true;
  }

  const a = octets[0];
  const b = octets[1];

  if (a === undefined || b === undefined) return true;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();

  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

export function hostnameBelongsToDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = normalizeDomain(hostname);
  const normalizedDomain = normalizeDomain(domain);

  return (
    normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

export function validateSourceUrl(value: string): URL {
  const url = new URL(value);

  if (url.protocol !== 'https:') {
    throw new Error('Las fuentes externas deben utilizar HTTPS.');
  }

  if (url.username || url.password) {
    throw new Error('La URL no puede contener credenciales.');
  }

  const hostname = url.hostname.toLowerCase();

  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('El dominio de la fuente no es público.');
  }

  const literalIpVersion = isIP(hostname);

  if (
    (literalIpVersion === 4 && isPrivateIpv4(hostname)) ||
    (literalIpVersion === 6 && isPrivateIpv6(hostname))
  ) {
    throw new Error('La URL no puede apuntar a una red privada.');
  }

  url.hash = '';
  return url;
}

export async function assertPublicNetworkTarget(url: URL): Promise<void> {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });

  if (addresses.length === 0) {
    throw new Error('No fue posible resolver el dominio de la fuente.');
  }

  for (const result of addresses) {
    if (
      (result.family === 4 && isPrivateIpv4(result.address)) ||
      (result.family === 6 && isPrivateIpv6(result.address))
    ) {
      throw new Error('El dominio resolvió hacia una dirección de red privada.');
    }
  }
}

export function normalizeCanonicalUrl(value: string, baseUrl: string): string {
  const candidate = new URL(value, baseUrl);

  if (candidate.protocol === 'http:') {
    candidate.protocol = 'https:';
  }

  const url = validateSourceUrl(candidate.toString());

  for (const parameter of [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'mc_cid',
    'mc_eid',
  ]) {
    url.searchParams.delete(parameter);
  }

  url.searchParams.sort();
  return url.toString();
}

export function assertUrlBelongsToSource(value: string, domain: string): URL {
  const url = validateSourceUrl(value);

  if (!hostnameBelongsToDomain(url.hostname, domain)) {
    throw new Error('La URL no pertenece al dominio aprobado.');
  }

  return url;
}
