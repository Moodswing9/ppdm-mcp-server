<div align="center">

# 🧩 ppdm-mcp-server

**Dell PowerProtect Data Manager, NetWorker and Data Domain as Claude Code tools — 32 tools in one MCP server**

[![npm](https://img.shields.io/npm/v/ppdm-mcp-server?style=flat-square&color=6366f1)](https://www.npmjs.com/package/ppdm-mcp-server)
[![License](https://img.shields.io/badge/license-MIT-22c55e?style=flat-square)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/Moodswing9/ppdm-mcp-server/ci.yml?branch=master&style=flat-square&label=CI)](https://github.com/Moodswing9/ppdm-mcp-server/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-18%2B-3b82f6?style=flat-square)](#requirements)

</div>

---

## Overview

`ppdm-mcp-server` lets any Claude Code session query, monitor and control your backup infrastructure in plain English:

- **PPDM (20 tools)** — job monitoring, on-demand and bulk backups, single-call restores, restore session tracking, schedule and policy management, SLA compliance and system health.
- **NetWorker (6 tools)** — savesets, clients, protection groups and on-demand saves.
- **Data Domain (6 tools)** — system info, filesystem capacity, DDBoost status, storage units and users.

Each system is optional. Configure only the ones you use; a tool for an unconfigured system returns an error explaining which settings are missing.

---

## Requirements

- Node.js 18+
- Claude Code
- Network access to the PPDM, NetWorker and/or Data Domain REST APIs, with an account that can read (and, for write tools, change) the relevant objects

---

## Install

Register the server with Claude Code, passing the settings for the systems you use:

```bash
claude mcp add ppdm-mcp-server \
  -e PPDM_HOST=ppdm.example.com -e PPDM_USER=admin -e PPDM_PASS=... \
  -- npx -y ppdm-mcp-server
```

The first `npx` start downloads the package and can take up to a minute. For instant starts, install it once with `npm install -g ppdm-mcp-server` and register `-- ppdm-mcp-server` instead.

---

## Configuration

Set environment variables with `-e` as above, or put them in a `.env` file in the directory the server starts from. [`.env.example`](.env.example) lists them all.

| System | Variables | Default port |
|:---|:---|:---|
| PPDM | `PPDM_HOST`, `PPDM_USER`, `PPDM_PASS`, `PPDM_PORT` | `8443` |
| NetWorker | `NW_HOST`, `NW_USER`, `NW_PASS`, `NW_PORT` | `9090` |
| Data Domain | `DD_HOST`, `DD_USER`, `DD_PASS`, `DD_PORT` | `3009` |

---

## Tools

### PPDM — monitoring

| Tool | What it does |
|:---|:---|
| `get_system_health` | Health status from a sample of the 10 most recent failed and running jobs |
| `list_failed_jobs` | Failed backup jobs with asset, error and start time; filter by asset type |
| `list_running_jobs` | Currently running backup jobs |
| `list_assets` | Protected assets; filter by name or type |
| `list_policies` | Protection policies |
| `get_activity` | Full detail for one activity |
| `get_sla_compliance` | Every asset not backed up within a given number of hours |

### PPDM — backup and restore

| Tool | What it does |
|:---|:---|
| `trigger_backup` | On-demand backup of an asset with a named policy |
| `bulk_trigger_backup` | On-demand backup of every asset matching a filter under a policy |
| `cancel_activity` | Cancel a running activity |
| `bulk_cancel_jobs` | Cancel all running jobs, optionally by asset type |
| `poll_until_complete` | Wait for an activity to succeed, fail or be canceled, and return the result |
| `restore_latest` | Restore an asset to its original location from its most recent copy |

### PPDM — restore sessions

| Tool | What it does |
|:---|:---|
| `list_restore_sessions` | Recent restore sessions; filter by state |
| `get_restore_status` | Progress, bytes restored, state and timing of one session |
| `cancel_restore` | Cancel a running restore session |

### PPDM — schedules and policies

| Tool | What it does |
|:---|:---|
| `list_schedules` | Every policy schedule: frequency, start time, duration, enabled state |
| `update_schedule` | Change a policy stage's frequency, start time or duration |
| `pause_policy` | Disable a policy so its jobs stop running |
| `resume_policy` | Re-enable a paused policy |

### NetWorker

| Tool | What it does |
|:---|:---|
| `nw_list_savesets` | Savesets (backup copies); filter by client |
| `nw_list_failed_savesets` | Savesets that didn't complete successfully |
| `nw_list_clients` | Registered clients |
| `nw_get_client` | Full detail for one client |
| `nw_list_policies` | Protection groups |
| `nw_trigger_save` | On-demand backup of a client |

### Data Domain

| Tool | What it does |
|:---|:---|
| `dd_system_info` | Model, version, serial number and uptime |
| `dd_filesystem_stats` | Total, used and available capacity, and percentage used |
| `dd_ddboost_status` | Whether DDBoost is enabled, and its authorized users |
| `dd_list_storage_units` | DDBoost storage units with user, quota and status |
| `dd_create_storage_unit` | Create a DDBoost storage unit |
| `dd_list_users` | Local Data Domain users |

> **Names must be unambiguous.** Tools that take a policy or asset name use an exact match (ignoring case) when there is one, or a partial name that matches exactly one object. If a partial name matches several, the tool refuses and lists them, so it never acts on the wrong object. Replies always name the object that was used.

> **Write tools change your environment.** `trigger_backup`, `bulk_trigger_backup`, `cancel_activity`, `bulk_cancel_jobs`, `restore_latest`, `cancel_restore`, `update_schedule`, `pause_policy`, `resume_policy`, `nw_trigger_save` and `dd_create_storage_unit` all take action. Claude Code asks before running a tool unless you've allowed it, so review those prompts.

---

## Examples

```
How many backup jobs failed in the last 24 hours, and why?
→ get_system_health + list_failed_jobs

Back up every Kubernetes asset under the "Daily-K8s" policy and tell me when they finish.
→ bulk_trigger_backup + poll_until_complete

Restore prod-sql-01 from its latest copy and watch the restore.
→ restore_latest + get_restore_status

Is the Data Domain running low on space?
→ dd_filesystem_stats
```

---

## Security notes

- **TLS verification is disabled** for all three systems, because they commonly use self-signed certificates. Run the server on a trusted internal network.
- Credentials are read from environment variables and never logged.

---

## Development

```bash
git clone https://github.com/Moodswing9/ppdm-mcp-server.git
cd ppdm-mcp-server
npm ci
npm run build      # compile to dist/
npm run dev        # run from source
npm test           # build, then run the tests (no network access needed)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md).

---

## Related projects

- [ppdm-alert-bot](https://github.com/Moodswing9/ppdm-alert-bot) — PPDM and NetWorker alerts to Slack, Teams, PagerDuty and email
- [networker-ppdm](https://github.com/Moodswing9/networker-ppdm) — Claude Code plugin with slash commands for DR orchestration and anomaly detection
- [ppdm-watch](https://github.com/Moodswing9/ppdm-watch) — real-time terminal monitoring dashboard
- [ppdm-es-troubleshooter](https://github.com/Moodswing9/ppdm-es-troubleshooter) — Elasticsearch diagnostic tool

Portfolio: [moodswing9.github.io](https://moodswing9.github.io/)
