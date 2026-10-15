// The proof-of-work of one time token: the gateway may hand the client an ALTCHA challenge with the token. The client
// solves it in the background and sends the ALTCHA payload (base64 JSON) in the service field __pow.
import { solveChallenge } from 'altcha-lib/v1';
import type { Challenge } from 'altcha-lib/v1/types';

export type PowChallenge = Challenge;

// Solves one challenge to the payload; `undefined` when it cannot be solved (the request then goes without __pow).
export type PowSolver = (challenge: PowChallenge) => Promise<string | undefined>;

export async function solveInBackground(challenge: PowChallenge): Promise<string | undefined> {
  try {
    const solution = await solveChallenge(challenge.challenge, challenge.salt, challenge.algorithm, challenge.maxnumber).promise;
    if (!solution) return undefined;
    const { algorithm, challenge: hash, salt, signature } = challenge;
    return btoa(JSON.stringify({ algorithm, challenge: hash, number: solution.number, salt, signature }));
  } catch {
    return undefined;
  }
}

export function readChallenge(value: unknown): PowChallenge | undefined {
  const challenge = value as Partial<PowChallenge> | null | undefined;
  const complete =
    typeof challenge?.algorithm === 'string' &&
    typeof challenge.challenge === 'string' &&
    typeof challenge.salt === 'string' &&
    typeof challenge.signature === 'string';
  return complete ? (challenge as PowChallenge) : undefined;
}
