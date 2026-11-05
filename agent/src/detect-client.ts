import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { AGENT_CLIENTS, type AgentClient } from '../../shared/agent-clients.js';

// Which AI tool runs `prepped connect`, so its connection carries the tool's name and mark without the agent naming
// itself: an environment variable the tool sets (Claude Code's CLAUDECODE, Gemini CLI's GEMINI_CLI), or the nearest of
// the command's parent processes that is more than a carrier (Antigravity's language server in Antigravity's folder,
// codex.exe, DeepSeek Harness.exe). A tool Prepped does not know is named by its program; shells, terminals, Node.js and
// package runners in between are passed over.

const run = promisify(execFile);
export type ProcessInfo = { pid: number; parent: number; path: string; commandLine: string };

// Programs that only carry the command: shells, terminals, runtimes, package runners and the system's own.
const CARRIERS = new Set(['node', 'npm', 'npx', 'pnpm', 'pnpx', 'yarn', 'bun', 'bunx', 'deno', 'tsx', 'uv', 'uvx', 'python', 'python3', 'cmd', 'powershell', 'pwsh',
  'conhost', 'openconsole', 'windowsterminal', 'wt', 'winpty-agent', 'bash', 'sh', 'zsh', 'fish', 'dash', 'login', 'sshd', 'sshd-session', 'ssh', 'sudo', 'env',
  'tmux', 'screen', 'mintty', 'git-bash', 'terminal', 'iterm', 'iterm2', 'warp', 'warp-terminal', 'ghostty', 'alacritty', 'kitty', 'wezterm', 'wezterm-gui',
  'hyper', 'tabby', 'gnome-terminal-server', 'konsole', 'xterm', 'launchd', 'init', 'systemd', 'explorer', 'svchost', 'services', 'wininit', 'winlogon',
  'runtimebroker', 'sihost', 'userinit', 'timeout', 'nohup', 'xargs', 'time', 'kernel_task', 'language_server', 'electron']);

/** A program's name: an app bundle's name on macOS (the outermost .app), otherwise the file's name without .exe (and
 * without the dash of a login shell). */
export function programName(file: string): string {
  const parts = file.split(/[\\/]/).filter(Boolean);
  const bundle = parts.find(part => part.toLowerCase().endsWith('.app'));
  return (bundle ? bundle.slice(0, -4) : path.basename(parts.at(-1) ?? '').replace(/\.exe$/i, '').replace(/^-/, '')).trim();
}

/** A known tool by a process's program, its command line, or a folder of its installation ("code" and "claude" are too
 * common as folder names to count). */
function knownClient(process: ProcessInfo, program: string): AgentClient | null {
  const folders = process.path.toLowerCase().split(/[\\/]/);
  return AGENT_CLIENTS.find(item => item.programs.includes(program) || (item.commandLine?.test(process.commandLine) ?? false)
    || item.programs.some(name => name !== 'code' && name !== 'claude' && folders.includes(name))) ?? null;
}

/** The tool among a chain of processes, nearest first: the first that is a known tool or more than a carrier. */
export function clientOfChain(chain: readonly ProcessInfo[]): { client: AgentClient | null; name: string | null } {
  for (const process of chain) {
    if (!process.path) continue;
    const program = programName(process.path);
    const client = knownClient(process, program.toLowerCase());
    if (client) return { client, name: client.name };
    if (!CARRIERS.has(program.toLowerCase())) return { client: null, name: program };
  }
  return { client: null, name: null };
}

const winProcessSchema = z.array(z.object({ ProcessId: z.number(), ParentProcessId: z.number(), ExecutablePath: z.string().nullable(), CommandLine: z.string().nullable() }));

/** Every process of this computer: on Windows from Win32_Process, on macOS and Linux from ps. */
async function processes(): Promise<Map<number, ProcessInfo>> {
  const found = new Map<number, ProcessInfo>();
  if (process.platform === 'win32') {
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress'], { maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    for (const row of winProcessSchema.parse(JSON.parse(stdout))) found.set(row.ProcessId, { pid: row.ProcessId, parent: row.ParentProcessId, path: row.ExecutablePath ?? '', commandLine: row.CommandLine ?? '' });
    return found;
  }
  const [{ stdout: programs }, { stdout: lines }] = await Promise.all([run('ps', ['-A', '-o', 'pid=,ppid=,comm=']), run('ps', ['-A', '-o', 'pid=,args='], { maxBuffer: 64 * 1024 * 1024 })]);
  const args = new Map<number, string>();
  for (const line of lines.split('\n')) { const match = /^\s*(\d+)\s+(.*)$/.exec(line); if (match) args.set(Number(match[1]), match[2]!); }
  for (const line of programs.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (match) found.set(Number(match[1]), { pid: Number(match[1]), parent: Number(match[2]), path: match[3]!.trim(), commandLine: args.get(Number(match[1])) ?? '' });
  }
  return found;
}

/** This process's parents, nearest first, up to the system's own. */
export async function parentChain(): Promise<ProcessInfo[]> {
  const all = await processes();
  const chain: ProcessInfo[] = [];
  const seen = new Set<number>();
  for (let pid = process.ppid; pid > 0 && !seen.has(pid) && all.has(pid); pid = all.get(pid)!.parent) {
    seen.add(pid);
    chain.push(all.get(pid)!);
  }
  return chain;
}

/** The tool running this command: by its environment variable, otherwise by the parent processes. */
export async function detectClient(env: NodeJS.ProcessEnv = process.env): Promise<{ client: AgentClient | null; name: string | null }> {
  const byEnv = AGENT_CLIENTS.find(client => client.env?.some(variable => env[variable]));
  if (byEnv) return { client: byEnv, name: byEnv.name };
  return clientOfChain(await parentChain());
}
