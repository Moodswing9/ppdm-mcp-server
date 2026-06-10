#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PPDMClient } from "./ppdm-client.js";
import { config } from "dotenv";

config();

const server = new McpServer({
  name: "ppdm-mcp-server",
  version: "1.0.0",
});

function client(): PPDMClient {
  return PPDMClient.fromEnv();
}

async function withClient<T>(fn: (c: PPDMClient) => Promise<T>): Promise<T> {
  const c = client();
  try {
    await c.login();
    return await fn(c);
  } finally {
    await c.logout();
  }
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

// ── start ─────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
