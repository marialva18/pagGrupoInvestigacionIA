# ComunicaciÃ³n REST

## SeparaciÃ³n

```text
apps/web      FRONTEND
apps/api      BACKEND REST
apps/worker   PROCESOS ASÃNCRONOS
```

Aunque compartan un repositorio, son procesos y despliegues diferentes.

## Flujo

```text
Navegador
  â†“
Astro / React
  â†“ HTTP + JSON
services/api
  â†“
Express /api/v1
  â†“
Controller
  â†“
Service
  â†“
Repository
  â†“
Prisma
  â†“
PostgreSQL
```

## Reglas

- El frontend no importa cÃ³digo de `apps/api`.
- El frontend no usa Prisma.
- El frontend no recibe claves privadas.
- El backend vuelve a validar todos los datos.
- La autorizaciÃ³n siempre se aplica en la API.
- Los contratos reutilizables viven en `packages/contracts`.

## Rutas iniciales

```http
GET /api/v1/health
```

Rutas futuras:

```http
GET  /api/v1/public/news
GET  /api/v1/public/news/:slug
POST /api/v1/public/contact
POST /api/v1/public/analytics/events

POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/session

GET   /api/v1/editor/contents
POST  /api/v1/editor/contents
PATCH /api/v1/editor/contents/:id

GET   /api/v1/admin/users
PATCH /api/v1/admin/users/:id/role
GET   /api/v1/admin/analytics
GET   /api/v1/admin/audit
```
