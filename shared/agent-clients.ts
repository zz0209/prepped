// The AI coding tools Prepped knows by name and mark (assets/agent-icons/SOURCES.md). `prepped connect` recognises the
// tool that runs it by an environment variable the tool sets, or by the tool's program among the command's parent
// processes (agent/src/detect-client.ts); the service recognises the MCP client that starts the server by the name it
// gives in MCP's initialize, which the server sends in its User-Agent (server/agent-tokens.ts). A connection keeps the
// tool's id, and the pages show its name and mark (src/AgentLogo.tsx).

export type AgentClient = {
  id: string;
  name: string;
  /** Its mark in assets/agent-icons, without .svg; null draws a generic mark. */
  icon: string | null;
  /** Program names, lower case without .exe or .app: the program's own name or a folder of its installation. */
  programs: readonly string[];
  /** A command line of the tool's own (a Node.js tool runs as node). */
  commandLine?: RegExp;
  /** An environment variable the tool sets for the commands it runs. */
  env?: readonly string[];
  /** The MCP client's name in its initialize request. */
  mcp: RegExp;
  /** The tool's MCP settings files (JSON), from the home folder, in which the desktop app finds the Prepped connection
   * the tool starts (desktop/agent-tools.cjs heldKeys). */
  settings?: readonly string[];
};

/** The name `prepped connect` gives a connection when it cannot tell the tool that runs it (and, before 0.28.10, gave every
 * connection made without --name). Such a connection takes its tool's name once Prepped knows the tool. */
export const GENERIC_AGENT_NAME = 'AI agent';

export const AGENT_CLIENTS: readonly AgentClient[] = [
  { id: 'claude-code', name: 'Claude Code', icon: 'claudecode-color', programs: ['claude'], env: ['CLAUDECODE'], mcp: /^claude[- ]code/i, settings: ['.claude.json'] },
  // The Codex CLI, the Codex app, and Codex in the ChatGPT app on macOS (its codex inside ChatGPT.app).
  { id: 'codex', name: 'Codex', icon: 'codex-color', programs: ['codex', 'chatgpt'], mcp: /codex/i },
  { id: 'cursor', name: 'Cursor', icon: 'cursor', programs: ['cursor'], mcp: /cursor/i, settings: ['.cursor/mcp.json'] },
  // Antigravity's MCP settings: ~/.gemini/config/mcp_config.json, earlier ~/.gemini/antigravity/mcp_config.json.
  { id: 'antigravity', name: 'Antigravity', icon: 'antigravity-color', programs: ['antigravity'], mcp: /antigravity/i, settings: ['.gemini/config/mcp_config.json', '.gemini/antigravity/mcp_config.json'] },
  { id: 'deepseek-harness', name: 'DeepSeek Harness', icon: 'deepseek-color', programs: ['deepseek harness'], mcp: /deepseek/i },
  { id: 'gemini-cli', name: 'Gemini CLI', icon: 'geminicli-color', programs: ['gemini'], commandLine: /@google[\\/]gemini-cli|[\\/]gemini(\.js)?(\s|$)/i, env: ['GEMINI_CLI'], mcp: /gemini/i },
  { id: 'windsurf', name: 'Windsurf', icon: 'windsurf', programs: ['windsurf'], mcp: /windsurf/i },
  { id: 'kiro', name: 'Kiro', icon: 'kiro-color', programs: ['kiro'], mcp: /kiro/i },
  { id: 'trae', name: 'Trae', icon: 'trae-color', programs: ['trae', 'trae cn'], mcp: /trae/i },
  { id: 'qoder', name: 'Qoder', icon: 'qoder-color', programs: ['qoder'], mcp: /qoder/i },
  { id: 'codebuddy', name: 'CodeBuddy', icon: 'codebuddy-color', programs: ['codebuddy', 'codebuddy cn'], mcp: /codebuddy/i },
  { id: 'github-copilot', name: 'GitHub Copilot', icon: 'githubcopilot', programs: ['copilot'], commandLine: /@github[\\/]copilot/i, mcp: /copilot/i },
  { id: 'cline', name: 'Cline', icon: 'cline', programs: ['cline'], mcp: /cline/i },
  { id: 'roo-code', name: 'Roo Code', icon: 'roocode', programs: [], mcp: /^roo/i },
  { id: 'kilo-code', name: 'Kilo Code', icon: 'kilocode', programs: [], mcp: /kilo/i },
  { id: 'opencode', name: 'OpenCode', icon: 'opencode', programs: ['opencode'], commandLine: /opencode-ai|[\\/]opencode(\.js)?(\s|$)/i, mcp: /opencode/i },
  { id: 'kimi', name: 'Kimi CLI', icon: 'kimi-color', programs: ['kimi'], mcp: /kimi/i },
  { id: 'qwen-code', name: 'Qwen Code', icon: 'qwen-color', programs: ['qwen'], commandLine: /@qwen-code[\\/]qwen-code/i, mcp: /qwen/i },
  { id: 'amp', name: 'Amp', icon: 'amp-color', programs: ['amp'], commandLine: /@sourcegraph[\\/]amp/i, mcp: /^amp/i },
  { id: 'goose', name: 'Goose', icon: 'goose', programs: ['goose'], mcp: /goose/i },
  { id: 'junie', name: 'Junie', icon: 'junie-color', programs: [], mcp: /junie/i },
  // VS Code's own agent (and any extension that does not name itself) gives the editor's name.
  { id: 'vscode', name: 'VS Code', icon: null, programs: ['code', 'code - insiders', 'visual studio code', 'visual studio code - insiders'], mcp: /visual studio code|^vscode/i },
];

export const AGENT_CLIENT_IDS = AGENT_CLIENTS.map(client => client.id) as [string, ...string[]];
export const agentClient = (id: string | null | undefined) => id ? AGENT_CLIENTS.find(client => client.id === id) ?? null : null;

/** The tool a connection's name names, as a person or a tool wrote it ("claude code", "Antigravity"). */
export function agentClientByName(name: string): AgentClient | null {
  const plain = name.trim().toLowerCase();
  return AGENT_CLIENTS.find(client => client.name.toLowerCase() === plain || client.id === plain) ?? null;
}

/** The MCP client in the server's User-Agent, "prepped-mcp/0.28.10 (claude-code 2.1.309)": its name and the tool. */
export function agentClientOfUserAgent(userAgent: string | null | undefined): AgentClient | null {
  const peer = /^prepped-mcp\/\S+ \((.+?)(?: \S+)?\)$/.exec(userAgent ?? '')?.[1];
  return peer ? AGENT_CLIENTS.find(client => client.mcp.test(peer)) ?? null : null;
}
