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

```bash
# From the Mastra server or via Railway's shell:
curl -X POST 'http://signal-cli.railway.internal:8080/v1/register/<SIMON_NUMBER>'
curl -X POST 'http://signal-cli.railway.internal:8080/v1/register/<SIMON_NUMBER>/verify/<VERIFICATION_CODE>'
```

Replace `<SIMON_NUMBER>` with the E.164 formatted number (e.g. +61400000000).

## Local Development

Run locally with docker-compose:

```bash
docker-compose up -d
```

Then set `SIGNAL_CLI_API_URL=http://localhost:8080` in your `.env`.
