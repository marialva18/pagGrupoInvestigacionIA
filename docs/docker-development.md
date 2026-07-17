# Desarrollo con Docker

Docker proporciona a todos los integrantes:

- Node.js 24.
- La misma versiÃ³n de pnpm.
- Las mismas dependencias.
- PostgreSQL local.
- Mailpit para correo local.
- Web, API y worker como servicios separados.

## Primera ejecuciÃ³n

```powershell
docker compose up --build
```

## Desarrollo con sincronizaciÃ³n automÃ¡tica

Requiere Docker Compose 2.22 o superior:

```powershell
docker compose up --watch
```

## Direcciones

- Web: http://localhost:4321
- API: http://localhost:3001/api/v1/health
- Mailpit: http://localhost:8025
- PostgreSQL: localhost:5433

## Detener

```powershell
docker compose down
```

## Borrar tambiÃ©n la base local

```powershell
docker compose down -v --remove-orphans
```

La base PostgreSQL de Docker es para desarrollo. La nube utilizarÃ¡ Supabase PostgreSQL.
