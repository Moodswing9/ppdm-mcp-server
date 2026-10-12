import { test } from "node:test";
import assert from "node:assert/strict";
import { PPDMClient } from "../src/ppdm-client.js";
import { fakeHttp, inject, paged } from "./fake-http.js";

const LOGIN = { "POST /login": { access_token: "tok" }, "POST /logout": {} };
const client = (routes: Record<string, unknown>) => {
  const { http, calls } = fakeHttp({ ...LOGIN, ...routes });
  return { c: inject(new PPDMClient("ppdm", "u", "p"), http), http, calls };
};

test("login sets the bearer token and requests are authenticated first", async () => {
  const { c, http, calls } = client({ "GET /activities": { content: [] } });
  await c.listActivities({ state: "FAILED" });
  assert.equal(calls[0].url, "/login");
  assert.equal(http.defaults.headers.common.Authorization, "Bearer tok");
});

test("listActivities builds the state and asset-type filter", async () => {
  const { c, calls } = client({ "GET /activities": { content: [] } });
  await c.listActivities({ state: "FAILED", assetType: "VMWARE", limit: 5 });
  const get = calls.find(x => x.url === "/activities")!;
  assert.equal(get.params?.filter, 'state eq "FAILED" and assetType eq "VMWARE"');
  assert.equal(get.params?.pageSize, 5);
});

test("getSlaCompliance checks every asset across pages, not just the first 50", async () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const assets = [
    ...Array.from({ length: 449 }, (_, i) => ({ id: `a${i}`, name: `a${i}`, type: "VM", protectionStatus: "PROTECTED", lastBackupTime: "2026-10-12T10:00:00Z" })),
    { id: "late", name: "late-vm", type: "VM", protectionStatus: "PROTECTED", lastBackupTime: "2026-10-10T00:00:00Z" },
  ];
  const { c, calls } = client({ "GET /assets": paged(assets) });
  const r = await c.getSlaCompliance(24, now);
  assert.equal(r.compliant + r.nonCompliant, 450);
  assert.deepEqual(r.assets.map(a => a.name), ["late-vm"]);
  assert.equal(calls.filter(x => x.url === "/assets").length, 3);
});

test("restoreLatest restores the exactly named asset from its newest copy", async () => {
  const { c, calls } = client({
    "GET /assets": { content: [{ id: "1", name: "sql01-old" }, { id: "2", name: "sql01" }, { id: "3", name: "prod-sql01" }] },
    "GET /assets/2/copies": { content: [{ id: "copy-new" }, { id: "copy-old" }] },
    "POST /assets/2/restore": { id: "act-9" },
  });
  const r = await c.restoreLatest("sql01");
  assert.deepEqual(r, { activityId: "act-9", assetId: "2", assetName: "sql01", copyId: "copy-new" });
  const post = calls.find(x => x.url === "/assets/2/restore")!;
  assert.deepEqual(post.body, { copyId: "copy-new", restoreType: "ORIGINAL_LOCATION" });
});

test("restoreLatest refuses an ambiguous name and restores nothing", async () => {
  const { c, calls } = client({ "GET /assets": { content: [{ id: "1", name: "sql01-old" }, { id: "3", name: "prod-sql01" }] } });
  await assert.rejects(c.restoreLatest("sql01"), /ambiguous/);
  assert.equal(calls.some(x => x.method === "POST" && x.url.endsWith("/restore")), false);
});

test("restoreLatest reports an asset with no copies", async () => {
  const { c } = client({ "GET /assets": { content: [{ id: "2", name: "sql01" }] }, "GET /assets/2/copies": { content: [] } });
  await assert.rejects(c.restoreLatest("sql01"), /No copies found for asset "sql01"/);
});

test("bulkTriggerBackup backs up every matching asset under the exactly named policy", async () => {
  let n = 0;
  const { c, calls } = client({
    "GET /protection-policies": { content: [{ id: "p1", name: "Daily-K8s" }, { id: "p2", name: "Daily-K8s-Archive" }] },
    "GET /assets": { content: [{ id: "a1", name: "ns1" }, { id: "a2", name: "ns2" }] },
    "POST /protection-policies/p1/protections": () => ({ id: `act-${++n}` }),
  });
  const r = await c.bulkTriggerBackup("Daily-K8s", { type: "KUBERNETES" });
  assert.deepEqual(r, { policyName: "Daily-K8s", triggered: 2, activityIds: ["act-1", "act-2"] });
  assert.deepEqual(calls.filter(x => x.method === "POST" && x.url.includes("/protections")).map(x => x.body), [
    { assetIds: ["a1"], backupType: "FULL" },
    { assetIds: ["a2"], backupType: "FULL" },
  ]);
});

test("bulkTriggerBackup refuses an ambiguous policy and triggers nothing", async () => {
  const { c, calls } = client({
    "GET /protection-policies": { content: [{ id: "p1", name: "Daily-K8s" }, { id: "p2", name: "Daily-SQL" }] },
    "GET /assets": { content: [{ id: "a1", name: "ns1" }] },
  });
  await assert.rejects(c.bulkTriggerBackup("Daily"), /ambiguous/);
  assert.equal(calls.some(x => x.url.includes("/protections")), false);
});

test("bulkCancelJobs cancels every running job", async () => {
  const { c, calls } = client({
    "GET /activities": { content: [{ id: "j1" }, { id: "j2" }] },
    "POST /activities/j1/cancel": {},
    "POST /activities/j2/cancel": {},
  });
  assert.deepEqual(await c.bulkCancelJobs(), { canceled: 2, ids: ["j1", "j2"] });
  assert.equal(calls.find(x => x.url === "/activities")!.params?.filter, 'state eq "RUNNING"');
});

test("pollUntilComplete returns once the activity reaches a terminal state", async () => {
  const states = ["RUNNING", "RUNNING", "SUCCEEDED"];
  const { c } = client({ "GET /activities/x": () => ({ id: "x", state: states.shift() }) });
  const act = await c.pollUntilComplete("x", { intervalMs: 1, timeoutMs: 5000 });
  assert.equal(act.state, "SUCCEEDED");
});

test("pollUntilComplete times out", async () => {
  const { c } = client({ "GET /activities/x": { id: "x", state: "RUNNING" } });
  await assert.rejects(c.pollUntilComplete("x", { intervalMs: 5, timeoutMs: 30 }), /Timed out waiting for activity x/);
});

test("setPolicyEnabled writes the full policy back with the new enabled flag", async () => {
  const { c, calls } = client({
    "GET /protection-policies/p1": { id: "p1", name: "Daily", enabled: true, stages: [] },
    "PUT /protection-policies/p1": {},
  });
  await c.setPolicyEnabled("p1", false);
  assert.deepEqual(calls.find(x => x.method === "PUT")!.body, { id: "p1", name: "Daily", enabled: false, stages: [] });
});

test("updatePolicySchedule changes only the requested fields of the chosen stage", async () => {
  const policy = { id: "p1", stages: [{ id: "s0", schedule: { frequency: "DAILY", startTime: "01:00", duration: 60 } }] };
  const { c, calls } = client({ "GET /protection-policies/p1": policy, "PUT /protection-policies/p1": {} });
  await c.updatePolicySchedule("p1", 0, { startTime: "03:00" });
  const put = calls.find(x => x.method === "PUT")!.body as typeof policy;
  assert.deepEqual(put.stages[0].schedule, { frequency: "DAILY", startTime: "03:00", duration: 60 });
});

test("updatePolicySchedule rejects a missing stage", async () => {
  const { c } = client({ "GET /protection-policies/p1": { id: "p1", stages: [] } });
  await assert.rejects(c.updatePolicySchedule("p1", 2, { frequency: "HOURLY" }), /Stage index 2 not found/);
});

test("cancelRestoreSession sends DELETE for the session", async () => {
  const { c, calls } = client({ "DELETE /restore-sessions/r1": {} });
  await c.cancelRestoreSession("r1");
  assert.ok(calls.some(x => x.method === "DELETE" && x.url === "/restore-sessions/r1"));
});

test("getSystemHealth status thresholds", async () => {
  for (const [failed, status] of [[0, "HEALTHY"], [3, "WARNING"], [7, "CRITICAL"]] as const) {
    const { c } = client({
      "GET /activities": (call: { params?: Record<string, unknown> }) =>
        ({ content: String(call.params?.filter).includes("FAILED") ? Array.from({ length: failed }, (_, i) => ({ id: `f${i}` })) : [] }),
      "GET /assets": { content: [] },
    });
    const h = await c.getSystemHealth();
    assert.equal(h.status, status);
    assert.equal(h.recentFailedJobs, failed);
  }
});

test("fromEnv requires host, user and password", () => {
  const saved = { ...process.env };
  try {
    delete process.env.PPDM_HOST;
    assert.throws(() => PPDMClient.fromEnv(), /PPDM_HOST, PPDM_USER, PPDM_PASS must be set/);
  } finally {
    process.env = saved;
  }
});
