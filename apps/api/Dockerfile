# ── deps ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /repo

RUN corepack enable

# Manifests only, so the install layer is cached until a dependency changes
# rather than on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/calc/package.json ./packages/calc/
COPY apps/api/package.json ./apps/api/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --filter api...

# ── build ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /repo

RUN corepack enable

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/calc/node_modules ./packages/calc/node_modules
COPY --from=deps /repo/apps/api/node_modules ./apps/api/node_modules

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/calc ./packages/calc
COPY apps/api ./apps/api

# The calculation module must be compiled before the API that imports it.
RUN pnpm --filter @pricing/calc build && pnpm --filter api build

# Collects the API plus its production dependencies (with @pricing/calc's dist
# folded in) into a single self-contained tree.
RUN pnpm --filter api deploy --prod --legacy /out

# ── runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Never run the server as root.
RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /out ./

USER app
EXPOSE 4000

# Migrations are run as a separate pre-deploy step rather than on boot, so a
# failed migration fails the deploy instead of crash-looping the service:
#   node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
CMD ["node", "dist/main.js"]
