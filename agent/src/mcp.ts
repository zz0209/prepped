import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { version } from '../package.json';
import { Client } from './client.js';
import { resolveTarget } from './config.js';
import { failure } from './cli.js';
import { OPERATIONS, type Context } from './operations.js';

// The MCP server (`prepped mcp`): every operation of src/operations.ts as a tool, for Claude Code, Codex, Cursor,
// Antigravity and any other MCP client. It signs in with the connection PREPPED_CONNECTION names (prepped connect, or the
// desktop app's Connect), with PREPPED_TOKEN and PREPPED_URL or PREPPED_DESKTOP=1 from the client's settings, or as
// `prepped login` saved (src/config.ts resolveTarget).

const INSTRUCTIONS = `Prepped prepares people for interviews, meetings, presentations and media interviews, and helps them live. These tools set up the person's Prepped account: meetings, session groups (including weekly or monthly repeating meetings), material, project folders, resumes, the question bank and practice.
- Call whoami first: it says who is signed in, what the token may do (read, write, paid) and this computer's time zone.
- Turn the person's request into a meeting type (types lists every type's setup fields) and fill the fields from what they said and the files they point to. Read those files yourself, then attach the ones that matter with material_add or the files field (PDF, DOCX, TXT, Markdown, CSV, JSON; up to 8 documents for a meeting or a group). Use absolute paths. A folder or repository of code and results goes in whole with projects_add, which Prepped indexes and searches during the meeting; give a large folder's important subfolders as their own projects.
- A repeating meeting is groups_create with repeat, days and time; times are local to timeZone, which defaults to this computer's.
- A talk or a defense is a presentation meeting: put its title, audience, abstract and length in minutes (durationMinutes) in setup; give its slides with talk_slides (.pptx or .pdf) and the person's draft script with talk_script; when others present parts of it, name each of their sections' presenter in talk_outline; add the code or work it presents with projects_add (a folder, or a GitHub repository) and other papers with material_add. Then draft the outline with talk_draft (paid) or write it with talk_outline, each section with its slides and minutes. When the meeting is activated, Prepped writes what to say on each slide; during the talk the desktop app follows the slides on screen.
- Tools marked paid spend the person's credits: say what it costs (maxCostUsd) and get their agreement first. Planned meetings with material are prepared by themselves; check prep_status.
- Switches: settings_update turns the live translation and its language, speech recognition, hiding from screen sharing and meeting detection in the desktop app on this computer, automatic preparation and how long the other side's pause lasts before an answer; a meeting's own (when to answer, keeping its record, its spending limit, the provider's speed) are in meetings_create and meetings_update, and a series' shared memory in groups_create and groups_update. A presentation or defense can be rehearsed in the app beforehand; meetings_get lists its rehearsals.
- What a tool sets, its _get tool reads back under the same names: settings_get, meetings_get, groups_get, talk_get, projects_get, material_get (a document's text), questions_get. When the Prepped desktop app is closed, it starts by itself in the background.
- Deleting cannot be undone: confirm first.`;

export function createMcpServer(context: Omit<Context, 'client'>): McpServer {
  const server = new McpServer({ name: 'prepped', title: 'Prepped', version }, { instructions: INSTRUCTIONS });
  // The token's "last used by" in Settings names the MCP client that started this server.
  const client = async () => {
    const made = new Client(await resolveTarget());
    const peer = server.server.getClientVersion();
    made.userAgent = `prepped-mcp/${version}${peer ? ` (${peer.name}${peer.version ? ` ${peer.version}` : ''})` : ''}`;
    return made;
  };
  for (const operation of OPERATIONS) {
    server.registerTool(operation.name, {
      title: operation.title,
      description: operation.effect === 'paid' ? `${operation.description} [Paid: spends credits.]` : operation.description,
      inputSchema: operation.input,
      annotations: { readOnlyHint: operation.effect === 'read', destructiveHint: operation.effect === 'delete', idempotentHint: operation.effect === 'read', openWorldHint: false },
    }, async (args: unknown) => {
      try {
        const result = await operation.run({ ...context, client }, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(failure(error), null, 2) }] };
      }
    });
  }
  return server;
}

/** Serves the tools over standard input and output until the client closes them. */
export async function serveMcp(transport: Transport = new StdioServerTransport()): Promise<void> {
  const server = createMcpServer({ cwd: process.cwd(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, now: () => new Date() });
  await server.connect(transport);
}
