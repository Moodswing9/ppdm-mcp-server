# Changelog

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
