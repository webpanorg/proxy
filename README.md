# Proxy server

Forward HTTP/HTTPS proxy with Basic auth. Runs locally with Node.js or in Docker.

## Requirements

- Node.js 20+ (for local run)
- Docker (for container run)

## Run locally

```bash
PROXY_USER=user PROXY_PASS=pass PROXY_PORT=3128 node index.js
```

## Build the Docker image

```bash
docker build -t proxy .
```

## Run the Docker image

```bash
docker run \
  -p 3128:3128 \
  -e PROXY_USER=user \
  -e PROXY_PASS=pass \
  -e PROXY_PORT=3128 \
  proxy
```

If you want a different port, change both sides of `-p` and set `PROXY_PORT` to the same value.

## Docker Compose example

Create a `compose.yml`:

```yaml
services:
  proxy:
    build: .
    ports:
      - "3128:3128"
    environment:
      PROXY_USER: user
      PROXY_PASS: pass
      PROXY_PORT: 3128
```

Run it:

```bash
docker compose up --build
```

## Environment variables

- `PROXY_USER` - proxy username (default: `user`)
- `PROXY_PASS` - proxy password (default: `pass`)
- `PROXY_PORT` - listen port (default: `3128`)

## Notes

- This is a forward proxy. Your client must be configured to use it.
- HTTPS is supported via `CONNECT` tunneling.
