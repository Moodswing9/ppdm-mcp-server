import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveOne, isOutOfSla } from "../src/ppdm-client.js";

const items = (...names: string[]) => names.map((name, i) => ({ id: String(i), name }));

test("resolveOne prefers an exact name over partial matches", () => {
  assert.equal(resolveOne(items("sql01-old", "sql01", "prod-sql01"), "sql01", "asset").name, "sql01");
});

test("resolveOne exact match is case-insensitive", () => {
  assert.equal(resolveOne(items("Daily-K8s", "Daily-K8s-Archive"), "daily-k8s", "policy").name, "Daily-K8s");
});

test("resolveOne accepts a single partial match", () => {
  assert.equal(resolveOne(items("prod-sql01"), "sql01", "asset").name, "prod-sql01");
});

test("resolveOne refuses ambiguous partial matches and lists the candidates", () => {
  assert.throws(
    () => resolveOne(items("Daily-K8s", "Daily-SQL"), "Daily", "policy"),
    /Policy name "Daily" is ambiguous — matches "Daily-K8s", "Daily-SQL"\. Use the exact name\./,
  );
});

test("resolveOne refuses duplicate exact names", () => {
  assert.throws(() => resolveOne(items("vm01", "VM01"), "vm01", "asset"), /ambiguous/);
});

test("resolveOne reports when nothing matches", () => {
  assert.throws(() => resolveOne([], "ghost", "asset"), /No asset matching "ghost"/);
});

test("isOutOfSla: never backed up, stale, unparseable and exactly-at-cutoff are out; recent is in", () => {
  const cutoff = Date.parse("2026-10-11T12:00:00Z");
  assert.equal(isOutOfSla({}, cutoff), true);
  assert.equal(isOutOfSla({ lastBackupTime: "2026-10-10T00:00:00Z" }, cutoff), true);
  assert.equal(isOutOfSla({ lastBackupTime: "garbage" }, cutoff), true);
  assert.equal(isOutOfSla({ lastBackupTime: "2026-10-11T12:00:00Z" }, cutoff), true);
  assert.equal(isOutOfSla({ lastBackupTime: "2026-10-12T08:00:00Z" }, cutoff), false);
});

test("isOutOfSla compares real instants, not strings with different offsets", () => {
  // 13:00+02:00 is 11:00Z — before a 12:00Z cutoff, so out of SLA, although "13:00" sorts after "12:00" as text
  const cutoff = Date.parse("2026-10-11T12:00:00Z");
  assert.equal(isOutOfSla({ lastBackupTime: "2026-10-11T13:00:00+02:00" }, cutoff), true);
});
