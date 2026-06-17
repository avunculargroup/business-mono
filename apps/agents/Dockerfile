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
COPY packages/voice/package.json ./packages/voice/

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

COPY --from=builder /repo/apps/agents/.mastra/output ./.mastra/output
COPY --from=builder /repo/docs ./docs

ENV NODE_ENV=production

EXPOSE 3000

# --max-old-space-size gives V8 explicit heap headroom instead of auto-sizing to
# ~256 MB (the ceiling the OOM crashes hit). Keep this in step with the Railway
# startCommand in railway.toml, which overrides this CMD on Railway. 512 MB
# assumes the container has at least ~1 GB RAM — keep it below the memory limit
# or the OS OOM-killer will SIGKILL the process instead.
CMD ["node", "--max-old-space-size=512", ".mastra/output/index.mjs"]
