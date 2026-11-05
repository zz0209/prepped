import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { AGENT_TOKEN_PATTERN } from '../../shared/agent-access.js';

// Where the command line keeps its sign-in, and how it finds the Prepped service: the hosted service at an address, or
// the desktop app's local service on this computer, whose port the app writes to local-service.json in its data folder
// (desktop/main.cjs SERVICE_PORT_FILE).

const tokenSchema = z.string().regex(AGENT_TOKEN_PATTERN, 'A Prepped access key starts with prepped_ and has 51 characters. Get one by connecting a tool in Prepped: Settings › Connections.');
const savedSchema = z.object({
  token: tokenSchema,
  url: z.string().url().optional(),
  desktop: z.object({ dataDir: z.string().min(1) }).strict().optional(),
}).strict().refine(saved => Boolean(saved.url) !== Boolean(saved.desktop), 'The saved sign-in names either an address or the desktop app.');
export type Saved = z.infer<typeof savedSchema>;
export type Target = { token: string; url: string; desktop: string | null };

/** The settings file: PREPPED_CONFIG, or prepped/config.json in the user's settings folder. */
export function configPath(): string {
  if (process.env.PREPPED_CONFIG) return path.resolve(process.env.PREPPED_CONFIG);
  const base = process.platform === 'win32' ? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming') : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(base, 'prepped', 'config.json');
}

async function readFrom(file: string): Promise<Saved | null> {
  if (!existsSync(file)) return null;
  return savedSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

/** A sign-in, readable by this user only (the token is a password for the account). */
async function writeTo(file: string, saved: Saved): Promise<string> {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(savedSchema.parse(saved), null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== 'win32') await chmod(file, 0o600);
  return file;
}

async function remove(file: string): Promise<boolean> {
  if (!existsSync(file)) return false;
  await rm(file);
  return true;
}

export const readSaved = () => readFrom(configPath());
export const save = (saved: Saved) => writeTo(configPath(), saved);
export const forget = () => remove(configPath());

// A tool's own connection, which its MCP settings name with PREPPED_CONNECTION: connections/<name>.json beside the
// settings file. `prepped connect` writes it, and so does the desktop app when it connects Claude Code, Codex or Cursor
// (desktop/agent-tools.cjs), so each tool has its own key and the tool's settings hold no key.
export const CONNECTION_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
export function connectionPath(name: string): string {
  if (!CONNECTION_PATTERN.test(name)) throw new Error(`A connection's name is lowercase letters, digits and dashes (at most 40): "${name}".`);
  return path.join(path.dirname(configPath()), 'connections', `${name}.json`);
}
/**
 * The connection name of a tool's name: "Gemini CLI" is gemini-cli, "Café" cafe. A name with letters outside a–z
 * ("通义灵码", "Kimi 助手") adds part of its SHA-256, so two such tools never share a connection.
 */
export function connectionName(toolName: string): string {
  const plain = toolName.normalize('NFKD').replace(/\p{M}/gu, '');
  const name = plain.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 31).replace(/-+$/, '');
  if (!/[^\x00-\x7F]/.test(plain.replace(/[^\p{L}\p{N}]/gu, '')) && name) return name;
  return `${name || 'agent'}-${createHash('sha256').update(toolName.trim()).digest('hex').slice(0, 8)}`;
}
export const readConnection = (name: string) => readFrom(connectionPath(name));
export const saveConnection = (name: string, saved: Saved) => writeTo(connectionPath(name), saved);
export const forgetConnection = (name: string) => remove(connectionPath(name));

// A request to connect that is still waiting for the person (prepped connect ends its wait before a tool's command time
// limit and continues the same request when run again): connections/<name>.pending.json.
const pendingSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string(), url: z.string().url(), desktop: z.string().nullable(),
  expiresAt: z.string(), approveUrl: z.string().url().nullable() }).strict();
export type Pending = z.infer<typeof pendingSchema>;
const pendingPath = (name: string) => connectionPath(name).replace(/\.json$/, '.pending.json');
export async function readPending(name: string): Promise<Pending | null> {
  const file = pendingPath(name);
  return existsSync(file) ? pendingSchema.parse(JSON.parse(await readFile(file, 'utf8'))) : null;
}
export async function savePending(name: string, pending: Pending): Promise<void> {
  const file = pendingPath(name);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(pendingSchema.parse(pending), null, 2)}\n`, { mode: 0o600 });
}
export const forgetPending = (name: string) => remove(pendingPath(name));

/**
 * The desktop app's data folders to look in: PREPPED_DESKTOP_DATA_DIR, otherwise the release's (ai-overlay-online) and a
 * run from source's (ai-overlay) in the system's application data folder.
 */
export function desktopDataDirs(): string[] {
  if (process.env.PREPPED_DESKTOP_DATA_DIR) return [path.resolve(process.env.PREPPED_DESKTOP_DATA_DIR)];
  const appData = process.platform === 'win32' ? process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return ['ai-overlay-online', 'ai-overlay'].map(name => path.join(appData, name));
}

/** The address of the desktop app's local service whose data folder is `dataDir`, or null when it has never run. */
export async function desktopUrl(dataDir: string): Promise<string | null> {
  const file = path.join(dataDir, 'local-service.json');
  if (!existsSync(file)) return null;
  const { port } = z.object({ port: z.number().int().min(1024).max(65535) }).strict().parse(JSON.parse(await readFile(file, 'utf8')));
  return `http://127.0.0.1:${port}`;
}

/**
 * The service and key to use: the connection PREPPED_CONNECTION names (prepped connect, or the desktop app's Connect);
 * PREPPED_TOKEN with PREPPED_URL or PREPPED_DESKTOP=1 (from the tool's MCP settings, as the web version's Settings ›
 * Connections writes them; the desktop app whose service takes the key, PREPPED_DESKTOP_DATA_DIR to name one);
 * otherwise what `prepped login` saved.
 */
export async function resolveTarget(): Promise<Target> {
  if (process.env.PREPPED_CONNECTION) {
    const name = process.env.PREPPED_CONNECTION.trim();
    const connection = await readConnection(name);
    if (!connection) throw new Error(`This tool's connection to Prepped (${connectionPath(name)}) is gone. Connect it again: in Prepped, Settings › Connections, or run npx -y prepped connect.`);
    if (connection.url) return { token: connection.token, url: connection.url.replace(/\/+$/, ''), desktop: null };
    return desktopTarget(connection.token, connection.desktop!.dataDir);
  }
  if (process.env.PREPPED_TOKEN) {
    const token = tokenSchema.parse(process.env.PREPPED_TOKEN.trim());
    if (process.env.PREPPED_URL) return { token, url: z.string().url().parse(process.env.PREPPED_URL).replace(/\/+$/, ''), desktop: null };
    if (process.env.PREPPED_DESKTOP === '1') return desktopTarget(token, await desktopFor(token));
    throw new Error('PREPPED_TOKEN is set without PREPPED_URL (the Prepped web address) or PREPPED_DESKTOP=1 (the Prepped desktop app on this computer).');
  }
  const saved = await readSaved();
  if (!saved) throw new Error('Not connected to Prepped. Run npx -y prepped connect --name "<your name as a tool>" and the person allows it in Prepped; or, in Prepped, open Settings › Connections and connect the tool there.');
  if (saved.url) return { token: saved.token, url: saved.url.replace(/\/+$/, ''), desktop: null };
  return desktopTarget(saved.token, saved.desktop!.dataDir);
}

// The desktop app whose local service takes the key, found once per process: on a computer with both the release and a
// run from source, the one the key was made in.
let foundDesktop: { key: string; dataDir: string } | null = null;
async function desktopFor(token: string): Promise<string> {
  const dirs = desktopDataDirs();
  const key = [token, ...dirs].join('\n');
  if (foundDesktop?.key === key) return foundDesktop.dataDir;
  const running: string[] = [];
  for (const dir of dirs) if (await desktopUrl(dir)) running.push(dir);
  let chosen = running[0] ?? dirs[0]!;
  if (running.length > 1) {
    for (const dir of running) {
      const response = await fetch(`${await desktopUrl(dir)}/api/agent/me`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (response?.ok) { chosen = dir; break; }
    }
  }
  foundDesktop = { key, dataDir: chosen };
  return chosen;
}

// How the desktop app starts itself hidden, as it writes it at each start (desktop/main.cjs LAUNCH_FILE).
const launchSchema = z.object({ command: z.string().min(1), args: z.array(z.string()), env: z.record(z.string(), z.string()) }).strict();
const STARTUP_MS = 60_000;

/**
 * Starts the desktop app of `dataDir` when it is closed, as it starts at login (only its tray or menu bar icon appears),
 * and waits until its local service answers: its address then, or null for an earlier version of the app, which does not
 * say how it starts.
 */
export async function startDesktop(dataDir: string): Promise<string | null> {
  const file = path.join(dataDir, 'launch.json');
  if (!existsSync(file)) return null;
  const { command, args, env } = launchSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  // The app starts as itself, not as Node.js: a tool that runs this command with Electron's runtime sets ELECTRON_RUN_AS_NODE.
  const childEnv = { ...process.env, ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  // No windowsHide: on Windows it would hide the first window the app shows later, such as a connection request.
  const child = spawn(command, args, { detached: true, stdio: 'ignore', env: childEnv });
  const failed = new Promise<never>((_resolve, reject) => child.once('error', error => reject(new Error(`Could not start Prepped (${command}): ${error.message}`))));
  child.unref();
  const until = Date.now() + STARTUP_MS;
  const answered = (async () => {
    while (Date.now() < until) {
      await sleep(500);
      const url = await desktopUrl(dataDir);
      if (url && (await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) }).catch(() => null))?.ok) return url;
    }
    throw new Error(`Prepped did not start within ${STARTUP_MS / 1000} seconds. Open Prepped and try again.`);
  })();
  return Promise.race([answered, failed]);
}

async function desktopTarget(token: string, dataDir: string): Promise<Target> {
  const url = await desktopUrl(dataDir);
  if (!url) throw new Error(`The Prepped desktop app has not run on this computer yet (no ${path.join(dataDir, 'local-service.json')}). Open Prepped and try again.`);
  return { token, url, desktop: dataDir };
}
