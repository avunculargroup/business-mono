# ── Stage 1: Install dependencies ────────────────────────────────────────────
FROM node:22-slim AS deps

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /repo

# Copy manifests first for layer cache optimisation. The lockfile has to be
# copied here, not left to stage 2's `COPY . .` — that runs after install, too
# late to affect resolution. Without it, install resolves every caret range
# fresh and the deployed tree drifts from the one CI validates.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/agents/package.json ./apps/agents/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY packages/signal/package.json ./packages/signal/
COPY packages/voice/package.json ./packages/voice/

# --frozen-lockfile matches the CI workflow, so this image gets the exact tree
# the test + build jobs ran against. A manifest change without a matching
# `pnpm install` commit now fails the build loudly instead of drifting silently.
RUN pnpm install --frozen-lockfile

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM deps AS builder

COPY . .

# turbo filter `...` means "this package and all workspace dependencies"
# respects dependsOn: ["^build"] in turbo.json so packages build in correct order
RUN pnpm exec turbo run build --filter=@platform/agents...

# ── Stage 3: Runtime ──────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

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
# --disable-warning=DEP0040 silences the punycode DeprecationWarning from
# transitive deps that require the deprecated built-in `punycode` module.
CMD ["node", "--max-old-space-size=512", "--disable-warning=DEP0040", ".mastra/output/index.mjs"]
