// Helpers of the client tests: a JSON answer and the POST calls of a faked fetch (token requests are GET).
import type { Mock } from 'vitest';

export function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function posts(fetchStub: Mock) {
  return (fetchStub.mock.calls as unknown as [string, RequestInit | undefined][]).filter(([, init]) => init?.method === 'POST');
}

export function postedFields(call: [string, RequestInit | undefined]) {
  return JSON.parse(call[1]!.body as string) as Record<string, string>;
}

// A gateway without the token endpoint (old Lite): GET ?token answers 404, the POST goes to `onPost`.
export function gatewayWithoutToken<T extends (...args: never[]) => unknown>(onPost: T): typeof fetch {
  return ((url: string, init?: RequestInit) =>
    init?.method === 'POST' ? onPost(...([url, init] as never[])) : Promise.resolve(answer(404, {}))) as unknown as typeof fetch;
}
