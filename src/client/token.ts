// The time token of one form: the client takes it from the gateway (GET <action>?token), waits for the lower limit
// min_seconds, and takes a new one after every send. The visitor never sees any of it.
import { clientSettings } from './settings.ts';

type TokenState =
  | { kind: 'token'; value: string; minSeconds: number; takenAt: number }
  // The gateway does not know the token endpoint (old Lite, check off): send without a token.
  | { kind: 'none' }
  // No token yet, spent, or the gateway did not answer: take one before the send.
  | { kind: 'missing' };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function tokenUrl(action: string) {
  return `${action}${action.includes('?') ? '&' : '?'}token`;
}

async function readToken(response: Response): Promise<TokenState> {
  try {
    const body = (await response.json()) as { token?: unknown; min_seconds?: unknown };
    if (typeof body.token !== 'string') return { kind: 'none' };
    return { kind: 'token', value: body.token, minSeconds: Number(body.min_seconds) || 0, takenAt: Date.now() };
  } catch {
    return { kind: 'none' };
  }
}

// `undefined` means the request failed (network error or a 5xx): worth a retry.
async function requestToken(url: string, request: typeof fetch): Promise<TokenState | undefined> {
  try {
    const response = await request(url, { headers: { Accept: 'application/json' } });
    if (response.status >= 500) return undefined;
    return response.ok ? await readToken(response) : { kind: 'none' };
  } catch {
    return undefined;
  }
}

async function requestTokenWithRetry(url: string, request: typeof fetch): Promise<TokenState> {
  const { tokenRetryPauseMs, tokenRetryWindowMs } = clientSettings;
  const deadline = Date.now() + tokenRetryWindowMs;
  for (;;) {
    const state = await requestToken(url, request);
    if (state) return state;
    if (Date.now() + tokenRetryPauseMs > deadline) return { kind: 'missing' };
    await sleep(tokenRetryPauseMs);
  }
}

export function createTokenSource(action: string, request: typeof fetch) {
  const url = tokenUrl(action);
  let state: TokenState = { kind: 'missing' };
  let pending: Promise<void> | undefined;

  // A refresh already on its way is as good as a new one: its token is not spent yet.
  function refresh() {
    pending ??= requestTokenWithRetry(url, request).then((next) => {
      state = next;
      pending = undefined;
    });
    return pending;
  }

  function isStale() {
    if (state.kind === 'missing') return true;
    return state.kind === 'token' && Date.now() - state.takenAt > clientSettings.tokenMaxAgeMs;
  }

  // The service fields for one send. Waits for the lower limit; spends the token.
  async function stamp(): Promise<Record<string, string>> {
    if (isStale()) void refresh();
    await pending;
    const taken = state;
    if (taken.kind === 'none') return {};
    if (taken.kind === 'missing') return { __token_unavailable: '1' };
    state = { kind: 'missing' };
    const wait = taken.takenAt + taken.minSeconds * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    return { __token: taken.value };
  }

  return { refresh, stamp };
}
