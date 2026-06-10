# ppdm-mcp-server

MCP server for **Dell EMC PowerProtect Data Manager (PPDM)** and **NetWorker** — exposes your backup infrastructure as Claude Code tools so any Claude session can query, monitor, and control backup operations without leaving the terminal.

## Tools

| Tool | Description |
|------|-------------|
| `get_system_health` | Overall PPDM health — status, failed/running job counts |
| `list_failed_jobs` | List failed backup activities with error detail |
| `list_running_jobs` | List currently running backup jobs |
| `list_assets` | List protected assets, filter by name or type |
| `list_policies` | List protection policies |
| `get_activity` | Get full detail for a specific activity ID |
| `trigger_backup` | Trigger on-demand backup by policy + asset name |
| `cancel_activity` | Cancel a running activity |
| `get_sla_compliance` | SLA compliance report for a configurable time window |

## Install

```bash
npx skills add ppdm-mcp-server
```

Or add to your Claude Code config manually:

```bash
claude mcp add ppdm-mcp-server -e PPDM_HOST=your-host -e PPDM_USER=admin -e PPDM_PASS=secret -- npx ppdm-mcp-server
```

## Configuration

Set these environment variables (or add to `.env`):

```env
PPDM_HOST=your-ppdm-host.example.com
PPDM_USER=admin
PPDM_PASS=yourpassword
PPDM_PORT=8443   # optional, default 8443
```

## Usage

Once installed, the tools are available in any Claude Code session:

```
How many backup jobs failed in the last 24 hours?
→ uses get_system_health + list_failed_jobs

Trigger a backup of the "prod-sql-01" asset using the "Daily-SQL" policy.
→ uses list_policies + list_assets + trigger_backup

Which assets are out of SLA compliance?
→ uses get_sla_compliance
```

## Related plugins

- [networker-ppdm](https://github.com/Moodswing9/networker-ppdm) — slash commands for DR orchestration, extended thinking DR planning, and batch anomaly detection
- [ppdm-watch](https://github.com/Moodswing9/ppdm-watch) — real-time terminal monitoring dashboard
- [ppdm-es-troubleshooter](https://github.com/Moodswing9/ppdm-es-troubleshooter) — Elasticsearch diagnostic tool

## Portfolio

[moodswing9.github.io](https://moodswing9.github.io/)
