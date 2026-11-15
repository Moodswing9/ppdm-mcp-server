// End-to-end TLS tests against a real local HTTPS server with a self-signed
// certificate. Certificates are generated per run with openssl, so no private
// key is ever committed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import axios from "axios";
import { tlsAgent } from "../src/tls.js";

let dir: string;
let server: https.Server;
let url: string;
let serverCert: string; // trusted: the server's own self-signed cert
let otherCert: string;  // unrelated self-signed cert

function selfSigned(name: string): { key: string; cert: string } {
  const key = path.join(dir, `${name}.key`);
  const cert = path.join(dir, `${name}.pem`);
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
    "-keyout", key, "-out", cert,
  ], { stdio: "ignore" });
  return { key, cert };
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "tls-test-"));
  const s = selfSigned("server");
  serverCert = s.cert;
  otherCert = selfSigned("other").cert;
  server = https.createServer(
    { key: fs.readFileSync(s.key), cert: fs.readFileSync(s.cert) },
    (_req, res) => res.end("ok"),
  );
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `https://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});

after(() => {
  server?.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const get = (env: NodeJS.ProcessEnv) =>
  axios.get(url, { httpsAgent: tlsAgent("PPDM", env), timeout: 5_000 });


test("default: a self-signed certificate is rejected", async () => {
  await assert.rejects(get({}), (err: { code?: string }) =>
    ["DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"].includes(err.code ?? ""));
});

test("CA_FILE with the server's certificate: connection succeeds and is verified", async () => {
  const res = await get({ PPDM_CA_FILE: serverCert });
  assert.equal(res.data, "ok");
});

test("CA_FILE with an unrelated certificate: rejected", async () => {
  await assert.rejects(get({ PPDM_CA_FILE: otherCert }));
});

test("there is no opt-out: PPDM_TLS_INSECURE is ignored", async () => {
  await assert.rejects(get({ PPDM_TLS_INSECURE: "true" }));
});


test("an unreadable CA file fails loudly instead of falling back", () => {
  assert.throws(() => tlsAgent("DD", { DD_CA_FILE: path.join(os.tmpdir(), "missing.pem") }), /DD_CA_FILE: cannot read/);
});

test("each client reads its own prefix", async () => {
  // PPDM's CA must not be trusted for NW.
  await assert.rejects(axios.get(url, { httpsAgent: tlsAgent("NW", { PPDM_CA_FILE: serverCert }), timeout: 5_000 }));
});

test("all three clients verify certificates by default", async () => {
  const { PPDMClient } = await import("../src/ppdm-client.js");
  const { NetWorkerClient } = await import("../src/networker-client.js");
  const { DataDomainClient } = await import("../src/datadomain-client.js");
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/_CA_FILE$/.test(k)) delete process.env[k];
  try {
    for (const client of [new PPDMClient("h", "u", "p"), new NetWorkerClient("h", "u", "p"), new DataDomainClient("h", "u", "p")]) {
      const agent = (client as unknown as { http: { defaults: { httpsAgent: https.Agent } } }).http.defaults.httpsAgent;
      const opts = (agent as unknown as { options: https.AgentOptions }).options;
      assert.notEqual(opts.rejectUnauthorized, false, `${client.constructor.name} must verify certificates`);
    }
  } finally {
    process.env = saved;
  }
});
