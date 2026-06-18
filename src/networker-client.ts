import axios, { type AxiosInstance } from "axios";
import https from "https";

export interface Saveset {
  id: string;
  name: string;
  clientName: string;
  saveTime: string;
  size: number;
  level: string;
  status: string;
  retentionTime?: string;
}

export interface NWClient {
  id: string;
  name: string;
  hostname: string;
  enabled: boolean;
  pools?: string[];
}

export interface NWPolicy {
  id: string;
  name: string;
  enabled: boolean;
  action?: string;
}

export class NetWorkerClient {
  private http: AxiosInstance;
  private baseUrl: string;

  constructor(
    host: string,
    private username: string,
    private password: string,
    port = 9090,
  ) {
    this.baseUrl = `https://${host}:${port}/nwrestapi/v3`;
    this.http = axios.create({
      baseURL: this.baseUrl,
      auth: { username, password },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30_000,
    });
  }

  static fromEnv(): NetWorkerClient {
    const host = process.env.NW_HOST;
    const user = process.env.NW_USER;
    const pass = process.env.NW_PASS;
    if (!host || !user || !pass) {
      throw new Error("NW_HOST, NW_USER, NW_PASS must be set");
    }
    return new NetWorkerClient(host, user, pass, Number(process.env.NW_PORT ?? 9090));
  }

  private async getAll<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const res = await this.http.get(path, { params });
    return res.data?.savesets ?? res.data?.clients ?? res.data?.protectiongroups ?? res.data ?? [];
  }

  async listSavesets(opts: { clientName?: string; status?: string; limit?: number } = {}): Promise<Saveset[]> {
    const params: Record<string, unknown> = { count: opts.limit ?? 50 };
    if (opts.clientName) params["q"] = `clientName:${opts.clientName}`;
    const res = await this.http.get("/global/savesets", { params });
    return res.data?.savesets ?? [];
  }

  async listFailedSavesets(limit = 50): Promise<Saveset[]> {
    const all = await this.listSavesets({ limit: limit * 2 });
    return all.filter(s => s.status !== "succeeded" && s.status !== "browseable").slice(0, limit);
  }

  async listClients(name?: string): Promise<NWClient[]> {
    const res = await this.http.get("/global/clients", { params: { count: 100 } });
    const clients: NWClient[] = res.data?.clients ?? [];
    if (name) return clients.filter(c => c.name.toLowerCase().includes(name.toLowerCase()));
    return clients;
  }

  async getClient(clientId: string): Promise<NWClient> {
    const res = await this.http.get(`/global/clients/${clientId}`);
    return res.data;
  }

  async listPolicies(name?: string): Promise<NWPolicy[]> {
    const res = await this.http.get("/global/protectiongroups", { params: { count: 100 } });
    const policies: NWPolicy[] = res.data?.protectiongroups ?? [];
    if (name) return policies.filter(p => p.name.toLowerCase().includes(name.toLowerCase()));
    return policies;
  }

  async triggerSave(clientId: string): Promise<{ jobId: string }> {
    const res = await this.http.post(`/global/clients/${clientId}/op/backup`);
    return { jobId: res.data?.id ?? res.data?.jobId ?? "unknown" };
  }
}
