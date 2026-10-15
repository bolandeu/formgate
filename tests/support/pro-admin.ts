// Helpers for the Pro admin API tests: one call to the admin entry with an optional Bearer key and JSON body, and
// the answer as status and parsed JSON (null for an empty body).
import type { Pro } from './pro.ts';

export interface AdminAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

interface AdminCall {
  method?: string;
  key?: string;
  body?: unknown;
}

export async function callAdmin(server: Pro, path: string, call: AdminCall = {}): Promise<AdminAnswer> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (call.key !== undefined) headers.Authorization = `Bearer ${call.key}`;
  if (call.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(server.url + path, {
    method: call.method ?? 'GET',
    headers,
    body: call.body === undefined ? undefined : typeof call.body === 'string' ? call.body : JSON.stringify(call.body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}
