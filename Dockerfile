# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:20-slim AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo

# Copy manifests first for layer cache optimisation
COPY package.json pnpm-workspace.yaml ./
COPY apps/agents/package.json ./apps/agents/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/signal/package.json ./packages/signal/

RUN pnpm install --no-frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

# turbo filter `...` means "this package and all workspace dependencies"
# respects dependsOn: ["^build"] in turbo.json so packages build in correct order
RUN pnpm exec turbo run build --filter=@platform/agents...

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

WORKDIR /app

COPY --from=builder /repo/apps/agents/dist ./dist

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "dist/index.js"]
