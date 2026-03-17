# Change Request: Signal CLI Integration

## Summary

Add Signal CLI as a Docker sidecar service on Railway, with a typed TypeScript client package in the monorepo. This enables Simon (the coordinator agent) to send and receive Signal messages from directors.

## Architecture

Signal CLI runs as a separate Docker container alongside the Mastra agent server on Railway. They communicate via HTTP over Railway's private network. Signal CLI is never embedded in the Node.js process.

```
┌─────────────────────────────────────────────────────┐
│  Railway Project (private network)                  │
│                                                     │
│  ┌──────────────┐    HTTP (private)  ┌───────────┐  │
│  │ Mastra server│◄──────────────────►│signal-cli │  │
│  │ apps/agents  │                    │REST API   │  │
│  │ (public URL) │                    │(no public │  │
│  └──────────────┘                    │ URL)      │  │
│                                      └─────┬─────┘  │
│                                            │        │
│                                      ┌─────┴─────┐  │
│                                      │ Volume:   │  │
│                                      │ /signal-  │  │
│                                      │ cli-config│  │
│                                      └───────────┘  │
└─────────────────────────────────────────────────────┘
         │
         ▼
  Signal Servers (internet)
```

- **Mastra server** (`apps/agents`): only publicly-exposed service. Receives webhooks (Telnyx, Zoom, Deepgram). Calls signal-cli over private network.
- **signal-cli REST API**: Docker container using `bbernhard/signal-cli-rest-api` in JSON-RPC mode. Private only — no public URL. Persistent volume for cryptographic keys.
- Internal URL: `http://signal-cli.railway.internal:8080` (Railway private DNS)

## Changes Required

### 1. Create `packages/signal/`

New package: `@platform/signal` — a typed TypeScript HTTP client wrapping the signal-cli REST API.

**Location:** `packages/signal/`

**package.json:**
```json
{
  "name": "@platform/signal",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@platform/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5"
  }
}
```

**tsconfig.json:** Extends `../../tsconfig.base.json`, same pattern as other packages.

**src/client.ts** — Core HTTP client:
```typescript
// Wraps signal-cli REST API (bbernhard/signal-cli-rest-api)
// Base URL from env: SIGNAL_CLI_API_URL (default: http://signal-cli.railway.internal:8080)

export class SignalClient {
  private baseUrl: string;
  private account: string; // Simon's registered number, e.g. "+61400000000"

  constructor(config?: { baseUrl?: string; account?: string }) {
    this.baseUrl = config?.baseUrl ?? process.env.SIGNAL_CLI_API_URL ?? 'http://signal-cli.railway.internal:8080';
    this.account = config?.account ?? process.env.SIGNAL_CLI_NUMBER ?? '';
  }

  // Implement these methods wrapping the REST API v2 endpoints:
  // See: https://bbernhard.github.io/signal-cli-rest-api/

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult>
  async sendGroupMessage(params: SendGroupMessageParams): Promise<SendMessageResult>
  async receiveMessages(): Promise<IncomingMessage[]>
  async listGroups(): Promise<SignalGroup[]>
  async getContacts(): Promise<SignalContact[]>
  async sendReaction(params: ReactionParams): Promise<void>
  async sendAttachment(params: AttachmentParams): Promise<SendMessageResult>
}
```

**src/types.ts** — Types for Signal API payloads:
```typescript
export interface SendMessageParams {
  recipients: string[];      // phone numbers in E.164 format
  message: string;
  attachments?: string[];    // base64 encoded
}

export interface SendGroupMessageParams {
  groupId: string;
  message: string;
  attachments?: string[];
}

export interface SendMessageResult {
  timestamp: string;
}

export interface IncomingMessage {
  envelope: {
    source: string;          // sender's phone number
    sourceNumber: string;
    sourceName: string;
    timestamp: number;
    dataMessage?: {
      message: string;
      timestamp: number;
      groupInfo?: {
        groupId: string;
        type: string;
      };
      attachments?: Array<{
        contentType: string;
        filename: string;
        id: string;
        size: number;
      }>;
    };
  };
}

export interface SignalGroup {
  id: string;
  name: string;
  members: string[];
}

export interface SignalContact {
  number: string;
  name: string;
}

export interface ReactionParams {
  recipient: string;
  reaction: string;          // emoji
  targetAuthor: string;
  targetTimestamp: number;
}

export interface AttachmentParams {
  recipients: string[];
  message?: string;
  base64Attachment: string;
  filename: string;
  contentType: string;
}
```

**src/index.ts** — Barrel export:
```typescript
export { SignalClient } from './client.js';
export * from './types.js';
```

### 2. Create `infra/signal-cli/`

Infrastructure config for the signal-cli Docker sidecar. Not part of pnpm workspace — this is deployment config.

**infra/signal-cli/docker-compose.yml:**
```yaml
version: "3"
services:
  signal-cli-rest-api:
    image: bbernhard/signal-cli-rest-api:latest
    environment:
      - MODE=json-rpc
      - JSON_RPC_TRUST_NEW_IDENTITIES=on-first-use
    ports:
      - "8080:8080"
    volumes:
      - signal-cli-config:/home/.local/share/signal-cli
    restart: always

volumes:
  signal-cli-config:
```

**infra/signal-cli/README.md:**
```markdown
# Signal CLI Sidecar

Docker container running signal-cli REST API for Simon's Signal integration.

## Railway Deployment

1. Create a new service in your Railway project
2. Set source to this directory or use the Docker image directly: `bbernhard/signal-cli-rest-api:latest`
3. Set environment variable: `MODE=json-rpc`
4. Add a persistent volume mounted at `/home/.local/share/signal-cli`
5. Do NOT assign a public domain — this service is private-only
6. The Mastra server reaches it via `http://signal-cli.railway.internal:8080`

## Initial Registration

After first deployment, register Simon's phone number:

# From the Mastra server or via Railway's shell:
curl -X POST 'http://signal-cli.railway.internal:8080/v1/register/<SIMON_NUMBER>'
curl -X POST 'http://signal-cli.railway.internal:8080/v1/register/<SIMON_NUMBER>/verify/<VERIFICATION_CODE>'

Replace <SIMON_NUMBER> with the E.164 formatted number (e.g. +61400000000).

## Local Development

Run locally with docker-compose:
  docker-compose up -d

Then set SIGNAL_CLI_API_URL=http://localhost:8080 in your .env
```

### 3. Update `apps/agents/package.json`

Add dependency on the new signal package:
```json
{
  "dependencies": {
    "@platform/signal": "workspace:*"
  }
}
```

### 4. Update `.env.example`

Add:
```
# Signal CLI (sidecar on Railway private network)
SIGNAL_CLI_API_URL=http://signal-cli.railway.internal:8080
SIGNAL_CLI_NUMBER=+61400000000
```

For local development, override:
```
SIGNAL_CLI_API_URL=http://localhost:8080
```

### 5. Update `pnpm-workspace.yaml`

No change needed — `packages/*` glob already includes `packages/signal`.

### 6. Update `CLAUDE.md`

**Directory tree** — add:
```
├── packages/
│   ├── signal/          # TypeScript client for signal-cli REST API sidecar
├── infra/
│   └── signal-cli/      # Docker config for signal-cli sidecar (not in pnpm workspace)
```

**Import rules** — add:
```
- `apps/agents` imports from `@platform/db`, `@platform/shared`, and `@platform/signal`
- `apps/web` imports from `@platform/db` and `@platform/shared` (NOT @platform/signal)
```

**Key files** — add:
```
- `packages/signal/src/client.ts` — Signal CLI HTTP client
- `infra/signal-cli/README.md` — sidecar deployment and registration instructions
```

**When Working On...** table — add row:
```
| Signal integration, Simon's messaging | `packages/signal/` (client API) + `infra/signal-cli/README.md` (deployment) |
```

**Naming conventions** — add:
```
- Railway internal URLs: `http://{service-name}.railway.internal:{port}`
```

### 7. Update `docs/agents/simon.md`

In the Tools section, update `signal_send` and `signal_receive` descriptions:
```
- `signal_send` — send Signal message via @platform/signal client (calls signal-cli sidecar)
- `signal_receive` — receive/parse incoming Signal messages via @platform/signal client
```

Add to Mastra Implementation section:
```
**Signal Integration:** Simon uses `@platform/signal` to communicate via Signal.
The SignalClient connects to the signal-cli REST API sidecar on Railway's private
network. Messages are sent/received via HTTP — Simon never interacts with the
Signal protocol directly. The sidecar handles encryption, key management, and
protocol compliance.
```

## Deployment Topology (Updated)

| Service | Platform | URL Type | Notes |
|---------|----------|----------|-------|
| `apps/web` (Next.js) | Vercel | Public | Directors' browser UI. Serverless. |
| `apps/agents` (Mastra) | Railway Service 1 | Public | Webhook endpoints. Persistent Node.js. |
| signal-cli REST API | Railway Service 2 | Private only | Docker. Persistent JVM. Volume for keys. |
| Supabase | supabase.com | Managed | Both Vercel and Railway connect to same instance. |

## Environment Variables (Full)

```
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_PROJECT_ID=...

# Signal CLI (sidecar)
SIGNAL_CLI_API_URL=http://signal-cli.railway.internal:8080
SIGNAL_CLI_NUMBER=+61400000000

# Deepgram
DEEPGRAM_API_KEY=...

# Telnyx
TELNYX_API_KEY=...
TELNYX_PUBLIC_KEY=...

# Zoom
ZOOM_WEBHOOK_SECRET_TOKEN=...

# OpenAI (embeddings)
OPENAI_API_KEY=...

# Anthropic (agent model)
ANTHROPIC_API_KEY=...

# Railway webhook base URL (for Deepgram/Telnyx/Zoom callbacks)
WEBHOOK_BASE_URL=https://your-mastra-app.railway.app
```

## Testing

1. Deploy signal-cli sidecar on Railway, register Simon's number
2. Verify connectivity: from Mastra server, `curl http://signal-cli.railway.internal:8080/v1/about`
3. Send test message: use `SignalClient.sendMessage()` to send to a director's number
4. Receive test: director sends message to Simon's number, verify `SignalClient.receiveMessages()` returns it
5. Group test: add Simon to a Signal group, verify group messages are received

## Notes

- signal-cli must be kept up to date — Signal Server can make breaking changes, and official clients expire after 3 months. Pin to a recent image tag rather than `latest` in production.
- The persistent volume is critical — losing it means re-registering the phone number and losing group memberships.
- JSON-RPC mode uses more RAM (~256-512MB) but is significantly faster than normal mode which starts a new JVM per request.
- For local development, run the docker-compose in `infra/signal-cli/` and override `SIGNAL_CLI_API_URL=http://localhost:8080`.
