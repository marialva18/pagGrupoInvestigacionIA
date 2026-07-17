# Plataforma Web INTGARTI

Portal académico e informativo del Grupo de Investigación en Inteligencia Artificial de la FISI - UNMSM.

## Arquitectura

```text
apps/
  web/       Frontend Astro + React
  api/       Backend REST Express
  worker/    Procesos asíncronos

packages/
  contracts/ Tipos y esquemas compartidos
  database/  Prisma y PostgreSQL
  config/    Configuración común
```

La comunicación entre frontend y backend se realiza exclusivamente mediante HTTP y JSON:

```text
Web → /api/v1 → API → Prisma → PostgreSQL
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

## Ejecución local con Node

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

## Ejecución portable con Docker

```powershell
docker compose up --build
```

Para sincronización automática:

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
- contraseñas
- secretos de sesión
- cadenas reales de conexión
