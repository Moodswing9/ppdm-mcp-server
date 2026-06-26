#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PPDMClient } from "./ppdm-client.js";
import { NetWorkerClient } from "./networker-client.js";
import { DataDomainClient } from "./datadomain-client.js";
import { config } from "dotenv";

config();

const server = new McpServer({
  name: "ppdm-mcp-server",
  version: "3.0.0",
});

async function withClient<T>(fn: (c: PPDMClient) => Promise<T>): Promise<T> {
  const c = PPDMClient.fromEnv();
  try {
    await c.login();
    return await fn(c);
  } finally {
    await c.logout();
  }
}

function nwClient(): NetWorkerClient {
  return NetWorkerClient.fromEnv();
}

function ddClient(): DataDomainClient {
  return DataDomainClient.fromEnv();
}

// ── list_failed_jobs ──────────────────────────────────────────────────────────
server.tool(
  "list_failed_jobs",
  "List failed backup jobs from PPDM. Returns asset name, type, error, and start time.",
  {
    asset_type: z.string().optional().describe("Filter by asset type: KUBERNETES, VMWARE_VIRTUAL_MACHINE, MICROSOFT_SQL_SERVER, etc."),
    limit:      z.number().optional().default(20).describe("Max results (default 20)"),
  },
  async ({ asset_type, limit }) => {
    const jobs = await withClient(c =>
      c.listActivities({ state: "FAILED", assetType: asset_type, limit })
    );
    return {
      content: [{
        type: "text",
        text: jobs.length === 0
          ? "No failed jobs found."
          : `Found ${jobs.length} failed job(s):\n\n` +
            jobs.map(j =>
              `• ${j.assetName} (${j.assetType})\n  Error: ${j.error?.message ?? j.errorCode ?? "unknown"}\n  Started: ${j.startTime}`
            ).join("\n\n"),
      }],
    };
  },
);

// ── list_running_jobs ─────────────────────────────────────────────────────────
server.tool(
  "list_running_jobs",
  "List currently running backup jobs in PPDM.",
  {
    asset_type: z.string().optional().describe("Filter by asset type"),
  },
  async ({ asset_type }) => {
    const jobs = await withClient(c =>
      c.listActivities({ state: "RUNNING", assetType: asset_type, limit: 50 })
    );
    return {
      content: [{
        type: "text",
        text: jobs.length === 0
          ? "No running jobs."
          : `${jobs.length} job(s) currently running:\n\n` +
            jobs.map(j => `• ${j.assetName} (${j.assetType})  started: ${j.startTime}`).join("\n"),
      }],
    };
  },
);

// ── list_assets ───────────────────────────────────────────────────────────────
server.tool(
  "list_assets",
  "List protected assets in PPDM. Filter by name or type.",
  {
    name:  z.string().optional().describe("Asset name substring filter"),
    type:  z.string().optional().describe("Asset type filter"),
    limit: z.number().optional().default(50).describe("Max results"),
  },
  async ({ name, type, limit }) => {
    const assets = await withClient(c => c.listAssets({ name, type, limit }));
    return {
      content: [{
        type: "text",
        text: assets.length === 0
          ? "No assets found."
          : `${assets.length} asset(s):\n\n` +
            assets.map(a =>
              `• ${a.name} [${a.type}] — ${a.protectionStatus}` +
              (a.lastBackupTime ? `  last backup: ${a.lastBackupTime}` : "  never backed up")
            ).join("\n"),
      }],
    };
  },
);

// ── list_policies ─────────────────────────────────────────────────────────────
server.tool(
  "list_policies",
  "List protection policies configured in PPDM.",
  {
    name: z.string().optional().describe("Policy name substring filter"),
  },
  async ({ name }) => {
    const policies = await withClient(c => c.listPolicies(name));
    return {
      content: [{
        type: "text",
        text: policies.length === 0
          ? "No policies found."
          : `${policies.length} policy/policies:\n\n` +
            policies.map(p =>
              `• ${p.name} [${p.type}] — ${p.enabled ? "enabled" : "disabled"}`
            ).join("\n"),
      }],
    };
  },
);

// ── get_activity ──────────────────────────────────────────────────────────────
server.tool(
  "get_activity",
  "Get full detail for a specific PPDM activity by ID.",
  {
    activity_id: z.string().describe("PPDM activity ID"),
  },
  async ({ activity_id }) => {
    const act = await withClient(c => c.getActivity(activity_id));
    return {
      content: [{ type: "text", text: JSON.stringify(act, null, 2) }],
    };
  },
);

// ── cancel_activity ───────────────────────────────────────────────────────────
server.tool(
  "cancel_activity",
  "Cancel a running PPDM activity.",
  {
    activity_id: z.string().describe("PPDM activity ID to cancel"),
  },
  async ({ activity_id }) => {
    await withClient(c => c.cancelActivity(activity_id));
    return {
      content: [{ type: "text", text: `Activity ${activity_id} cancellation requested.` }],
    };
  },
);

// ── trigger_backup ────────────────────────────────────────────────────────────
server.tool(
  "trigger_backup",
  "Trigger an on-demand backup for an asset using a named protection policy.",
  {
    policy_name: z.string().describe("Exact or partial protection policy name"),
    asset_name:  z.string().describe("Exact or partial asset name"),
  },
  async ({ policy_name, asset_name }) => {
    const { activityId } = await withClient(async c => {
      const policies = await c.listPolicies(policy_name);
      const assets   = await c.listAssets({ name: asset_name });
      if (policies.length === 0) throw new Error(`No policy matching "${policy_name}"`);
      if (assets.length   === 0) throw new Error(`No asset matching "${asset_name}"`);
      return c.triggerBackup(policies[0].id, [assets[0].id]);
    });
    return {
      content: [{
        type: "text",
        text: `Backup triggered. Activity ID: ${activityId}\nUse get_activity to monitor progress.`,
      }],
    };
  },
);

// ── get_sla_compliance ────────────────────────────────────────────────────────
server.tool(
  "get_sla_compliance",
  "Report SLA compliance — which assets have not been backed up within the required window.",
  {
    hours: z.number().optional().default(24).describe("Compliance window in hours (default 24)"),
  },
  async ({ hours }) => {
    const { compliant, nonCompliant, assets } = await withClient(c => c.getSlaCompliance(hours));
    const total = compliant + nonCompliant;
    const pct   = total > 0 ? ((compliant / total) * 100).toFixed(1) : "0.0";
    const lines = [`SLA compliance (${hours}h window): ${pct}% (${compliant}/${total})`];
    if (nonCompliant > 0) {
      lines.push(`\nNon-compliant assets (${nonCompliant}):`);
      assets.slice(0, 20).forEach(a =>
        lines.push(`• ${a.name} [${a.type}]  last backup: ${a.lastBackupTime ?? "never"}`)
      );
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

// ── get_system_health ─────────────────────────────────────────────────────────
server.tool(
  "get_system_health",
  "Get an overall health summary for the PPDM environment.",
  {},
  async () => {
    const health = await withClient(c => c.getSystemHealth());
    return {
      content: [{
        type: "text",
        text: `PPDM Health: ${health.status}\n` +
              `Failed jobs (last 24h): ${health.failedJobsLast24h}\n` +
              `Running jobs: ${health.runningJobs}`,
      }],
    };
  },
);

// ── poll_until_complete ───────────────────────────────────────────────────────
server.tool(
  "poll_until_complete",
  "Poll a PPDM activity until it reaches a terminal state (SUCCEEDED, FAILED, CANCELED). Returns the final activity record. Use after trigger_backup to await completion.",
  {
    activity_id:  z.string().describe("PPDM activity ID to poll"),
    timeout_mins: z.number().optional().default(60).describe("Max wait time in minutes (default 60)"),
    interval_secs: z.number().optional().default(15).describe("Poll interval in seconds (default 15)"),
  },
  async ({ activity_id, timeout_mins, interval_secs }) => {
    const act = await withClient(c =>
      c.pollUntilComplete(activity_id, {
        intervalMs: (interval_secs ?? 15) * 1_000,
        timeoutMs:  (timeout_mins  ?? 60) * 60_000,
      })
    );
    const duration = act.duration ? `${Math.round(act.duration / 60)}m` : "unknown";
    const bytes    = act.bytesTransferred
      ? `${(act.bytesTransferred / 1024 / 1024 / 1024).toFixed(2)} GB`
      : "unknown";
    return {
      content: [{
        type: "text",
        text: `Activity ${activity_id} completed.\n\n` +
              `Status:    ${act.state}\n` +
              `Asset:     ${act.assetName} (${act.assetType})\n` +
              `Duration:  ${duration}\n` +
              `Data:      ${bytes}\n` +
              `Ended:     ${act.endTime ?? "unknown"}` +
              (act.error?.message ? `\nError:     ${act.error.message}` : ""),
      }],
    };
  },
);

// ── nw_list_savesets ──────────────────────────────────────────────────────────
server.tool(
  "nw_list_savesets",
  "List NetWorker savesets (backup copies). Filter by client name.",
  {
    client_name: z.string().optional().describe("Filter by client hostname substring"),
    limit:       z.number().optional().default(30).describe("Max results (default 30)"),
  },
  async ({ client_name, limit }) => {
    const nw = nwClient();
    const savesets = await nw.listSavesets({ clientName: client_name, limit });
    return {
      content: [{
        type: "text",
        text: savesets.length === 0
          ? "No savesets found."
          : `${savesets.length} saveset(s):\n\n` +
            savesets.map(s =>
              `• ${s.name} | client: ${s.clientName} | level: ${s.level} | status: ${s.status} | size: ${(s.size / 1024 / 1024).toFixed(1)} MB | saved: ${s.saveTime}`
            ).join("\n"),
      }],
    };
  },
);

// ── nw_list_failed_savesets ───────────────────────────────────────────────────
server.tool(
  "nw_list_failed_savesets",
  "List NetWorker savesets that did not complete successfully.",
  {
    limit: z.number().optional().default(20).describe("Max results"),
  },
  async ({ limit }) => {
    const nw = nwClient();
    const failed = await nw.listFailedSavesets(limit);
    return {
      content: [{
        type: "text",
        text: failed.length === 0
          ? "No failed savesets found."
          : `${failed.length} failed saveset(s):\n\n` +
            failed.map(s =>
              `• ${s.name} | client: ${s.clientName} | status: ${s.status} | saved: ${s.saveTime}`
            ).join("\n"),
      }],
    };
  },
);

// ── nw_list_clients ───────────────────────────────────────────────────────────
server.tool(
  "nw_list_clients",
  "List NetWorker clients registered on the server.",
  {
    name: z.string().optional().describe("Filter by client name substring"),
  },
  async ({ name }) => {
    const nw = nwClient();
    const clients = await nw.listClients(name);
    return {
      content: [{
        type: "text",
        text: clients.length === 0
          ? "No clients found."
          : `${clients.length} client(s):\n\n` +
            clients.map(c =>
              `• ${c.name} | hostname: ${c.hostname} | enabled: ${c.enabled}` +
              (c.pools?.length ? ` | pools: ${c.pools.join(", ")}` : "")
            ).join("\n"),
      }],
    };
  },
);

// ── nw_get_client ─────────────────────────────────────────────────────────────
server.tool(
  "nw_get_client",
  "Get detailed information for a specific NetWorker client by ID.",
  {
    client_id: z.string().describe("NetWorker client resource ID"),
  },
  async ({ client_id }) => {
    const nw = nwClient();
    const c = await nw.getClient(client_id);
    return {
      content: [{ type: "text", text: JSON.stringify(c, null, 2) }],
    };
  },
);

// ── nw_list_policies ──────────────────────────────────────────────────────────
server.tool(
  "nw_list_policies",
  "List NetWorker protection groups (policies).",
  {
    name: z.string().optional().describe("Filter by policy name substring"),
  },
  async ({ name }) => {
    const nw = nwClient();
    const policies = await nw.listPolicies(name);
    return {
      content: [{
        type: "text",
        text: policies.length === 0
          ? "No policies found."
          : `${policies.length} policy/policies:\n\n` +
            policies.map(p =>
              `• ${p.name} | enabled: ${p.enabled}` + (p.action ? ` | action: ${p.action}` : "")
            ).join("\n"),
      }],
    };
  },
);

// ── nw_trigger_save ───────────────────────────────────────────────────────────
server.tool(
  "nw_trigger_save",
  "Trigger an on-demand backup for a NetWorker client.",
  {
    client_id: z.string().describe("NetWorker client resource ID"),
  },
  async ({ client_id }) => {
    const nw = nwClient();
    const { jobId } = await nw.triggerSave(client_id);
    return {
      content: [{
        type: "text",
        text: `Backup triggered for client ${client_id}. Job ID: ${jobId}\nUse nw_list_savesets to monitor completion.`,
      }],
    };
  },
);

// ── dd_system_info ────────────────────────────────────────────────────────────
server.tool(
  "dd_system_info",
  "Get Data Domain system information — model, version, serial number, and uptime.",
  {},
  async () => {
    const dd = ddClient();
    const info = await dd.getSystemInfo();
    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  },
);

// ── dd_filesystem_stats ───────────────────────────────────────────────────────
server.tool(
  "dd_filesystem_stats",
  "Get Data Domain filesystem capacity — total, used, available in GiB and used percentage. Use to check if DD is running low on space.",
  {},
  async () => {
    const dd = ddClient();
    const stats = await dd.getFilesystemStats();
    const severity = stats.usedPct >= 85 ? "🔴 CRITICAL" : stats.usedPct >= 75 ? "🟡 WARNING" : "🟢 OK";
    return {
      content: [{
        type: "text",
        text: `Data Domain Filesystem\n\n` +
              `Status:    ${severity} (${stats.usedPct}% used)\n` +
              `Total:     ${stats.totalGiB} GiB\n` +
              `Used:      ${stats.usedGiB} GiB\n` +
              `Available: ${stats.availableGiB} GiB`,
      }],
    };
  },
);

// ── dd_ddboost_status ─────────────────────────────────────────────────────────
server.tool(
  "dd_ddboost_status",
  "Check whether DDBoost is enabled on Data Domain and list authorized DDBoost users.",
  {},
  async () => {
    const dd = ddClient();
    const status = await dd.getDDBoostStatus();
    return {
      content: [{
        type: "text",
        text: `DDBoost: ${status.enabled ? "✅ enabled" : "❌ disabled"}\n` +
              (status.users.length > 0
                ? `Users: ${status.users.join(", ")}`
                : "No DDBoost users configured."),
      }],
    };
  },
);

// ── dd_list_storage_units ─────────────────────────────────────────────────────
server.tool(
  "dd_list_storage_units",
  "List DDBoost storage units on Data Domain — name, assigned user, quota, and status.",
  {},
  async () => {
    const dd = ddClient();
    const units = await dd.listStorageUnits();
    return {
      content: [{
        type: "text",
        text: units.length === 0
          ? "No storage units found."
          : `${units.length} storage unit(s):\n\n` +
            units.map(u => {
              const quota = u.quota ? `${(u.quota / 1024).toFixed(1)} GiB quota` : "no quota";
              const used  = u.usedSpace ? `${(u.usedSpace / 1024).toFixed(1)} GiB used` : "";
              return `• ${u.name} | user: ${u.user} | ${quota}${used ? ` | ${used}` : ""} | ${u.status}`;
            }).join("\n"),
      }],
    };
  },
);

// ── dd_create_storage_unit ────────────────────────────────────────────────────
server.tool(
  "dd_create_storage_unit",
  "Create a new DDBoost storage unit on Data Domain.",
  {
    name:      z.string().describe("Storage unit name"),
    user:      z.string().describe("DDBoost user to assign"),
    quota_gib: z.number().optional().describe("Soft quota in GiB (optional)"),
  },
  async ({ name, user, quota_gib }) => {
    const dd = ddClient();
    await dd.createStorageUnit(name, user, quota_gib);
    return {
      content: [{
        type: "text",
        text: `Storage unit "${name}" created and assigned to user "${user}".` +
              (quota_gib ? ` Soft quota: ${quota_gib} GiB.` : ""),
      }],
    };
  },
);

// ── dd_list_users ─────────────────────────────────────────────────────────────
server.tool(
  "dd_list_users",
  "List local users configured on Data Domain.",
  {},
  async () => {
    const dd = ddClient();
    const users = await dd.listUsers();
    return {
      content: [{
        type: "text",
        text: users.length === 0
          ? "No users found."
          : `${users.length} user(s):\n\n` + users.map(u => `• ${u}`).join("\n"),
      }],
    };
  },
);

// ── start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
