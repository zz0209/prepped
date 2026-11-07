import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { version } from '../package.json';
import { Client } from './client.js';
import { resolveTarget } from './config.js';
import { failure } from './cli.js';
import { OPERATIONS, perform, type Context } from './operations.js';

// The MCP server (`prepped mcp`): every operation of src/operations.ts as a tool, for Claude Code, Codex, Cursor,
// Antigravity and any other MCP client. It signs in with the connection PREPPED_CONNECTION names (prepped connect, or the
// desktop app's Connect), with PREPPED_TOKEN and PREPPED_URL or PREPPED_DESKTOP=1 from the client's settings, or as
// `prepped login` saved (src/config.ts resolveTarget).

const INSTRUCTIONS = `Prepped prepares people for interviews, meetings, presentations and media interviews, and helps them live. These tools set up the person's Prepped account: meetings, session groups (including weekly or monthly repeating meetings), material, project folders, resumes, the question bank and practice.
- Call whoami first: it says who is signed in, what the token may do (read, write, paid) and this computer's time zone.
- Turn the person's request into a meeting type (types lists every type's setup fields) and fill the fields from what they said and the files they point to. Read those files yourself, then attach the ones that matter with material_add or the files field (PDF, DOCX, TXT, Markdown, CSV, JSON; up to 8 documents for a meeting or a group). Use absolute paths. A folder or repository of code and results goes in whole with projects_add, which Prepped indexes and searches during the meeting; give a large folder's important subfolders as their own projects (its code and docs, leaving out data, outputs, dependencies and builds).
- Choosing options: every field of types and every tool input says how to choose it, its default and an example. Choose a value when the person's words or files support it, and leave the rest to their defaults. When an option would clearly change the meeting and nothing shows it (who presents which part of a shared talk, the round of an interview with no invitation), ask one short question before creating. Afterwards list each choice you made and why, in a line each, so the person can correct it.
- How long answers are comes from the person's words only: responseStyle length balanced for every meeting type when they say nothing about it, concise only when they ask for short answers, detailed only when they ask for detailed ones. Never lengthen answers because the person presents or shorten them because it is an interview or a call. With nothing said about the answers, form plain and format paragraphs.
- Where things go: the answer language in language (a code such as zh for "answer in Chinese", auto otherwise), how answers read in setup.responseStyle (length, tone, form: script when the person reads answers aloud), the spoken language in setup.speechLanguage, a phone on speaker or the same room in setup.otherSide nearby, the person's resume in setup.resumeId (a resume file they give: resumes_import it, then write its content from the file with resumes_update, which answers read; resumes_import with read has a model do it, paid). instructions hold facts only (dates, work authorization, what to stress); words about length or style there override responseStyle. Leave model and speed out unless the person asks. A meeting in their calendar (calendar_events) is made with calendar_setup, so it follows the event and its call link; change its fields afterwards with meetings_update.
- Reading the shared screen during a meeting (a coding interview, a demo of a project) is the desktop app's choice on this computer: tell the person to turn on "Read the shared screen when this meeting starts" on the meeting's page, or the overlay's Read screen button during it.
- A repeating meeting is groups_create with repeat, days and time; times are local to timeZone, which defaults to this computer's.
- A talk or a defense is a presentation meeting: put its title, audience, abstract and length in minutes (durationMinutes) in setup; give its slides with talk_slides (.pptx or .pdf) and the person's draft script with talk_script; when others present parts of it, name each of their sections' presenter in talk_outline; add the code or work it presents with projects_add (a folder, or a GitHub repository) and other papers with material_add. Then draft the outline with talk_draft (paid) or write it with talk_outline, each section with its slides and minutes. When the meeting is activated, Prepped writes what to say on each slide; during the talk the desktop app follows the slides on screen.
- Tools marked paid spend the person's credits: show the estimate from prep_status for a preparation, or the tool's maxCostUsd when available, and get the person's agreement first.
- Live translation for a meeting: set translateInto in the meeting's or group's setup with meetings_create, meetings_update, groups_create or groups_update. "auto" translates into the app's interface language on the computer that runs the meeting; use a language code when the person names that language, or "none" for no translation.
- Switches: settings_update turns the live translation and its language, speech recognition, hiding from screen sharing and meeting detection in the desktop app on this computer, automatic preparation and how long the other side's pause lasts before an answer; a meeting's own (when to answer, keeping its record, its spending limit, the provider's speed) are in meetings_create and meetings_update, for a series in groups_create and groups_update (which give them to its meetings with the answer language), and a series' shared memory in groups_create and groups_update. A presentation or defense can be rehearsed in the app beforehand; meetings_get lists its rehearsals.
- What a tool sets, its _get tool reads back under the same names: settings_get, meetings_get, groups_get, talk_get, projects_get, material_get (a document's text), questions_get.
- Read meetings_computers before changing a live desktop's role. Only open, listen on or move answering to another computer when the person asks. Open it first, then set listening to true for another listener or answering to true for the sole answerer. Read-only keys can get the list.
- settings_get and settings_update also control this computer's folder sharing (searchForOtherComputers) and overlay appearance, and the account's quickActions and translateButton.
- The person does not need to open Prepped to set things up: when the desktop app is closed, the first tool call starts it in the background (only its icon shows, in the taskbar's notification area on Windows or the menu bar on macOS). Planned meetings with material are prepared by Prepped itself; in the desktop app the preparation runs on this computer while Prepped keeps running (closing its window is fine; quitting pauses it until Prepped opens again), and on the web it runs online.
- A result with tellThePerson holds what the person has to know (that Prepped was started, where the preparation runs and that Prepped has to keep running for it): pass each of its points on in your reply, in the person's language (once in a reply, however many results carried it). Do not leave them out or fold them into something vaguer.
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
        const result = await perform(operation, { ...context, client }, args);
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
