import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { Client, PreppedError } from './client.js';
import { detectClient } from './detect-client.js';
import { AGENT_TOKEN_PATTERN } from '../../shared/agent-access.js';
import { GENERIC_AGENT_NAME, identityByName } from '../../shared/agent-client-identity.js';
import { connectionName, connectionPath, desktopDataDirs, desktopUrl, forgetConnection, forgetPending, readConnection, readPending, saveConnection, savePending, startDesktop,
  type Pending, type Saved, type Target } from './config.js';

// `prepped connect`: any agent that can run a command connects itself to the person's Prepped. It asks the Prepped
// desktop app on this computer (or Prepped on the web, with --url), the person allows it there, and the agent keeps its
// own key in a named connection (src/config.ts) that its MCP settings point to with PREPPED_CONNECTION. The request and
// the person's answer are server/agent-tokens.ts's /api/agent/pair routes. The connection is named after the tool that
// runs the command (src/detect-client.ts) unless the agent gives --name, so two tools never share one. The command
// waits at most --wait seconds (100 by default, inside the usual two-minute limit of an agent's commands); run again,
// it continues the same request instead of asking again.

const POLL_MS = 1500;
const DEFAULT_WAIT_S = 100;
type Notes = (line: string) => void;

/** A request that carries no key: the connection request and its wait. */
async function unsigned<T>(url: string, method: 'GET' | 'POST', route: string, userAgent: string, body?: unknown): Promise<{ status: number; data: T }> {
  let response: Response;
  try {
    response = await fetch(`${url}${route}`, { method, headers: { 'User-Agent': userAgent, Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Overlay-Client': '1' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    throw new PreppedError(`Could not reach Prepped at ${url}: ${(error as { cause?: { code?: string } }).cause?.code ?? (error as Error).message}`, null, 'UNREACHABLE');
  }
  const text = await response.text();
  const json = (response.headers.get('content-type') ?? '').includes('application/json') ? JSON.parse(text) as T & { error?: string; code?: string } : null;
  if (!response.ok && response.status !== 404) throw new PreppedError(json?.error ?? (text.slice(0, 500) || response.statusText), response.status, json?.code ?? null);
  if (!json) throw new PreppedError(`Prepped at ${url} answered without JSON (${response.status}). Is this the address of Prepped?`, response.status, 'NOT_PREPPED');
  return { status: response.status, data: json };
}

/** The Prepped desktop app running on this computer: its data folder and local address. */
async function runningDesktop(dataDir: string | undefined): Promise<{ url: string; desktop: string }> {
  const dirs = dataDir ? [path.resolve(dataDir)] : desktopDataDirs();
  const installed: string[] = [];
  for (const dir of dirs) {
    const url = await desktopUrl(dir);
    if (!url) continue;
    installed.push(dir);
    const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    if (health?.ok) return { url, desktop: dir };
  }
  // Closed: the app starts hidden, and comes up with the request to allow.
  for (const dir of installed) {
    const url = await startDesktop(dir);
    if (url) return { url, desktop: dir };
  }
  if (installed.length) throw new PreppedError('Prepped is on this computer but not open. Open the Prepped app, then run npx -y prepped connect again.', null, 'DESKTOP_NOT_RUNNING');
  throw new PreppedError('The Prepped desktop app has not run on this computer. Install and open it, then run npx -y prepped connect again; or connect to Prepped on the web with --url <its address>.', null, 'DESKTOP_MISSING');
}

/** Opens the page where the person allows the request; the address is in the notes too, for a computer with no browser. */
function openPage(address: string, note: Notes) {
  const [command, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', address]] : process.platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]];
  const child = spawn(command, args as string[], { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => note(`Could not open a browser here; open ${address} yourself.`));
  child.unref();
}

/** The person's answer within `waitMs`: the key, or null while the request still waits. */
async function waitForAnswer(url: string, pending: Pending, userAgent: string, waitMs: number): Promise<string | null> {
  const until = Math.min(Date.now() + waitMs, Date.parse(pending.expiresAt) + POLL_MS);
  for (;;) {
    const { status, data } = await unsigned<{ status: string; token?: string }>(url, 'GET', `/api/agent/pair/${pending.id}`, userAgent);
    if (status === 404) throw new PreppedError('The request ended before it was allowed (a request lasts ten minutes). Run npx -y prepped connect again.', null, 'AGENT_PAIR_ENDED');
    if (data.status === 'approved') return z.string().regex(AGENT_TOKEN_PATTERN).parse(data.token);
    if (data.status === 'denied') throw new PreppedError('The request was declined in Prepped.', null, 'AGENT_PAIR_DENIED');
    if (Date.now() + POLL_MS > until) return null;
    await sleep(POLL_MS);
  }
}

const sameService = (a: Saved, b: Target) => a.url ? a.url.replace(/\/+$/, '') === b.url : a.desktop?.dataDir === b.desktop;

/** Ends a connection's key at its service; a key that no longer works is already ended. */
async function revoke(target: Target, userAgent: string): Promise<boolean> {
  const client = new Client(target);
  client.userAgent = userAgent;
  try { await client.request('DELETE', '/api/agent/me'); return true; }
  catch (error) { if (error instanceof PreppedError && error.status === 401) return false; throw error; }
}

/** How a tool starts the MCP server for a connection, and how the common tools add it. The connection is an argument,
 * which every tool passes (some do not pass their settings' environment variables). */
export function mcpServerFor(name: string) {
  const windows = process.platform === 'win32';
  const server = { command: windows ? 'cmd' : 'npx', args: [...(windows ? ['/c', 'npx'] : []), '-y', 'prepped', 'mcp', '--connection', name] };
  const line = [server.command, ...server.args].join(' ');
  const home = os.homedir();
  return {
    mcpServer: { name: 'prepped', ...server },
    next: [
      'Add this MCP server to your own MCP settings, named prepped, for every project (user level), replacing an earlier prepped entry. Then tell the person to restart you, or to start a new session, so the Prepped tools appear.',
      `Claude Code: claude mcp add --scope user prepped -- ${line}`,
      `Codex: codex mcp add prepped -- ${line}`,
      `Cursor: under "mcpServers" in ${path.join(home, '.cursor', 'mcp.json')}.`,
      `Antigravity: under "mcpServers" in ${path.join(home, '.gemini', 'config', 'mcp_config.json')} (earlier versions: ${path.join(home, '.gemini', 'antigravity', 'mcp_config.json')}).`,
      'Any other tool: its MCP settings, with this command and these arguments.',
    ],
  };
}

export async function connect(args: string[], userAgent: string, note: Notes) {
  const { values } = parseArgs({ args, options: { name: { type: 'string' }, url: { type: 'string' }, paid: { type: 'boolean' }, 'data-dir': { type: 'string' },
    'no-open': { type: 'boolean' }, wait: { type: 'string' } }, strict: true });
  if (values.name !== undefined && (!values.name.trim() || values.name.trim().length > 80)) throw new PreppedError('Give --name with your own name as a tool (at most 80 characters), such as --name "Gemini CLI".', null, 'INVALID_INPUT');
  if (values.url && values['data-dir']) throw new PreppedError('Give --url (Prepped on the web) or --data-dir (a desktop app\'s data folder), not both.', null, 'INVALID_INPUT');
  const waitS = values.wait === undefined ? DEFAULT_WAIT_S : Number(values.wait);
  if (!Number.isInteger(waitS) || waitS < 1 || waitS > 600) throw new PreppedError('--wait takes whole seconds from 1 to 600.', null, 'INVALID_INPUT');
  // The tool that runs this command; a name the agent gives wins, and its tool comes from that name when it is one
  // Prepped knows.
  const detected = await detectClient();
  const toolName = values.name?.trim() ?? detected.name ?? GENERIC_AGENT_NAME;
  const client = (values.name ? identityByName(values.name) : null) ?? detected.client;
  const name = values.name ? connectionName(values.name) : detected.client ? detected.client.id
    : detected.name ? connectionName(detected.name) : `agent-${randomBytes(3).toString('hex')}`;
  const service = values.url ? { url: z.string().url().parse(values.url).replace(/\/+$/, ''), desktop: null } : await runningDesktop(values['data-dir']);

  // A request of this connection still waiting at the same service is continued; otherwise a new one.
  const earlierRequest = await readPending(name);
  let pending = earlierRequest && earlierRequest.url === service.url && earlierRequest.desktop === service.desktop && Date.parse(earlierRequest.expiresAt) > Date.now() ? earlierRequest : null;
  if (pending) note(`Still waiting for the person to allow "${toolName}" in Prepped (code ${pending.code}).`);
  else {
    const { data: asked } = await unsigned<{ id: string; code: string; expiresAt: string; approveUrl: string | null }>(service.url, 'POST', '/api/agent/pair', userAgent,
      { name: toolName, paid: Boolean(values.paid), client: client?.id ?? null });
    if (!service.desktop && !asked.approveUrl) throw new PreppedError(`${service.url} is a Prepped desktop app's local address. Run npx -y prepped connect without --url on that computer.`, null, 'INVALID_INPUT');
    pending = { id: asked.id, code: asked.code, url: service.url, desktop: service.desktop, expiresAt: asked.expiresAt, approveUrl: asked.approveUrl };
    await savePending(name, pending);
    if (service.desktop) note(`Prepped is showing a request from "${toolName}" with the code ${asked.code}. Allow it there.`);
    else {
      note(`Open ${asked.approveUrl}, signed in to Prepped, and allow "${toolName}" (code ${asked.code}).`);
      if (!values['no-open']) openPage(asked.approveUrl!, note);
    }
  }
  let token: string | null;
  try { token = await waitForAnswer(service.url, pending, userAgent, waitS * 1000); }
  catch (error) { await forgetPending(name); throw error; }
  if (!token) {
    const minutes = Math.max(1, Math.round((Date.parse(pending.expiresAt) - Date.now()) / 60_000));
    return { status: 'waiting', connection: name, tool: toolName, code: pending.code, approveUrl: pending.approveUrl, expiresAt: pending.expiresAt,
      next: [`Tell the person to allow "${toolName}" in Prepped (code ${pending.code})${pending.approveUrl ? ` at ${pending.approveUrl}` : ''}, then run this same command again within ${minutes} minutes: it continues this request.`] };
  }
  await forgetPending(name);
  const target: Target = { token, ...service };
  const api = new Client(target);
  api.userAgent = userAgent;
  const me = await api.request<{ user: unknown; token: { scopes: string[] }; service: unknown }>('GET', '/api/agent/me');
  // A connection under the same name is this tool connecting again: its earlier key ends.
  const earlier = await readConnection(name);
  const replaced = earlier && earlier.token !== token && sameService(earlier, target) ? await revoke({ ...target, token: earlier.token }, userAgent) : false;
  const saved = await saveConnection(name, service.desktop ? { token, desktop: { dataDir: service.desktop } } : { token, url: service.url });
  return { status: 'connected', connected: { user: me.user, permissions: me.token.scopes, service: me.service }, connection: name, tool: toolName, client: client?.id ?? null,
    saved, replacedEarlierKey: replaced, ...mcpServerFor(name) };
}

export async function disconnect(args: string[], userAgent: string) {
  const { values } = parseArgs({ args, options: { name: { type: 'string' } }, strict: true });
  if (!values.name) throw new PreppedError('Give --name with the tool\'s name or its connection name, as prepped connect printed it.', null, 'INVALID_INPUT');
  const name = identityByName(values.name)?.id ?? connectionName(values.name);
  const saved = await readConnection(name);
  if (!saved) throw new PreppedError(`No connection named ${name} on this computer (${connectionPath(name)}).`, null, 'NOT_FOUND');
  const target: Target = saved.url ? { token: saved.token, url: saved.url.replace(/\/+$/, ''), desktop: null }
    : { token: saved.token, url: (await desktopUrl(saved.desktop!.dataDir)) ?? '', desktop: saved.desktop!.dataDir };
  if (!target.url) throw new PreppedError(`The Prepped desktop app of this connection has not run (${saved.desktop!.dataDir}).`, null, 'DESKTOP_MISSING');
  const ended = await revoke(target, userAgent);
  await forgetConnection(name);
  return { disconnected: name, keyEnded: ended, removed: !existsSync(connectionPath(name)), note: 'Remove prepped from the tool\'s MCP settings too.' };
}
