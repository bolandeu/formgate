// The offline outbox: a request that could not reach the gateway waits in localStorage and is sent again on the
// online event and on the next page load. Each request goes once: it leaves the storage before it is sent.
import { clientSettings } from './settings.ts';
import { createTokenSource } from './token.ts';
import { postJson } from './transport.ts';

interface QueuedRequest {
  id: string;
  action: string;
  fields: Record<string, string>;
  at: number;
}

function load(): QueuedRequest[] {
  const raw = localStorage.getItem(clientSettings.outboxKey);
  try {
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as QueuedRequest[]) : [];
  } catch {
    return [];
  }
}

function save(list: QueuedRequest[]) {
  localStorage.setItem(clientSettings.outboxKey, JSON.stringify(list));
}

// False when localStorage does not work: the caller reports a plain network error.
export function enqueue(action: string, fields: Record<string, string>, at = Date.now()) {
  try {
    const id = `${at}-${Math.random().toString(36).slice(2)}`;
    save([...load(), { id, action, fields, at }]);
    return true;
  } catch {
    return false;
  }
}

// The requests that are not too old. Old ones are dropped from the storage.
function pendingRequests() {
  try {
    const list = load();
    const fresh = list.filter((item) => Date.now() - item.at <= clientSettings.outboxMaxAgeMs);
    if (fresh.length !== list.length) save(fresh);
    return fresh;
  } catch {
    return [];
  }
}

// True for the one caller that removed the request; a second flush then skips it.
function claim(id: string) {
  const list = load();
  if (!list.some((item) => item.id === id)) return false;
  save(list.filter((item) => item.id !== id));
  return true;
}

async function flush(request: typeof fetch) {
  for (const item of pendingRequests()) {
    const stamp = await createTokenSource(item.action, request).stamp();
    if (!claim(item.id)) continue;
    const response = await postJson(item.action, { ...item.fields, ...stamp }, request);
    if (!response) {
      enqueue(item.action, item.fields, item.at);
      return;
    }
  }
}

let started = false;

// Once per page: send the kept requests now and whenever the browser goes online.
export function startOutbox(request: typeof fetch) {
  if (started) return;
  started = true;
  window.addEventListener('online', () => void flush(request));
  void flush(request);
}
