# @platform/signal

Typed HTTP client for the signal-cli REST API sidecar. This is how Simon sends and receives
Signal messages.

**Last updated:** 2026-08-11

## Usage

```ts
import { SignalClient } from '@platform/signal';

const client = new SignalClient(process.env.SIGNAL_CLI_API_URL, process.env.SIGNAL_CLI_NUMBER);
```

`src/client.ts` is the client; `src/types.ts` carries the request and response shapes.

## Who may import this

`apps/agents` only. `apps/web` must not import it — the web app has no Signal surface, and
the sidecar is on Railway's private network with no public domain, so a browser could not
reach it anyway.

## The sidecar

This package is only the client. The service it talks to is a Docker container running
`bbernhard/signal-cli-rest-api` in `json-rpc` mode, deployed as a separate private Railway
service. Deployment and one-time number registration are in
[`../../infra/signal-cli/README.md`](../../infra/signal-cli/README.md).

Locally, run the sidecar with `docker-compose up -d` from `infra/signal-cli/` and set
`SIGNAL_CLI_API_URL=http://localhost:8080`. If you have no registered number, set
`SIGNAL_LISTENER_ENABLED=false` in the agent server's `.env` so it does not try to subscribe
on boot.
