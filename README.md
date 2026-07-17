# Plataforma Web INTGARTI

Portal acadÃ©mico e informativo del Grupo de InvestigaciÃ³n en Inteligencia Artificial de la FISI - UNMSM.

## Arquitectura

```text
apps/
  web/       Frontend Astro + React
  api/       Backend REST Express
  worker/    Procesos asÃ­ncronos

packages/
  contracts/ Tipos y esquemas compartidos
  database/  Prisma y PostgreSQL
  config/    ConfiguraciÃ³n comÃºn
```

La comunicaciÃ³n entre frontend y backend se realiza exclusivamente mediante HTTP y JSON:

```text
Web â†’ /api/v1 â†’ API â†’ Prisma â†’ PostgreSQL
```

## Stack

- Astro + React Islands + Tailwind CSS.
- Express + TypeScript + Zod.
- Prisma + PostgreSQL/Supabase.
- Supabase Storage.
- Mailjet.
- Worker Node.js.
- pnpm workspace + Turborepo.
- Docker Compose.

## EjecuciÃ³n local con Node

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

## EjecuciÃ³n portable con Docker

```powershell
docker compose up --build
```

Para sincronizaciÃ³n automÃ¡tica:

```powershell
docker compose up --watch
```

## Direcciones

- Web: http://localhost:4321
- API: http://localhost:3001/api/v1/health
- Mailpit: http://localhost:8025

## Calidad

```powershell
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Seguridad

Nunca subir:

- `.env`
- claves de Mailjet
- service role key de Supabase
- contraseÃ±as
- secretos de sesiÃ³n
- cadenas reales de conexiÃ³n
