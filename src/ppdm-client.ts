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

  async listAssets(opts: { name?: string; type?: string; limit?: number } = {}): Promise<Asset[]> {
    const filter: string[] = [];
    if (opts.name) filter.push(`name lk "%${opts.name}%"`);
    if (opts.type) filter.push(`type eq "${opts.type}"`);
    const params: Record<string, unknown> = { pageSize: opts.limit ?? 50 };
    if (filter.length) params.filter = filter.join(" and ");
    return this.getAll<Asset>("/assets", params);
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

  async getSlaCompliance(hours = 24): Promise<{ compliant: number; nonCompliant: number; assets: Asset[] }> {
    const assets = await this.listAssets();
    const cutoff = new Date(Date.now() - hours * 3600_000).toISOString();
    const compliant = assets.filter(a => a.lastBackupTime && a.lastBackupTime > cutoff);
    const nonCompliant = assets.filter(a => !a.lastBackupTime || a.lastBackupTime <= cutoff);
    return { compliant: compliant.length, nonCompliant: nonCompliant.length, assets: nonCompliant };
  }

  async getSystemHealth(): Promise<Record<string, unknown>> {
    await this.ensureAuth();
    const [failedJobs, runningJobs, assets] = await Promise.all([
      this.listActivities({ state: "FAILED", limit: 10 }),
      this.listActivities({ state: "RUNNING", limit: 10 }),
      this.listAssets({ limit: 1 }),
    ]);
    return {
      failedJobsLast24h: failedJobs.length,
      runningJobs: runningJobs.length,
      status: failedJobs.length === 0 ? "HEALTHY" : failedJobs.length < 5 ? "WARNING" : "CRITICAL",
    };
  }
}
