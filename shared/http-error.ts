// A refusal written for the person: its HTTP status, its sentence, and a code the app can act on. The service's error
// handler shows its sentence as it is; any other error shows a plain sentence for its status (server/app-core.ts).
export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}
