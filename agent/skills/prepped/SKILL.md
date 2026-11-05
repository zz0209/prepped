---
name: prepped
description: Set up and read the person's Prepped account (interview, meeting and presentation preparation) - create meetings and weekly or monthly repeating meetings, attach material from local files, add project folders, import resumes, prepare answers, read meeting records, work with the question bank and interview practice. Use when the person mentions Prepped, or asks to set up, schedule or prepare a meeting, interview, group meeting or presentation in it.
---

# Prepped

Prepped prepares people for interviews, meetings, presentations and media interviews from their material, and helps them live. You set things up in their account with the `prepped` command (or the same operations as MCP tools named `whoami`, `meetings_create`, `groups_create`, … when the Prepped MCP server is connected). Every command prints JSON; a failure prints `{"error": …}` on standard error with exit code 1.

## Before anything

1. Run `prepped whoami`. It shows the account, what the token may do (`read`, `write`, `paid`), the service (the desktop app on this computer, or the web), the available models, and this computer's time zone.
2. If it says not connected, connect yourself: run `npx -y prepped connect` (it recognises the tool you are and names the connection after it; add `--url <address>` for Prepped on the web, `--paid` to also ask for paid work) and tell the person to allow the request Prepped shows, with the code it prints. If it answers `"status": "waiting"`, ask the person to allow it and run the same command again: it continues the same request. Then add the `mcpServer` it prints to your own MCP settings, named `prepped`, at user level, and ask the person to restart you. Never ask for the access key in the chat.
3. `prepped <command> --help` lists a command's options. `prepped types` lists the six meeting types and every setup field (allowed values, limits).
4. Long or quoted input (Windows PowerShell quotes JSON differently): write it to a JSON file and pass `--input @file.json`; the file's keys are the option names in camelCase (`firstDate`, `timeZone`).

## Turning a request into Prepped

- Pick the meeting type: `meeting` (team, lab, project, 1:1), `interview`, `presentation`, `media` (press, podcast), `research` (user research), `general`.
- Fill the setup fields from what the person said and from their files: for a meeting `agenda`, `goals`, `decisions`, `myRole` (host, presenter, participant, observer); for an interview `company`, `role`, `round`, `interviewers`, `jobDescription`; for a presentation `title`, `audience`, `abstract`, `durationMinutes`. Their requirements for the answers go in `instructions`; what the meeting is for in `purpose`; who attends in `participants`.
- Do not invent facts about the person. Leave a field empty when you do not know it.

## Material from this computer

When the person points to files or folders ("用这个文件夹里的资料", "the slides in ./talk"), read them yourself first, then attach what matters:

- Files (PDF, DOCX, PPTX, TXT, Markdown, CSV, JSON, up to 8 MB): `--files <path>` on `meetings create` / `groups create`, or `prepped material add --meeting <id> --files <path> --files <path>`. Use absolute paths. A meeting or a group holds up to 8 documents (200,000 characters in all): attach the ones that matter most and add a folder of the rest as a project.
- Anything else (spreadsheets in other formats, notes scattered in chat): write the useful text into `--text "…" --text-name requirements.md`.
- Web pages and shared Google Docs: `--urls <address>`.
- A code project or a folder of work: `prepped projects add --meeting <id> --folder <absolute path>` (desktop app only), or `--github owner/name`. Prepped indexes it and only reads it; `prepped projects get <project>` shows whether it is ready and whether it was cut short (`truncated`), in which case add its important subfolders as their own projects. `prepped projects update <project> --brief "…"` writes what the project is in the person's words, which answers read first.
- Material on a group is read by every meeting of the group.

## Switches

- The person asks for the live translation, another speech recognition, hiding from screen sharing or meeting detection: `prepped settings update --translation --translate-into zh` (and the others; `prepped settings get` shows them under the same names). They are the desktop app's settings on this computer and change at once; a switch turned off is given as JSON (`--input '{"translation":false}'`). `--answer-wait quick|balanced|patient` sets how long the other side's pause lasts before an answer.
- A meeting's own switches: `--answers every|judged|manual`, `--keep-record`, `--limit-usd <n>`, `--speed standard|ultrafast` on `meetings create` / `meetings update`; how the answers read (length, tone, format) is `setup.responseStyle` (`prepped types`). A series' shared memory: `--memory` on `groups create` / `groups update` (`--input '{"memory":false}'` turns it off).
- Whatever you set reads back under the same names: `settings get`, `meetings get`, `groups get`, `talk get`, `projects get`, `material get` (a document's text), `questions get`.
- When the Prepped desktop app is closed, the first command starts it in the background (only its icon appears); wait for that answer.
- A presentation or defense can be rehearsed in the app before it starts (Rehearse, beside Activate meeting); `prepped meetings get` lists its rehearsals.

## Weekly or monthly meetings

A repeating meeting is a session group with a repeat rule. Prepped makes each next meeting by itself.

```bash
prepped groups create --name "Lab meeting" --type meeting \
  --setup '{"agenda":"Each person reports progress; then paper discussion","myRole":"presenter","goals":"Get feedback on the experiment plan"}' \
  --repeat weekly --days fri --time 14:00 --minutes 60 \
  --purpose "Weekly lab meeting with Prof. Li's group" --participants "Prof. Li" --participants "Wang Fang" \
  --instructions "Answer in Chinese; keep answers short and concrete" \
  --files /Users/me/lab/plan.md
```

- `--time` is local time in `--time-zone` (default: this computer's, from `whoami`). Without `--first-date`, the first meeting is the next chosen day whose time has not passed. Monthly series need `--first-date` (they fall on that weekday of the month).
- The answer shows the group, its next meeting times (`schedule.next`) and the first meeting. Tell the person the date and time of the first meeting.
- Change later with `prepped groups update <group> …` (`--repeat none` stops the series).

## One meeting

```bash
prepped meetings create --title "Design review" --type meeting --start 2026-11-06T14:00 \
  --purpose "Review the new onboarding flow" --setup '{"agenda":"…","myRole":"presenter"}' --files /abs/path/spec.pdf
```

From the person's calendar: `prepped calendar events`, then `prepped calendar setup <event key>` (`--keep-series` for a repeating event).

## A talk or a defense

A presentation meeting has its own slides, the person's draft script and an outline. When the meeting is activated, Prepped writes what to say on each slide; during the talk the desktop app looks at the screen each time the slide changes and shows what to say on that slide, fitted to what was said, the time left and the questions asked.

```bash
prepped meetings create --title "Thesis defense" --type presentation --start 2026-11-12T10:00 \
  --setup '{"title":"Adaptive retrieval for meeting answers","audience":"Thesis committee","abstract":"…","durationMinutes":20}'
prepped talk slides --meeting <id> --file /abs/path/defense.pptx            # .pptx or .pdf, up to 80 MB
prepped talk script --meeting <id> --file /abs/path/draft-script.md         # or --text "…"; a reference, its wording is fitted later
prepped projects add --meeting <id> --github owner/repo                     # the code or work the talk presents (or --folder)
prepped talk draft <id>                                                     # paid: drafts the outline from slides and script, saved
prepped talk get <id>                                                       # sections with their slides and minutes
```

- Instead of `talk draft`, write the outline yourself with `prepped talk outline --meeting <id> --input @outline.json` (`{"sections":[{"title":"…","points":["…"],"minutes":3,"fromSlide":1,"toSlide":4}, …]}`): sections in order, taking the slides in order, minutes adding up to `durationMinutes`.
- `prepped talk follow --meeting <id> --follow off` stops the desktop app from reading the screen during the talk.
- Prepare the likely questions as for any meeting (`prep start`, paid).

## Preparation and money

- Planned meetings with material are prepared by themselves. `prepped prep status <meeting>` shows the state.
- `prep start`, `resumes import --read`, `questions spoken` and `practice feedback` spend the person's credits. Before running one, tell the person what it does and the most it may cost (for `prep start`, `--max-cost-usd`, such as 0.30), and wait for their yes. A token without the `paid` permission is refused; tell them to create one with it if they want this.

## Reading back

- `prepped meetings list --status completed`, `prepped meetings record <meeting>` (transcript, questions, answers and notes; `--format markdown` for one text), `prepped prep answers <meeting>`.
- Resumes: `prepped resumes list`, `resumes import <file>`, `resumes export <id> --format pdf`.
- Question bank and practice: `prepped questions search --query "…"`, `questions answer <id> --frame star --parts '{"situation":"…"}'`, `practice create --questions <id> --model <model>`.

## Care

- Deleting (`meetings delete`, `groups delete`, `resumes delete`, …) cannot be undone: confirm first.
- A live meeting (listening, answering) runs in the Prepped app, not through these commands.
- After setting something up, say what you created with its date and time in the person's time zone.
