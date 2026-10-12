// A stand-in for the axios instance the clients hold in `this.http`.
// Routes map "METHOD /path" to a handler; every call is recorded.

export type Call = { method: string; url: string; params?: Record<string, unknown>; body?: unknown };
type Handler = (call: Call) => unknown;

export function fakeHttp(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = [];
  const handle = async (method: string, url: string, params?: Record<string, unknown>, body?: unknown) => {
    const call = { method, url, params, body };
    calls.push(call);
    const route = routes[`${method} ${url}`];
    if (route === undefined) throw new Error(`unexpected ${method} ${url}`);
    const data = typeof route === "function" ? (route as Handler)(call) : route;
    return { data };
  };
  const http = {
    defaults: { headers: { common: {} as Record<string, string> } },
    get: (url: string, config?: { params?: Record<string, unknown> }) => handle("GET", url, config?.params),
    post: (url: string, body?: unknown) => handle("POST", url, undefined, body),
    put: (url: string, body?: unknown) => handle("PUT", url, undefined, body),
    delete: (url: string) => handle("DELETE", url),
  };
  return { http, calls };
}

/** Replace a client's private axios instance with a fake. */
export function inject<T>(client: T, http: unknown): T {
  (client as unknown as { http: unknown }).http = http;
  return client;
}

/** Serve `items` as PPDM-style pages ({ content, page.totalPages }) based on page/pageSize params. */
export function paged(items: unknown[]) {
  return (call: Call) => {
    const page = Number(call.params?.page ?? 0);
    const size = Number(call.params?.pageSize ?? 200);
    return { content: items.slice(page * size, (page + 1) * size), page: { totalPages: Math.max(1, Math.ceil(items.length / size)) } };
  };
}
