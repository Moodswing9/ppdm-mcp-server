# CLAUDE.md — ppdm-mcp-server

## What This Is

A TypeScript MCP (Model Context Protocol) server that exposes Dell EMC **PowerProtect Data Manager (PPDM)** and **NetWorker** as Claude Code tools. Install once; query your backup infrastructure from any Claude session.

## Commands

```bash
# Install dependencies and build
npm install
npm run build

# Run locally (reads from .env)
npm start

# Add to Claude Code
claude mcp add ppdm-mcp-server npx ppdm-mcp-server

# Dev mode (no build step)
npm run dev
```

## Environment Variables

| Variable | Required for |
|---|---|
| `PPDM_HOST` | All PPDM tools |
| `PPDM_USER` | All PPDM tools |
| `PPDM_PASS` | All PPDM tools |
| `PPDM_PORT` | Optional — defaults to 8443 |
| `NW_HOST` | All NetWorker tools |
| `NW_USER` | All NetWorker tools |
| `NW_PASS` | All NetWorker tools |
| `NW_PORT` | Optional — defaults to 9090 |

Copy `.env.example` to `.env` and fill in values.

## Tools (15 total)

### PPDM (9 tools)

| Tool | What it does |
|---|---|
| `list_failed_jobs` | List failed backup activities, filter by asset type |
| `list_running_jobs` | List currently running jobs |
| `list_assets` | List protected assets, filter by name or type |
| `list_policies` | List protection policies |
| `get_activity` | Full detail for a specific activity by ID |
| `cancel_activity` | Cancel a running activity |
| `trigger_backup` | Trigger on-demand backup by policy + asset name |
| `get_sla_compliance` | SLA compliance report — compliant vs non-compliant assets |
| `get_system_health` | Overall health summary (HEALTHY / WARNING / CRITICAL) |

### NetWorker (6 tools)

| Tool | What it does |
|---|---|
| `nw_list_savesets` | List savesets, filter by client name |
| `nw_list_failed_savesets` | List savesets that did not complete successfully |
| `nw_list_clients` | List registered NetWorker clients |
| `nw_get_client` | Full detail for a client by ID |
| `nw_list_policies` | List protection groups |
| `nw_trigger_save` | Trigger on-demand backup for a client |

## Architecture

```
src/
├── index.ts            # MCP server — all 15 tool definitions
├── ppdm-client.ts      # PPDMClient — login/logout, activity/asset/policy/restore methods
└── networker-client.ts # NetWorkerClient — Basic Auth, saveset/client/policy methods
```

**Transport:** `StdioServerTransport` — Claude Code communicates over stdin/stdout.

**Auth:** PPDM uses Bearer token (login → token → logout per request). NetWorker uses HTTP Basic Auth.

**SSL:** Both clients disable certificate verification (`rejectUnauthorized: false`) — suitable for self-signed lab/enterprise certs.

## Key Constraints

- Both clients create a fresh connection per tool call — no persistent session between calls
- PPDM `listActivities` uses OData filter syntax (`state eq "FAILED"`)
- NetWorker REST API is on port 9090, not 8443 — do not mix them up
- `npm run build` must be run before `npm start` — the server runs from `dist/`, not `src/`
- Published to npm as `ppdm-mcp-server` — auto-published via GitHub Actions on release (OIDC Trusted Publishing, no token stored)
