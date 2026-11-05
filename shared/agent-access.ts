// Personal access tokens for coding agents (docs/AGENT_INTERFACE.md, server/agent-tokens.ts). Every token reads; `write`
// adds creating, changing and deleting; `paid` adds requests that spend the account's credits.
export const AGENT_SCOPES = ['read', 'write', 'paid'] as const;
export type AgentScope = typeof AGENT_SCOPES[number];

// How long a new token lasts, in days; null never ends.
export const AGENT_TOKEN_DAYS = [30, 90, 365, null] as const;
export type AgentTokenDays = typeof AGENT_TOKEN_DAYS[number];
export const DEFAULT_AGENT_TOKEN_DAYS: AgentTokenDays = 90;

// `prepped_` and 32 random bytes in base64url. The prefix lets secret scanners and the service tell it from a sign-in.
export const AGENT_TOKEN_PREFIX = 'prepped_';
export const AGENT_TOKEN_PATTERN = /^prepped_[A-Za-z0-9_-]{43}$/;
export const AGENT_BEARER_PATTERN = /^Bearer prepped_[A-Za-z0-9_-]{43}$/;

export type AgentTokenSummary = {
  id: string; name: string; hint: string; scopes: AgentScope[];
  createdAt: string; expiresAt: string | null; lastUsedAt: string | null; lastUsedBy: string | null;
  /** The tool it is for (shared/agent-clients.ts), null when not known. */
  client: string | null;
};
