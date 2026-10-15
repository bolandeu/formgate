// The time token of one form: the client takes it from the gateway (GET <action>?token), waits for the lower limit
// min_seconds, and takes a new one after every send. The visitor never sees any of it.
import { readChallenge, solveInBackground, type PowSolver } from './pow.ts';
import { clientSettings } from './settings.ts';

type TokenState =
  // `pow` is the solution of the ALTCHA challenge of the token, or `undefined` when there is no challenge or no solution.
  | { kind: 'token'; value: string; minSeconds: number; takenAt: number; pow?: Promise<string | undefined> }
  // The gateway does not know the token endpoint (old Lite, check off): send without a token.
  | { kind: 'none' }
  // No token yet, spent, or the gateway did not answer: take one before the send.
  | { kind: 'missing' };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function tokenUrl(action: string) {
  return `${action}${action.includes('?') ? '&' : '?'}token`;
}

async function readToken(response: Response, solve: PowSolver): Promise<TokenState> {
  try {
    const body = (await response.json()) as { token?: unknown; min_seconds?: unknown; challenge?: unknown };
    if (typeof body.token !== 'string') return { kind: 'none' };
    const challenge = readChallenge(body.challenge);
    const pow = challenge && solve(challenge);
    return { kind: 'token', value: body.token, minSeconds: Number(body.min_seconds) || 0, takenAt: Date.now(), pow };
  } catch {
    return { kind: 'none' };
  }
}

// `undefined` means the request failed (network error or a 5xx): worth a retry.
async function requestToken(url: string, request: typeof fetch, solve: PowSolver): Promise<TokenState | undefined> {
  try {
    const response = await request(url, { headers: { Accept: 'application/json' } });
    if (response.status >= 500) return undefined;
    return response.ok ? await readToken(response, solve) : { kind: 'none' };
  } catch {
    return undefined;
  }
}

async function requestTokenWithRetry(url: string, request: typeof fetch, solve: PowSolver): Promise<TokenState> {
  const { tokenRetryPauseMs, tokenRetryWindowMs } = clientSettings;
  const deadline = Date.now() + tokenRetryWindowMs;
  for (;;) {
    const state = await requestToken(url, request, solve);
    if (state) return state;
    if (Date.now() + tokenRetryPauseMs > deadline) return { kind: 'missing' };
    await sleep(tokenRetryPauseMs);
  }
}

// `solve` turns the ALTCHA challenge of a token into the __pow payload; the default solves it without a widget.
export function createTokenSource(action: string, request: typeof fetch, solve: PowSolver = solveInBackground) {
  const url = tokenUrl(action);
  let state: TokenState = { kind: 'missing' };
  let pending: Promise<void> | undefined;

  // A refresh already on its way is as good as a new one: its token is not spent yet.
  function refresh() {
    pending ??= requestTokenWithRetry(url, request, solve).then((next) => {
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
    const payload = await taken.pow;
    return payload ? { __token: taken.value, __pow: payload } : { __token: taken.value };
  }

  return { refresh, stamp };
}
