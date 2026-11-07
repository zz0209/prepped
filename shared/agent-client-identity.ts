// The MCP client identifies the program that started it by its name, process or environment.
type IdentityFields = { name: string; programs: readonly string[]; commandLine?: RegExp; env?: readonly string[] };
const definitions = {
  'claude-code': {name: 'Claude Code', programs: ['claude'], env: ['CLAUDECODE']},
  'claude-desktop': {name: 'Claude', programs: ['claude desktop']},
  codex: {name: 'Codex', programs: ['codex', 'chatgpt']},
  cursor: {name: 'Cursor', programs: ['cursor']},
  antigravity: {name: 'Antigravity', programs: ['antigravity']},
  'deepseek-harness': {name: 'DeepSeek Harness', programs: ['deepseek harness']},
  'gemini-cli': {name: 'Gemini CLI', programs: ['gemini'], commandLine: /@google[\\/]gemini-cli|[\\/]gemini(\.js)?(\s|$)/i, env: ['GEMINI_CLI']},
  windsurf: {name: 'Windsurf', programs: ['windsurf']},
  kiro: {name: 'Kiro', programs: ['kiro']},
  'trae-cn': {name: 'Trae CN', programs: ['trae cn']},
  trae: {name: 'Trae', programs: ['trae']},
  qoder: {name: 'Qoder', programs: ['qoder']},
  codebuddy: {name: 'CodeBuddy', programs: ['codebuddy', 'codebuddy cn']},
  'copilot-cli': {name: 'Copilot CLI', programs: [], commandLine: /@github[\\/]copilot/i},
  'github-copilot': {name: 'GitHub Copilot', programs: ['copilot']},
  'visual-studio': {name: 'Visual Studio', programs: ['devenv']},
  cline: {name: 'Cline', programs: ['cline']},
  'roo-code': {name: 'Roo Code', programs: []},
  'kilo-code': {name: 'Kilo Code', programs: []},
  continue: {name: 'Continue', programs: []},
  augment: {name: 'Augment', programs: []},
  cody: {name: 'Cody', programs: []},
  tabnine: {name: 'Tabnine', programs: []},
  qodo: {name: 'Qodo', programs: ['qodo']},
  'amazon-q': {name: 'Amazon Q Developer', programs: ['q']},
  lingma: {name: 'Tongyi Lingma', programs: ['lingma']},
  comate: {name: 'Baidu Comate', programs: []},
  marscode: {name: 'MarsCode', programs: []},
  opencode: {name: 'OpenCode', programs: ['opencode'], commandLine: /opencode-ai|[\\/]opencode(\.js)?(\s|$)/i},
  kimi: {name: 'Kimi CLI', programs: ['kimi']},
  'qwen-code': {name: 'Qwen Code', programs: ['qwen'], commandLine: /@qwen-code[\\/]qwen-code/i},
  iflow: {name: 'iFlow CLI', programs: ['iflow']},
  amp: {name: 'Amp', programs: ['amp'], commandLine: /@sourcegraph[\\/]amp/i},
  goose: {name: 'Goose', programs: ['goose']},
  warp: {name: 'Warp', programs: ['warp']},
  void: {name: 'Void', programs: ['void']},
  pearai: {name: 'PearAI', programs: ['pearai']},
  junie: {name: 'Junie', programs: ['junie']},
  'jetbrains-ai': {name: 'JetBrains AI Assistant', programs: []},
  zed: {name: 'Zed', programs: ['zed']},
  aider: {name: 'Aider', programs: ['aider']},
  'lm-studio': {name: 'LM Studio', programs: ['lm studio']},
  'cherry-studio': {name: 'Cherry Studio', programs: ['cherry studio']},
  raycast: {name: 'Raycast', programs: ['raycast']},
  vscode: {name: 'VS Code', programs: ['code', 'code - insiders', 'visual studio code', 'visual studio code - insiders']},
} satisfies Record<string, IdentityFields>;
export type AgentClientId = keyof typeof definitions;
export type AgentIdentity = IdentityFields & { id: AgentClientId };
export const AGENT_IDENTITIES: readonly AgentIdentity[] = (Object.keys(definitions) as AgentClientId[])
  .map(id => ({ id, ...definitions[id] }));
export const GENERIC_AGENT_NAME = 'AI agent';

export function identityByName(name: string): AgentIdentity | null {
  const plain = name.trim().toLowerCase();
  return AGENT_IDENTITIES.find(client => client.name.toLowerCase() === plain || client.id === plain) ?? null;
}
