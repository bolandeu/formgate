// Settings of the client. A value that can change without a change of behaviour lives here, not in the logic.
export const clientSettings = {
  // A time token older than this is replaced before the send.
  tokenMaxAgeMs: 60 * 60 * 1000,
  // A failed token request is repeated with this pause, for the window in total; then the client sends without a token.
  tokenRetryPauseMs: 1000,
  tokenRetryWindowMs: 10_000,
  // Requests kept offline are sent again for this long; older ones are dropped.
  outboxKey: 'formgate:outbox',
  outboxMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
};
