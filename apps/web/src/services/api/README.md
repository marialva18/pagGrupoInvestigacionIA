# Cliente REST del frontend

Toda comunicación con el backend debe pasar por esta carpeta.

```text
Astro / React
    ↓ fetch HTTP + JSON
services/api
    ↓
http://localhost:3001/api/v1
    ↓
Express
```

No se permite importar servicios, repositorios o Prisma desde `apps/api`.
