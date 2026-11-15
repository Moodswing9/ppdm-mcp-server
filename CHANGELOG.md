# Changelog

## [4.3.0] — 2026-11-15
### Security
- **TLS certificates are now verified** for PPDM, NetWorker and Data Domain. Before, verification was always off, so the credentials sent at login could be intercepted on the network (CodeQL `js/disabling-certificate-validation`)

### Action required
Appliances with self-signed certificates will refuse to connect after upgrading until you set, per system:
- `PPDM_CA_FILE` / `NW_CA_FILE` / `DD_CA_FILE` — path to the appliance's CA or self-signed certificate (PEM). Recommended: the connection stays verified. The README shows how to fetch it
- or `PPDM_TLS_INSECURE` / `NW_TLS_INSECURE` / `DD_TLS_INSECURE` = `true` — the previous behavior, for labs. Prints a warning to stderr

### Added
- `src/tls.ts`: one place that builds the HTTPS agent for all three clients. Invalid values (unreadable CA file, `TLS_INSECURE` not true/false, both set) stop with a clear error instead of falling back to insecure
- 8 tests against a real local HTTPS server with a self-signed certificate (generated per run): rejected by default, accepted with the right CA file, rejected with the wrong one, accepted with the opt-out; and a check that every client verifies by default

## [4.2.2] — 2026-11-11
### Changed
- `dotenv` 16 → 18. Its "injected env" message now goes to stderr, so it can't corrupt the MCP protocol on stdout (verified with a stdio handshake)
- `axios` 1.20.0 → 1.21.0
- Removed the unused `https-proxy-agent` dependency (nothing imported it)
- `npm audit`: 0 vulnerabilities

## [4.2.1] — 2026-11-07
### Security
- `@modelcontextprotocol/sdk` 1.31.0 → 1.32.2: an oversized HTTP request could exhaust server memory
- `zod` → 4.6.7 (memory exhaustion validating oversized collections), `body-parser` → 2.4.0 (DoS via trailing bytes after compressed requests), `fast-uri` → 3.1.9, `ip-address` → 10.7.6
- `npm audit`: 0 vulnerabilities

### Changed
- `zod` declared as a direct dependency (it is imported directly but only arrived through the MCP SDK)

## [4.2.0] — 2026-10-12
### Fixed
- **Write tools could act on the wrong object.** `trigger_backup`, `restore_latest`, `bulk_trigger_backup`, `update_schedule`, `pause_policy` and `resume_policy` took the first partial-name match, so restoring "sql01" could restore "sql01-old" to its original location. An exact name (case-insensitive) now wins, a single partial match is accepted, and several partial matches are refused with a list of candidates
- Replies name the policy or asset that was actually used; some echoed the name you typed
- `get_sla_compliance` checks every asset across all result pages (it stopped at 50) and compares real timestamps instead of strings
- `get_system_health` labels its count as the latest 10 sampled failed jobs; it claimed "last 24h"

### Added
- Test suite: 40 tests (`npm test`) covering name resolution, SLA rules, the PPDM, NetWorker and Data Domain clients against a fake HTTP layer, and the built server end to end over MCP. CI and the publish workflow run it

## [4.1.1] — 2026-10-12
### Fixed
- README documents all 32 tools (it listed 9), NetWorker and Data Domain configuration, and the npm install
- `.env.example` includes the Data Domain settings (`DD_HOST`, `DD_USER`, `DD_PASS`, `DD_PORT`)
- The MCP server reports its version from `package.json`; it still said 4.1.0 in a hardcoded string
- Tool counts corrected in CLAUDE.md; the 4.0.0 and 4.1.0 release notes understated the PPDM count

### Added
- MIT `LICENSE` file (`package.json` already declared MIT), `CONTRIBUTING.md`, bug-report issue template and this changelog

### Changed
- Releases publish to npm from GitHub releases via trusted publishing, with signed provenance
- Dependencies updated; `npm audit` reports 0 vulnerabilities. CI runs on Node 22 and 24

## [4.1.0] — 2026-07-16
### Added
- Restore session tools: `list_restore_sessions`, `get_restore_status`, `cancel_restore`
- 32 tools in total: 20 PPDM, 6 NetWorker, 6 Data Domain

## [4.0.0] — 2026-07-14
### Added
- Schedule management tools: `list_schedules`, `update_schedule`, `pause_policy`, `resume_policy`
- 29 tools in total: 17 PPDM, 6 NetWorker, 6 Data Domain

## [3.1.0] — 2026-07-01
### Added
- `restore_latest` — restore an asset from its most recent copy in a single call
- `bulk_trigger_backup` — back up every asset matching a filter under a policy
- `bulk_cancel_jobs` — cancel all running jobs, optionally by asset type
- 25 tools in total: 13 PPDM, 6 NetWorker, 6 Data Domain

## [3.0.0] — 2026-06-26
### Added
- Data Domain tools: `dd_system_info`, `dd_filesystem_stats`, `dd_ddboost_status`, `dd_list_storage_units`, `dd_create_storage_unit`, `dd_list_users` (requires `DD_HOST`, `DD_USER`, `DD_PASS`; port defaults to 3009)
- `poll_until_complete` — wait for an activity to finish (default timeout 60 min, interval 15 s)
- 22 tools in total: 10 PPDM, 6 NetWorker, 6 Data Domain

## [2.0.0] — 2026-06-18
### Added
- NetWorker tools: `nw_list_savesets`, `nw_list_failed_savesets`, `nw_list_clients`, `nw_get_client`, `nw_list_policies`, `nw_trigger_save` (requires `NW_HOST`, `NW_USER`, `NW_PASS`)
- 15 tools in total: 9 PPDM, 6 NetWorker

## [1.0.0] — 2026-06-18
### Added
- Initial release with 9 PPDM tools: `get_system_health`, `list_failed_jobs`, `list_running_jobs`, `list_assets`, `list_policies`, `get_activity`, `trigger_backup`, `cancel_activity`, `get_sla_compliance`
- Automatic login and logout per call, retry with exponential backoff, support for self-signed certificates
