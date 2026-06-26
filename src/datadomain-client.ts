import axios, { type AxiosInstance } from "axios";
import https from "https";

export interface DDStorageUnit {
  name: string;
  user: string;
  quota?: number;
  usedSpace?: number;
  status: string;
}

export interface DDFilesystemStats {
  totalGiB: number;
  usedGiB: number;
  availableGiB: number;
  usedPct: number;
}

export interface DDBoostStatus {
  enabled: boolean;
  users: string[];
}

export class DataDomainClient {
  private http: AxiosInstance;

  constructor(
    host: string,
    private username: string,
    private password: string,
    port = 3009,
  ) {
    this.http = axios.create({
      baseURL: `https://${host}:${port}/rest/v1.0`,
      auth: { username, password },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 30_000,
    });
  }

  static fromEnv(): DataDomainClient {
    const host = process.env.DD_HOST;
    const user = process.env.DD_USER;
    const pass = process.env.DD_PASS;
    if (!host || !user || !pass) {
      throw new Error("DD_HOST, DD_USER, DD_PASS must be set");
    }
    return new DataDomainClient(host, user, pass, Number(process.env.DD_PORT ?? 3009));
  }

  async getSystemInfo(): Promise<Record<string, unknown>> {
    const res = await this.http.get("/system");
    return res.data;
  }

  async getFilesystemStats(): Promise<DDFilesystemStats> {
    const res = await this.http.get("/filesystems");
    const fs = (res.data?.file_systems ?? [res.data])[0] ?? {};
    const total = Number(fs.total ?? fs.size ?? 0);
    const used  = Number(fs.used ?? 0);
    const avail = total - used;
    return {
      totalGiB:     parseFloat((total / 1024).toFixed(2)),
      usedGiB:      parseFloat((used  / 1024).toFixed(2)),
      availableGiB: parseFloat((avail / 1024).toFixed(2)),
      usedPct:      total > 0 ? parseFloat(((used / total) * 100).toFixed(1)) : 0,
    };
  }

  async listStorageUnits(): Promise<DDStorageUnit[]> {
    const res = await this.http.get("/ddboost/storage-units");
    return res.data?.storage_units ?? [];
  }

  async createStorageUnit(name: string, user: string, quotaGiB?: number): Promise<void> {
    const body: Record<string, unknown> = { name, user };
    if (quotaGiB) body.quota = { soft_limit: `${quotaGiB} GiB` };
    await this.http.post("/ddboost/storage-units", body);
  }

  async getDDBoostStatus(): Promise<DDBoostStatus> {
    const res = await this.http.get("/ddboost");
    const data = res.data ?? {};
    return {
      enabled: data.status === "enabled",
      users:   data.users ?? [],
    };
  }

  async listUsers(): Promise<string[]> {
    const res = await this.http.get("/users");
    return (res.data?.users ?? []).map((u: { name?: string }) => u.name ?? String(u));
  }
}
