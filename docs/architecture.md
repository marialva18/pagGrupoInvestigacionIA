# Arquitectura INTGARTI

## Monorepo

- `apps/web`: Astro, React Islands y Tailwind.
- `apps/api`: Express, TypeScript y Zod.
- `apps/worker`: procesos asíncronos.
- `packages/database`: Prisma y PostgreSQL/Supabase.
- `packages/contracts`: esquemas y contratos compartidos.
- `packages/ui`: tokens visuales.
- `packages/config`: configuración TypeScript.

## Regla de acceso

`Web → API → PostgreSQL / Supabase Storage`

El navegador no consulta directamente tablas ni usa la service role key.
