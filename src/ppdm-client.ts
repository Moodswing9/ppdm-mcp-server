import axios, { type AxiosInstance } from "axios";
import https from "https";

export interface Activity {
  id: string;
  assetName: string;
  assetType: string;
  state: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  bytesTransferred?: number;
  errorCode?: string;
  error?: { message: string };
}

export interface Asset {
  id: string;
  name: string;
  type: string;
  protectionStatus: string;
  lastBackupTime?: string;
}

export interface Policy {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  scheduleInfo?: unknown;
}

export interface PolicySchedule {
  policyId: string;
  policyName: string;
  enabled: boolean;
  type: string;
  stages: Array<{
    id: string;
    type: string;
    schedule?: {
      frequency: string;
      startTime: string;
      duration: number;
      unit?: string;
    };
  }>;
}

export interface RestoreSession {
  id: string;
  state: string;
  startTime: string;
  endTime?: string;
  assetName?: string;
  assetType?: string;
  targetLocation?: string;
  bytesRestored?: number;
  percentComplete?: number;
}

/**
 * Pick exactly one item by name from a partial-match search result.
 * An exact (case-insensitive) name wins; a single partial match is accepted;
 * several partial matches are refused so a write tool never acts on the wrong object.
 */
export function resolveOne<T extends { name: string }>(items: T[], query: string, kind: string): T {
  if (items.length === 0) throw new Error(`No ${kind} matching "${query}"`);
  const exact = items.filter(i => i.name.toLowerCase() === query.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (items.length === 1) return items[0];
  const names = (exact.length > 1 ? exact : items).slice(0, 10).map(i => `"${i.name}"`).join(", ");
  throw new Error(`${kind[0].toUpperCase()}${kind.slice(1)} name "${query}" is ambiguous — matches ${names}. Use the exact name.`);
}

/** True when an asset has never been backed up, or its last backup is at or before the cutoff. */
export function isOutOfSla(asset: Pick<Asset, "lastBackupTime">, cutoffMs: number): boolean {
  if (!asset.lastBackupTime) return true;
  const t = Date.parse(asset.lastBackupTime);
  return Number.isNaN(t) || t <= cutoffMs;
}

export class PPDMClient {
  private http: AxiosInstance;
  private token: string | null = null;
  private baseUrl: string;

  constructor(
    host: string,
    private username: string,
    private password: string,
    port = 8443,
  ) {
    this.baseUrl = `https://${host}:${port}/api/v2`;
    this.http = axios.create({
      baseURL: this.baseUrl,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30_000,
    });
  }

  static fromEnv(): PPDMClient {
    const host = process.env.PPDM_HOST;
    const user = process.env.PPDM_USER;
    const pass = process.env.PPDM_PASS;
    if (!host || !user || !pass) {
      throw new Error("PPDM_HOST, PPDM_USER, PPDM_PASS must be set");
    }
    return new PPDMClient(host, user, pass, Number(process.env.PPDM_PORT ?? 8443));
  }

  async login(): Promise<void> {
    const res = await this.http.post("/login", {
      username: this.username,
      password: this.password,
    });
    this.token = res.data.access_token;
    this.http.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;
  }

  async logout(): Promise<void> {
    if (this.token) await this.http.post("/logout").catch(() => {});
    this.token = null;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.token) await this.login();
  }

  private async getAll<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
    await this.ensureAuth();
    const res = await this.http.get(path, { params: { pageSize: 200, ...params } });
    return res.data?.content ?? res.data ?? [];
  }

  async listActivities(opts: { state?: string; assetType?: string; limit?: number } = {}): Promise<Activity[]> {
    const filter: string[] = [];
    if (opts.state) filter.push(`state eq "${opts.state}"`);
    if (opts.assetType) filter.push(`assetType eq "${opts.assetType}"`);
    const params: Record<string, unknown> = { pageSize: opts.limit ?? 50 };
    if (filter.length) params.filter = filter.join(" and ");
    return this.getAll<Activity>("/activities", params);
  }

  async getActivity(id: string): Promise<Activity> {
    await this.ensureAuth();
    const res = await this.http.get(`/activities/${id}`);
    return res.data;
  }

  async cancelActivity(id: string): Promise<void> {
    await this.ensureAuth();
    await this.http.post(`/activities/${id}/cancel`);
  }

  async pollUntilComplete(
    id: string,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<Activity> {
    const interval = opts.intervalMs ?? 15_000;
    const timeout  = opts.timeoutMs  ?? 3_600_000; // 1 hour default
    const deadline = Date.now() + timeout;
    const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELED", "SKIPPED", "COMPLETED"]);

    while (Date.now() < deadline) {
      const act = await this.getActivity(id);
      if (terminal.has(act.state?.toUpperCase() ?? "")) return act;
      await new Promise(r => setTimeout(r, interval));
    }
    throw new Error(`Timed out waiting for activity ${id} after ${timeout / 1000}s`);
  }

  async listAssets(opts: { name?: string; type?: string; limit?: number } = {}): Promise<Asset[]> {
    const filter: string[] = [];
    if (opts.name) filter.push(`name lk "%${opts.name}%"`);
    if (opts.type) filter.push(`type eq "${opts.type}"`);
    const params: Record<string, unknown> = { pageSize: opts.limit ?? 50 };
    if (filter.length) params.filter = filter.join(" and ");
    return this.getAll<Asset>("/assets", params);
  }

  /** Every asset, across all result pages (0-based page / page.totalPages). */
  async listAllAssets(): Promise<Asset[]> {
    await this.ensureAuth();
    const all: Asset[] = [];
    for (let page = 0; page < 500; page++) {
      const res = await this.http.get("/assets", { params: { pageSize: 200, page } });
      const content: Asset[] = res.data?.content ?? (Array.isArray(res.data) ? res.data : []);
      all.push(...content);
      const totalPages = Number(res.data?.page?.totalPages ?? 1);
      if (Array.isArray(res.data) || content.length === 0 || page + 1 >= totalPages) break;
    }
    return all;
  }

  async listPolicies(name?: string): Promise<Policy[]> {
    const params: Record<string, unknown> = { pageSize: 100 };
    if (name) params.filter = `name lk "%${name}%"`;
    return this.getAll<Policy>("/protection-policies", params);
  }

  async triggerBackup(policyId: string, assetIds: string[]): Promise<{ activityId: string }> {
    await this.ensureAuth();
    const res = await this.http.post(`/protection-policies/${policyId}/protections`, {
      assetIds,
      backupType: "FULL",
    });
    return { activityId: res.data?.id ?? res.data?.activityId };
  }

  async listCopies(assetId: string): Promise<Record<string, unknown>[]> {
    await this.ensureAuth();
    const res = await this.http.get(`/assets/${assetId}/copies`, { params: { pageSize: 10, orderby: "createTime DESC" } });
    return res.data?.content ?? res.data ?? [];
  }

  async restoreLatest(assetName: string): Promise<{ activityId: string; assetId: string; assetName: string; copyId: string }> {
    const asset  = resolveOne(await this.listAssets({ name: assetName, limit: 200 }), assetName, "asset");
    const copies = await this.listCopies(asset.id);
    if (copies.length === 0) throw new Error(`No copies found for asset "${asset.name}"`);
    const copy = copies[0] as { id: string };
    const res  = await this.http.post(`/assets/${asset.id}/restore`, {
      copyId:      copy.id,
      restoreType: "ORIGINAL_LOCATION",
    });
    return {
      activityId: res.data?.id ?? res.data?.activityId,
      assetId:    asset.id,
      assetName:  asset.name,
      copyId:     copy.id,
    };
  }

  async bulkTriggerBackup(policyName: string, assetFilter?: { name?: string; type?: string }): Promise<{ policyName: string; triggered: number; activityIds: string[] }> {
    const [policies, assets] = await Promise.all([
      this.listPolicies(policyName),
      this.listAssets({ name: assetFilter?.name, type: assetFilter?.type, limit: 200 }),
    ]);
    const policy = resolveOne(policies, policyName, "policy");
    if (assets.length === 0) throw new Error("No assets matched the filter");
    const activityIds: string[] = [];
    for (const asset of assets) {
      const { activityId } = await this.triggerBackup(policy.id, [asset.id]);
      if (activityId) activityIds.push(activityId);
    }
    return { policyName: policy.name, triggered: activityIds.length, activityIds };
  }

  async bulkCancelJobs(assetType?: string): Promise<{ canceled: number; ids: string[] }> {
    const running = await this.listActivities({ state: "RUNNING", assetType, limit: 100 });
    const ids: string[] = [];
    for (const job of running) {
      await this.cancelActivity(job.id);
      ids.push(job.id);
    }
    return { canceled: ids.length, ids };
  }

  async getSlaCompliance(hours = 24, now = Date.now()): Promise<{ compliant: number; nonCompliant: number; assets: Asset[] }> {
    const assets = await this.listAllAssets();
    const cutoff = now - hours * 3600_000;
    const nonCompliant = assets.filter(a => isOutOfSla(a, cutoff));
    return { compliant: assets.length - nonCompliant.length, nonCompliant: nonCompliant.length, assets: nonCompliant };
  }

  async listSchedules(): Promise<PolicySchedule[]> {
    const policies = await this.listPolicies();
    return policies.map(p => ({
      policyId: p.id,
      policyName: p.name,
      enabled: p.enabled,
      type: p.type,
      stages: (p as any).stages ?? [],
    }));
  }

  async setPolicyEnabled(policyId: string, enabled: boolean): Promise<void> {
    await this.ensureAuth();
    const res = await this.http.get(`/protection-policies/${policyId}`);
    const policy = res.data;
    await this.http.put(`/protection-policies/${policyId}`, { ...policy, enabled });
  }

  async updatePolicySchedule(
    policyId: string,
    stageIndex: number,
    opts: { frequency?: string; startTime?: string; duration?: number },
  ): Promise<void> {
    await this.ensureAuth();
    const res = await this.http.get(`/protection-policies/${policyId}`);
    const policy = res.data;
    if (!policy.stages?.[stageIndex]) throw new Error(`Stage index ${stageIndex} not found`);
    const stage = policy.stages[stageIndex];
    if (stage.schedule) {
      if (opts.frequency) stage.schedule.frequency = opts.frequency;
      if (opts.startTime) stage.schedule.startTime = opts.startTime;
      if (opts.duration !== undefined) stage.schedule.duration = opts.duration;
    }
    await this.http.put(`/protection-policies/${policyId}`, policy);
  }

  async listRestoreSessions(filter?: string): Promise<RestoreSession[]> {
    await this.ensureAuth();
    const params: Record<string, unknown> = { pageSize: 100 };
    if (filter) params.filter = filter;
    const res = await this.http.get("/restore-sessions", { params });
    return res.data?.content ?? res.data ?? [];
  }

  async getRestoreSession(id: string): Promise<RestoreSession> {
    await this.ensureAuth();
    const res = await this.http.get(`/restore-sessions/${id}`);
    return res.data;
  }

  async cancelRestoreSession(id: string): Promise<void> {
    await this.ensureAuth();
    await this.http.delete(`/restore-sessions/${id}`);
  }

  async getSystemHealth(): Promise<Record<string, unknown>> {
    await this.ensureAuth();
    const [failedJobs, runningJobs, assets] = await Promise.all([
      this.listActivities({ state: "FAILED", limit: 10 }),
      this.listActivities({ state: "RUNNING", limit: 10 }),
      this.listAssets({ limit: 1 }),
    ]);
    // Samples the 10 most recent failed / running activities; counts are capped at 10.
    return {
      recentFailedJobs: failedJobs.length,
      runningJobs: runningJobs.length,
      status: failedJobs.length === 0 ? "HEALTHY" : failedJobs.length < 5 ? "WARNING" : "CRITICAL",
    };
  }
}
