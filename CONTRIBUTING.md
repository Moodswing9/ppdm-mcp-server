# Contributing to ppdm-mcp-server

Thanks for helping out. Bug reports, fixes and new tools are all welcome.

## Reporting a bug

Open an issue using the **Bug report** template. Include your PPDM, NetWorker or Data Domain version and the tool you called. Remove hostnames, usernames and any other details about your environment before posting.

## Making a change

1. Fork the repo and create a branch from `master`.
2. Install and build:
   ```bash
   npm ci
   npm run build
   ```
3. Make your change. New tools go in `src/index.ts`; API calls belong in the matching client (`ppdm-client.ts`, `networker-client.ts`, `datadomain-client.ts`).
4. Add tests in `test/` (clients are tested against a fake HTTP layer; `mcp-server.test.ts` runs the built server over MCP). Make sure `npm test` passes; CI runs it on Node 22 and 24.
5. Add an entry under a new `[Unreleased]` heading in `CHANGELOG.md`, and update the tool tables in `README.md` if you added or changed a tool.
6. Open a pull request describing what changed and how you tested it.

## Guidelines

- Write to stderr, never stdout: stdout carries the MCP protocol.
- Tools that change something (trigger, cancel, create, pause) should say so clearly in their description.
- Never log credentials.

## Releases

Maintainers bump the version in `package.json` and publish a GitHub release tagged `vX.Y.Z`. The publish workflow then releases it to npm automatically.
