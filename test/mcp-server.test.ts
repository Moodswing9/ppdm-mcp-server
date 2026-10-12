// End-to-end: start the built server (dist/index.js) and talk MCP to it over stdio.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
let proc: ChildProcess;
let stdout = "";
let nextId = 1;

function request(method: string, params: Record<string, unknown> = {}): Promise<any> {
  const id = nextId++;
  proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20_000;
    const poll = setInterval(() => {
      const msg = stdout.split("\n").filter(Boolean).map(l => JSON.parse(l)).find(m => m.id === id);
      if (msg) { clearInterval(poll); resolve(msg); }
      else if (Date.now() > deadline) { clearInterval(poll); reject(new Error(`no reply to ${method}`)); }
    }, 25);
  });
}

before(async () => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(PPDM|NW|DD)_/.test(k)) delete env[k];
  // cwd is a directory without a .env, so nothing gets configured by accident
  proc = spawn(process.execPath, [join(root, "dist", "index.js")], { env, cwd: import.meta.dirname, stdio: ["pipe", "pipe", "pipe"] });
  proc.stdout!.on("data", d => (stdout += d));
  await request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
});

after(() => proc.kill());

test("reports the package.json version", async () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const init = stdout.split("\n").filter(Boolean).map(l => JSON.parse(l)).find(m => m.id === 1);
  assert.deepEqual(init.result.serverInfo, { name: "ppdm-mcp-server", version: pkg.version });
});

test("lists 32 uniquely named tools: 20 PPDM, 6 NetWorker, 6 Data Domain", async () => {
  const { result } = await request("tools/list");
  const names: string[] = result.tools.map((t: { name: string }) => t.name);
  assert.equal(names.length, 32);
  assert.equal(new Set(names).size, 32);
  assert.equal(names.filter(n => n.startsWith("nw_")).length, 6);
  assert.equal(names.filter(n => n.startsWith("dd_")).length, 6);
  assert.ok(result.tools.every((t: { description?: string }) => t.description && t.description.length > 10));
});

for (const [tool, args, message] of [
  ["get_system_health", {}, "PPDM_HOST, PPDM_USER, PPDM_PASS must be set"],
  ["nw_list_clients", {}, "NW_HOST, NW_USER, NW_PASS must be set"],
  ["dd_system_info", {}, "DD_HOST, DD_USER, DD_PASS must be set"],
] as const) {
  test(`${tool} without configuration returns a clear error instead of crashing`, async () => {
    const { result } = await request("tools/call", { name: tool, arguments: args });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, new RegExp(message));
    assert.equal(proc.exitCode, null, "server is still running");
  });
}

test("rejects a call with missing required arguments", async () => {
  const msg = await request("tools/call", { name: "trigger_backup", arguments: { policy_name: "Daily" } });
  assert.ok(msg.error || msg.result?.isError, "missing asset_name is reported");
});

test("stdout carries only JSON-RPC messages", () => {
  for (const line of stdout.split("\n").filter(Boolean)) assert.doesNotThrow(() => JSON.parse(line), line.slice(0, 80));
});
