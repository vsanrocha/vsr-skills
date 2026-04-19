# Ralph Sandbox — Docker

Containerized execution environment for ralph-harness tasks.

## Images

| Image | Base | Purpose |
|-------|------|---------|
| `task-lifecycle-sandbox` | node:22-bookworm | Base — Node.js + Claude Code CLI |
| `task-lifecycle-sandbox-php` | sandbox base | PHP projects (php-cli + composer) |

## Build

```bash
# Base image
docker build -t task-lifecycle-sandbox -f Dockerfile .

# PHP variant
docker build -t task-lifecycle-sandbox-php -f Dockerfile.php .
```

## Usage

### Start a persistent sandbox

```bash
docker run -d --name ralph-sandbox \
  --env-file .env.sandbox \
  -v $(pwd):/home/agent/workspace \
  task-lifecycle-sandbox
```

### Run a command inside the sandbox

```bash
docker exec ralph-sandbox claude -p "your prompt here"
```

### Run evaluator in read-only mode

```bash
docker run --rm \
  -v /path/to/project:/home/agent/workspace:ro \
  --env-file .env.sandbox \
  task-lifecycle-sandbox \
  claude -p "evaluate implementation"
```

### Stop and remove

```bash
docker stop ralph-sandbox && docker rm ralph-sandbox
```

## Environment

Copy `.env.sandbox.example` to `.env.sandbox` and fill in your `ANTHROPIC_API_KEY`.

```bash
cp .env.sandbox.example .env.sandbox
# edit .env.sandbox and set ANTHROPIC_API_KEY
```

## Notes

- The container runs as non-root user `agent` for isolation.
- `WORKDIR` is `/home/agent/workspace` — mount your project there.
- The base image installs Claude Code CLI system-wide at build time.
- For PHP projects use `task-lifecycle-sandbox-php` which adds `php-cli` and `composer`.
