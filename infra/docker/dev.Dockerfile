# syntax=docker/dockerfile:1

FROM node:24-alpine AS development

RUN corepack enable && corepack prepare pnpm@11.13.1 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json

COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @intgarti/database build

CMD ["pnpm", "dev"]