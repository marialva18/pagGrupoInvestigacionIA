# Arquitectura INTGARTI

## Monorepo

- `apps/web`: Astro, React Islands y Tailwind.
- `apps/api`: Express, TypeScript y Zod.
- `apps/worker`: procesos asÃƒÂ­ncronos.
- `packages/database`: Prisma y PostgreSQL/Supabase.
- `packages/contracts`: esquemas y contratos compartidos.
- `packages/ui`: tokens visuales.
- `packages/config`: configuraciÃƒÂ³n TypeScript.

## Regla de acceso

`Web Ã¢â€ â€™ API Ã¢â€ â€™ PostgreSQL / Supabase Storage`

El navegador no consulta directamente tablas ni usa la service role key.
