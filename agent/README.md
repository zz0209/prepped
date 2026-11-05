# prepped

Connect [Prepped](https://ai-overlay-alpha.fly.dev) to the coding tool you already use (Claude Code, Codex, Cursor, Antigravity, Gemini CLI or any other MCP client), then ask it things like:

> Set up a weekly lab meeting in Prepped, Fridays at 2 pm. I'm presenting the experiment results; the plan is in ./lab/plan.md.

The tool reads the file, picks the meeting type and its fields, and creates the series in your Prepped account with its agenda, people and material.

`prepped` is an MCP server and a command line. It works with your account through the Prepped desktop app on the same computer, or through Prepped on the web, using a key you allow in Prepped.

## Connect

**Claude Code, Codex or Cursor, with the desktop app.** In Prepped, open **Settings › Connections** and click **Connect** next to the tool. Restart the tool, or open a new session in it. Prepped writes itself into the tool's MCP settings and runs the server with its own runtime, so there is nothing else to install.

**Any other agent.** Ask it to run:

```bash
npx -y prepped connect
```

Prepped shows the request with the tool's name and a code. Check that the code matches and click **Allow**. The command then prints the MCP server entry to add (`npx -y prepped mcp --connection <name>`) and how Claude Code, Codex, Cursor and Antigravity add it. If it prints `"status": "waiting"`, allow the request and run the same command again; it continues the same request. For Prepped on the web, add `--url https://<your Prepped address>`. This needs Node.js 20 or later.

When the desktop app is closed, the first request starts it in the background. Only its icon appears in the tray or menu bar.

## What your tool can do

- Create, change, copy and delete meetings; read the transcript, questions and answers of a past one.
- Set up weekly or monthly meetings, with material and a memory shared by every meeting in the series.
- Attach files from your computer (PDF, DOCX, PPTX, TXT, Markdown, CSV, JSON), web pages and notes; add project folders and GitHub or other Git repositories, which Prepped indexes and searches during the meeting.
- Start, pause and check a meeting's preparation, and read the questions and answers it prepared.
- Give a talk or a defense its slides, draft script and outline.
- Set up meetings from calendar events, manage resumes, the question bank and interview practice.
- Turn the settings people change most: live translation and its language, speech recognition, automatic preparation, how long to wait before answering.

Anything it sets, it can read back with the matching `_get` tool under the same names. `prepped --help` lists every operation.

It cannot sign in, pay, change your password or keys, or run a live meeting. Those stay in the app. Paid work, such as preparing a meeting, needs **Can spend credits** turned on for that tool in **Settings › Connections**, and the tool is told to ask you first.

## Where the key is kept

Each tool has its own connection in a file only you can read: `%APPDATA%\prepped\connections\<name>.json` on Windows, `~/.config/prepped/connections/<name>.json` on macOS and Linux. The tool's MCP settings name the connection, not the key. Prepped keeps only a hash of the key. Disconnect a tool in **Settings › Connections** at any time, or run `prepped disconnect --name <name>`.

## Command line

```bash
npm install -g prepped
prepped whoami
prepped groups create --name "Lab meeting" --type meeting --repeat weekly --days fri --time 14:00 --files ./lab/plan.md
prepped meetings list --status planned
prepped --help
```

Every command prints JSON. A failure prints `{"error": …, "code": …}` on standard error and exits with 1. `prepped skill install` adds a Claude Code skill; `prepped skill agents-md` prints a section for a project's `AGENTS.md`.

## License

MIT. The Prepped name and logo are not covered by the license.
