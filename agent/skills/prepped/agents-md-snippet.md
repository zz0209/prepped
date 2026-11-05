## Prepped

The person uses Prepped (interview, meeting and presentation preparation). To set things up in it, use the `prepped` command (or the Prepped MCP tools of the same names: `whoami`, `meetings_create`, `groups_create`, `material_add`, …). Output is JSON.

- Run `prepped whoami` first: account, permissions (read, write, paid), available models, this computer's time zone. Not connected: run `npx -y prepped connect` (it names the connection after the tool you are), the person allows it in Prepped (on `"status": "waiting"`, run it again after they allow it), then add the `mcpServer` it prints to your MCP settings and ask to be restarted.
- `prepped --help` lists every command; `prepped <command> --help` its options; `prepped types` the setup fields of each meeting type (meeting, interview, presentation, media, research, general).
- A weekly or monthly meeting: `prepped groups create --name … --type meeting --repeat weekly --days fri --time 14:00 --setup '{"agenda":"…"}' --purpose … --instructions … --files <absolute path>`. Times are local to `--time-zone` (default this computer's).
- One meeting: `prepped meetings create --title … --type … --start 2026-11-06T14:00 …`. From the calendar: `prepped calendar events`, `prepped calendar setup <key>`.
- When the person points to files or folders, read them, then attach the useful ones (`--files`, `prepped material add`; PDF, DOCX, PPTX, TXT, Markdown, CSV, JSON; up to 8 documents for a meeting or a group) or their text (`--text … --text-name notes.md`); a code folder is `prepped projects add --folder <path>` (desktop app).
- What you set reads back under the same names: `prepped settings get`, `meetings get`, `groups get`, `talk get`, `projects get`, `material get`. A closed desktop app starts in the background at the first command.
- A talk or a defense: `prepped meetings create --type presentation --setup '{"title":"…","audience":"…","durationMinutes":20}' …`, then `prepped talk slides --meeting <id> --file <deck.pptx or .pdf>`, `prepped talk script --meeting <id> --file <draft>`, `prepped projects add` for the work it presents, and `prepped talk draft <id>` (paid) or `prepped talk outline` for the outline with each section's slides.
- Paid commands (`prep start`, `resumes import --read`, `questions spoken`, `practice feedback`) spend the person's credits: state the limit (`--max-cost-usd`) and ask before running. Deleting cannot be undone: confirm first.
- Long or quoted input: put it in a JSON file and pass `--input @file.json`.
