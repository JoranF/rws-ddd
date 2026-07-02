// Eén dunne fetch-laag. Alle paden zijn RELATIEF onder /svc/ (/svc/beheer, /svc/monitoring,
// /svc/onderhoud, /svc/contract) zodat dezelfde code lokaal (Vite-proxy) en in Docker
// (nginx) werkt. De /svc-prefix houdt API-verkeer gescheiden van de SPA-routes
// (/beheer, /monitoring, ...) — anders kaapt de proxy een harde refresh op die routes.
// Er is GEEN mockdata: faalt een request, dan gooien we — de UI toont een foutstatus.

import type { ContextKey } from './contexts';
import { accessToken } from '../auth/oidc';

export type Service = ContextKey;

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

// Stel de headers samen: JSON-content bij een body, en het Bearer-token als er een
// sessie is. Services accepteren zonder token nog steeds GET-verkeer (AUTH_ENABLED=false),
// maar met token dwingen ze schrijfrechten per context af.
function headers(hasBody: boolean): HeadersInit | undefined {
  const h: Record<string, string> = {};
  if (hasBody) h['Content-Type'] = 'application/json';
  const token = accessToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return Object.keys(h).length ? h : undefined;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(0, null, `Netwerkfout: ${path} onbereikbaar (${(e as Error).message})`);
  }
  const data = await parse(res);
  if (!res.ok) {
    const msg = typeof data === 'string' && data
      ? data
      : data
        ? JSON.stringify(data)
        : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, data, `${method} ${path} → ${res.status}: ${msg}`);
  }
  return data as T;
}

export const api = {
  get:   <T>(path: string) => request<T>('GET', path),
  post:  <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
};

// Health: elke service heeft GET /health (via de proxy: /svc/<service>/health). 200 = groen.
export async function checkHealth(service: Service): Promise<boolean> {
  try {
    const res = await fetch(`/svc/${service}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
