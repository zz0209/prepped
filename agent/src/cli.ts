import { copyFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { camelCase, kebabCase } from 'change-case';
import { z } from 'zod';
import { version } from '../package.json';
import { Client, PreppedError } from './client.js';
import { configPath, desktopDataDirs, desktopUrl, forget, resolveTarget, save, type Target } from './config.js';
import { OPERATIONS, type Context, type Operation } from './operations.js';
import { connect, disconnect } from './connect.js';
import { AGENT_TOKEN_PATTERN } from '../../shared/agent-access.js';

// The `prepped` command: every operation of src/operations.ts as `prepped <area> <action>`, plus connect, disconnect,
// login, logout, mcp and skill. Output is JSON on standard output; a failure is JSON on standard error with exit code 1,
// and connect's progress is plain lines on standard error.

export const SKILL_FILE = fileURLToPath(new URL('../skills/prepped/SKILL.md', import.meta.url));
export const AGENTS_SNIPPET_FILE = fileURLToPath(new URL('../skills/prepped/agents-md-snippet.md', import.meta.url));

export type Output = { out: (text: string) => void; err: (text: string) => void };

/** The context every operation runs with: the service from the saved sign-in or the environment, read for each run. */
export function cliContext(userAgent: string): Context {
  return {
    client: async () => { const client = new Client(await resolveTarget()); client.userAgent = userAgent; return client; },
    cwd: process.cwd(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, now: () => new Date(),
  };
}

/** What a failure says, for standard error and for an MCP tool's error. */
export function failure(error: unknown) {
  if (error instanceof z.ZodError) return { error: z.prettifyError(error), code: 'INVALID_INPUT', status: null };
  if (error instanceof PreppedError) return { error: error.message, code: error.code, status: error.status };
  return { error: (error as Error).message ?? String(error), code: null, status: null };
}

// An input field, under its wrappers (optional, nullable): its kind decides how the command line reads it.
function base(schema: z.ZodType): { kind: string; schema: z.ZodType; nullable: boolean } {
  let current = schema as any;
  let nullable = false;
  while (['optional', 'nullable', 'default'].includes(current.def.type)) { if (current.def.type === 'nullable') nullable = true; current = current.def.innerType; }
  return { kind: current.def.type, schema: current, nullable };
}
function described(schema: z.ZodType): string {
  for (let current = schema as any; current; current = current.def?.innerType) if (current.description) return current.description;
  return '';
}
const commandOf = (operation: Operation) => operation.name.split('_');
const flagOf = (field: string) => kebabCase(field);

// A JSON value given on the command line, or @file for one in a file.
async function jsonValue(text: string, flag: string): Promise<unknown> {
  const source = text.startsWith('@') ? await readFile(path.resolve(text.slice(1)), 'utf8') : text;
  try { return JSON.parse(source); } catch { throw new PreppedError(`--${flag} takes JSON (or @file.json): ${source.slice(0, 80)}`); }
}

/** The operation's input from its flags, its first plain argument and --input. */
async function inputOf(operation: Operation, args: string[]): Promise<Record<string, unknown>> {
  const shape = operation.input.shape as Record<string, z.ZodType>;
  const options: ParseArgsConfig['options'] = { input: { type: 'string' } };
  for (const [field, schema] of Object.entries(shape)) {
    const { kind } = base(schema);
    options[flagOf(field)] = kind === 'boolean' ? { type: 'boolean' } : kind === 'array' ? { type: 'string', multiple: true } : { type: 'string' };
  }
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true, strict: true });
  const input: Record<string, unknown> = values.input ? await jsonValue(values.input as string, 'input') as Record<string, unknown> : {};
  if (positionals.length > 1 || (positionals.length && !operation.positional)) throw new PreppedError(`Unexpected argument: ${positionals.join(' ')}. Run with --help.`);
  if (positionals[0] && operation.positional) input[operation.positional] = positionals[0];
  for (const [flag, value] of Object.entries(values)) {
    if (flag === 'input' || value === undefined) continue;
    const field = camelCase(flag);
    const { kind, schema, nullable } = base(shape[field]!);
    if (nullable && value === 'null') { input[field] = null; continue; }
    if (kind === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(value as string)) throw new PreppedError(`--${flag} takes a number, not "${value}".`);
      input[field] = Number(value);
    } else if (kind === 'record' || kind === 'object') input[field] = await jsonValue(value as string, flag);
    else if (kind === 'array' && base((schema as any).def.element).kind === 'record') input[field] = await Promise.all((value as string[]).map(item => jsonValue(item, flag)));
    else input[field] = value;
  }
  return input;
}

function operationHelp(operation: Operation): string {
  const shape = operation.input.shape as Record<string, z.ZodType>;
  const required = new Set(Object.entries(shape).filter(([, schema]) => !schema.safeParse(undefined).success).map(([field]) => field));
  const lines = [`prepped ${commandOf(operation).join(' ')}${operation.positional ? ` <${operation.positional}>` : ''} [options]`, '', `${operation.title}. ${operation.description}`];
  if (operation.effect === 'paid') lines.push('', 'Spends the account\'s credits: needs a token with the paid permission.');
  if (operation.effect === 'delete') lines.push('', 'Deletes: cannot be undone.');
  lines.push('', 'Options:');
  for (const [field, schema] of Object.entries(shape)) {
    const { kind, schema: inner } = base(schema);
    const values = kind === 'enum' ? ` (${(inner as any).options.join(' | ')})` : kind === 'number' ? ' <number>' : kind === 'boolean' ? '' : kind === 'array' ? ' <value> (repeat for more)' : kind === 'record' ? ' <JSON or @file.json>' : ' <text>';
    lines.push(`  --${flagOf(field)}${values}${required.has(field) ? '  [required]' : ''}`, ...(described(schema) ? [`      ${described(schema)}`] : []));
  }
  lines.push('  --input <JSON or @file.json>', '      All of the input as one JSON object (flags given too take precedence)', '', 'Prints JSON. Exit code 1 with {"error":…} on standard error when it fails.');
  return lines.join('\n');
}

function generalHelp(): string {
  return [
    `prepped ${version}: use Prepped from Claude Code, Codex, Cursor, Antigravity and other coding agents.`, '',
    'Connect an agent (the person allows it in Prepped; the agent then adds the MCP server it prints to its own settings):',
    '  prepped connect                                   the Prepped desktop app on this computer; the tool that runs it names it',
    '  prepped connect --url <web address>               Prepped on the web',
    '      --name "<your name as a tool>" names it yourself; --paid also asks to start paid work, such as preparing a meeting;',
    '      --no-open prints the web page instead of opening it; --wait <seconds> (100) ends the wait, and the same command',
    '      run again continues the request',
    '  prepped disconnect --name "<…>"                   end that connection and its key', '',
    'Or sign in with an access key from Prepped (Settings › Connections):',
    '  prepped login --desktop --token <token>             the Prepped desktop app on this computer',
    '  prepped login --url <web address> --token <token>   Prepped on the web', '',
    'Commands:',
    ...OPERATIONS.map(operation => `  prepped ${commandOf(operation).join(' ').padEnd(30)}${operation.title}${operation.effect === 'paid' ? ' (paid)' : ''}`),
    '', '  prepped login | logout                Sign in or forget the sign-in on this computer',
    '  prepped mcp [--connection <name>]     Run the MCP server (standard input and output)',
    '  prepped skill install [--dir <dir>]   Install the Claude Code skill (default ~/.claude/skills/prepped)',
    '  prepped skill print | agents-md       Print the skill, or a section for AGENTS.md', '',
    'Run prepped <command> --help for its options. Output is JSON.',
  ].join('\n');
}

async function readToken(given: string): Promise<string> {
  if (given !== '-') return given.trim();
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function login(args: string[], userAgent: string) {
  const { values } = parseArgs({ args, options: { token: { type: 'string' }, url: { type: 'string' }, desktop: { type: 'boolean' }, 'data-dir': { type: 'string' } }, strict: true });
  if (!values.token) throw new PreppedError('Give --token with an access key from Prepped (Settings › Connections), or --token - to read it from standard input.');
  const token = await readToken(values.token);
  if (!AGENT_TOKEN_PATTERN.test(token)) throw new PreppedError('That is not a Prepped access key: it starts with prepped_ and has 51 characters.');
  if (Boolean(values.url) === Boolean(values.desktop)) throw new PreppedError('Give --desktop (the Prepped desktop app on this computer) or --url (Prepped on the web), with the access key made there.');
  const check = async (target: Target) => { const client = new Client(target); client.userAgent = userAgent; return client.request('GET', '/api/agent/me'); };
  if (values.url) {
    const url = z.string().url().parse(values.url).replace(/\/+$/, '');
    const me = await check({ token, url, desktop: null });
    return { signedIn: me.user, token: me.token, service: me.service, saved: await save({ token, url }) };
  }
  const dirs = values['data-dir'] ? [path.resolve(values['data-dir'])] : desktopDataDirs();
  const tried: string[] = [];
  for (const dataDir of dirs) {
    const url = await desktopUrl(dataDir);
    if (!url) { tried.push(`${dataDir}: Prepped has not run here`); continue; }
    try {
      const me = await check({ token, url, desktop: dataDir });
      return { signedIn: me.user, token: me.token, service: me.service, saved: await save({ token, desktop: { dataDir } }) };
    } catch (error) {
      tried.push(`${dataDir}: ${(error as Error).message}`);
    }
  }
  throw new PreppedError(`No Prepped desktop app on this computer took this access key. Open Prepped, and use a key made in its Settings.\n${tried.join('\n')}`);
}

async function skill(args: string[], output: Output) {
  const { values, positionals } = parseArgs({ args, options: { dir: { type: 'string' } }, allowPositionals: true, strict: true });
  const action = positionals[0];
  if (action === 'print') { output.out(await readFile(SKILL_FILE, 'utf8')); return null; }
  if (action === 'agents-md') { output.out(await readFile(AGENTS_SNIPPET_FILE, 'utf8')); return null; }
  if (action !== 'install') throw new PreppedError('Use prepped skill install [--dir <folder>], prepped skill print or prepped skill agents-md.');
  const dir = values.dir ? path.resolve(values.dir) : path.join(os.homedir(), '.claude', 'skills', 'prepped');
  await mkdir(dir, { recursive: true });
  await copyFile(SKILL_FILE, path.join(dir, 'SKILL.md'));
  return { installed: path.join(dir, 'SKILL.md') };
}

/** Runs one command line; returns the exit code. */
export async function runCli(argv: string[], output: Output): Promise<number> {
  const userAgent = `prepped-cli/${version}`;
  const print = (value: unknown) => { if (value !== null) output.out(JSON.stringify(value, null, 2)); };
  try {
    const [first, second] = argv;
    if (!first || first === '--help' || first === '-h' || first === 'help') { output.out(generalHelp()); return 0; }
    if (first === '--version' || first === 'version') { output.out(version); return 0; }
    if ((first === 'connect' || first === 'disconnect') && (argv.includes('--help') || argv.includes('-h'))) { output.out(generalHelp()); return 0; }
    if (first === 'connect') { print(await connect(argv.slice(1), userAgent, line => output.err(line))); return 0; }
    if (first === 'disconnect') { print(await disconnect(argv.slice(1), userAgent)); return 0; }
    if (first === 'login') { print(await login(argv.slice(1), userAgent)); return 0; }
    if (first === 'logout') { print({ signedOut: await forget(), file: configPath(), note: 'The access key still works until you disconnect it in Prepped: Settings › Connections.' }); return 0; }
    if (first === 'skill') { print(await skill(argv.slice(1), output)); return 0; }
    const operation = OPERATIONS.find(item => item.name === first || (item.name === `${first}_${second}`));
    if (!operation) throw new PreppedError(`Unknown command: ${[first, second].filter(Boolean).join(' ')}. Run prepped --help.`);
    const rest = argv.slice(commandOf(operation).length);
    if (rest.includes('--help') || rest.includes('-h')) { output.out(operationHelp(operation)); return 0; }
    print(await operation.run(cliContext(userAgent), operation.input.parse(await inputOf(operation, rest))));
    return 0;
  } catch (error) {
    output.err(JSON.stringify(failure(error), null, 2));
    return 1;
  }
}
