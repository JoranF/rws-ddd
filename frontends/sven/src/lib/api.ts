// Eén dunne fetch-laag. Alle paden zijn RELATIEF (/beheer, /monitoring, /onderhoud,
// /contract) zodat dezelfde code lokaal (Vite-proxy) en in Docker (nginx) werkt.
// Er is GEEN mockdata: faalt een request, dan gooien we — de UI toont een foutstatus.

export type Service = 'beheer' | 'monitoring' | 'onderhoud' | 'contract';

export const SERVICES: Record<Service, { label: string; port: number }> = {
  beheer:     { label: 'Beheer',     port: 8004 },
  monitoring: { label: 'Monitoring', port: 8002 },
  onderhoud:  { label: 'Onderhoud',  port: 8003 },
  contract:   { label: 'Contract',   port: 8001 },
};

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, null, `Netwerkfout: ${path} onbereikbaar (${(e as Error).message})`);
  }
  const data = await parse(res);
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && ('message' in data || 'error' in data)
        ? JSON.stringify(data)
        : String(data)) || `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, data, `${method} ${path} → ${res.status}: ${msg}`);
  }
  return data as T;
}

export const api = {
  get:   <T>(path: string) => request<T>('GET', path),
  post:  <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
};

// Health: elke service heeft GET /<service>/health. 200 = groen.
export async function checkHealth(service: Service): Promise<boolean> {
  try {
    const res = await fetch(`/${service}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
