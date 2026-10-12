import { test } from "node:test";
import assert from "node:assert/strict";
import { NetWorkerClient } from "../src/networker-client.js";
import { DataDomainClient } from "../src/datadomain-client.js";
import { fakeHttp, inject } from "./fake-http.js";

const nw = (routes: Record<string, unknown>) => {
  const { http, calls } = fakeHttp(routes);
  return { c: inject(new NetWorkerClient("nw", "u", "p"), http), calls };
};
const dd = (routes: Record<string, unknown>) => {
  const { http, calls } = fakeHttp(routes);
  return { c: inject(new DataDomainClient("dd", "u", "p"), http), calls };
};

test("NetWorker listSavesets passes the client filter and limit", async () => {
  const { c, calls } = nw({ "GET /global/savesets": { savesets: [{ id: "s1" }] } });
  assert.equal((await c.listSavesets({ clientName: "web01", limit: 5 })).length, 1);
  assert.deepEqual(calls[0].params, { count: 5, q: "clientName:web01" });
});

test("NetWorker listFailedSavesets drops succeeded and browseable savesets", async () => {
  const { c } = nw({ "GET /global/savesets": { savesets: [
    { id: "1", status: "succeeded" }, { id: "2", status: "failed" }, { id: "3", status: "browseable" }, { id: "4", status: "aborted" },
  ] } });
  assert.deepEqual((await c.listFailedSavesets(10)).map(s => s.id), ["2", "4"]);
});

test("NetWorker listClients and listPolicies filter by name, case-insensitively", async () => {
  const { c } = nw({
    "GET /global/clients": { clients: [{ id: "1", name: "Web01" }, { id: "2", name: "db01" }] },
    "GET /global/protectiongroups": { protectiongroups: [{ id: "g1", name: "Linux-Clients" }, { id: "g2", name: "Windows" }] },
  });
  assert.deepEqual((await c.listClients("web")).map(x => x.id), ["1"]);
  assert.deepEqual((await c.listPolicies("linux")).map(x => x.id), ["g1"]);
});

test("NetWorker triggerSave returns the job id", async () => {
  const { c } = nw({ "POST /global/clients/c9/op/backup": { id: "job-1" } });
  assert.deepEqual(await c.triggerSave("c9"), { jobId: "job-1" });
});

test("Data Domain filesystem stats convert MiB to GiB and compute percent used", async () => {
  const { c } = dd({ "GET /filesystems": { file_systems: [{ total: 10240, used: 7680 }] } });
  assert.deepEqual(await c.getFilesystemStats(), { totalGiB: 10, usedGiB: 7.5, availableGiB: 2.5, usedPct: 75 });
});

test("Data Domain filesystem stats handle an empty filesystem", async () => {
  const { c } = dd({ "GET /filesystems": { file_systems: [{ total: 0, used: 0 }] } });
  assert.equal((await c.getFilesystemStats()).usedPct, 0);
});

test("Data Domain DDBoost status and users", async () => {
  const { c } = dd({ "GET /ddboost": { status: "enabled", users: ["boost1"] }, "GET /users": { users: [{ name: "sysadmin" }] } });
  assert.deepEqual(await c.getDDBoostStatus(), { enabled: true, users: ["boost1"] });
  assert.deepEqual(await c.listUsers(), ["sysadmin"]);
});

test("Data Domain createStorageUnit sends the quota as a soft limit only when given", async () => {
  const { c, calls } = dd({ "POST /ddboost/storage-units": {} });
  await c.createStorageUnit("su1", "boost1", 500);
  await c.createStorageUnit("su2", "boost1");
  assert.deepEqual(calls.map(x => x.body), [
    { name: "su1", user: "boost1", quota: { soft_limit: "500 GiB" } },
    { name: "su2", user: "boost1" },
  ]);
});
