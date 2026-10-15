// One POST of a request to the gateway. No answer at all (network error) is `undefined`.
export async function postJson(action: string, fields: Record<string, string>, request: typeof fetch) {
  try {
    return await request(action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(fields),
    });
  } catch {
    return undefined;
  }
}
