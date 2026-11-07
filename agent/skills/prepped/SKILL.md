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

- Pick the meeting type: `interview` (a job interview of theirs, a recruiter call, a mock interview), `meeting` (team, lab or project meeting, 1:1, client or sales call), `presentation` (a talk, defense, demo or pitch they give), `media` (press or podcast), `research` (they interview users), `general`.
- Fill the setup fields from what the person said and from their files: for a meeting `agenda`, `goals`, `decisions`, `myRole` (host, presenter, participant, observer); for an interview `company`, `role`, `field`, `round`, `interviewers`, `jobDescription`; for a presentation `title`, `audience`, `abstract`, `durationMinutes`; for media `outlet`, `hostOrGuests`, `topic`, `keyMessages`, `offLimitTopics`. What the meeting is for goes in `purpose`, who attends in `participants`, and requirements no field covers in `instructions`.
- Do not invent facts about the person. Leave a field empty when you do not know it.

## Choosing each option

Choose an option when the person's words or files support it, and leave the others to their defaults: `prepped types` gives every setup field with how to choose it, its default and an example, and `prepped <command> --help` does the same for each option. When an option would clearly change the meeting and nothing shows it (who presents which part of a shared talk, the round of an interview with no invitation), ask one short question before creating. After creating, list each choice and why, a line each, so the person can correct it.

What the person says or gives, and what it sets:

- A job posting → `jobDescription` from it, `company`, `role`, and `field` from the role (`software` for engineers, `data`, `product`, …).
- "Second round, technical" → `round: technical`; live coding on CoderPad → `coding`; "design a URL shortener" → `system-design`; a recruiter or intro call → `screening`.
- A resume file → `prepped resumes import <file>`, then write its content from the file with `prepped resumes update <id> --profile '{"basics":{…},"experience":[…],…}'` (the parts as `resumes get` shows them; answers read this content), or `resumes import --read` to have Prepped read it (paid); then `setup.resumeId` with its id. Without one, a new meeting takes the most recently changed resume.
- They report or present in the meeting → `myRole: presenter`; they run it → `host`; a 1:1 or a call where they mostly answer → `participant` (the default).
- Answer length comes from the person's words only: nothing said → `responseStyle.length: balanced`, for every meeting type; "short answers" → `concise`; "detailed" → `detailed`. Never lengthen answers because the person presents (a lab meeting with `detailed` gave 130 to 309 words an answer) or shorten them because it is a call (a recruiter call with `concise` and cues gave 6 to 40). "I'll read the answers out word for word" → `responseStyle.form: script`; "just keywords" → `cues`. An interview or a recruiter call → `form: plain`, `length: balanced`, `format: paragraphs`: open questions then get what the person did, used and measured, and factual ones stay short. Cues and bullets leave out what to say: cues only when the person asks for keyword cards, and never with `concise`.
- `--instructions` holds facts only: the graduation date, how to state work authorization, the experiences to stress, questions to ask. Words such as "concise" or "brief" there override `responseStyle`. A podcast or a friendly chat → `responseStyle.tone: conversational`; a committee or a board → `formal`.
- "Answer in Chinese" → `--language zh` (the answers' language); otherwise leave `auto`, which answers in the language of each question.
- Everyone speaks one language (an English podcast) → `setup.speechLanguage: en`; more than one, or not known → `auto` (the default).
- A phone on speaker beside the computer, or the same room → `setup.otherSide: nearby`.
- "Only when I press the button" → `--answers manual`; nearly every turn of the other side is a question for them (a rapid mock interview) → `every`; otherwise leave `judged`.
- "Confidential", "don't keep a record" → `--input '{"keepRecord":false}'`. A budget for the meeting ("no more than $1") → `--limit-usd 1`.
- "Translate what they say into Chinese" → `prepped settings update --translation --translate-into zh` (a setting of this computer for every meeting; say that you turned it on).
- Preparation may cost up to $1 → `prepped settings update --auto-prepare --auto-prepare-limit-usd 1` (planned meetings with material prepare themselves within it); `prep start --max-cost-usd 1` needs the paid permission and their yes.
- The meeting is in their calendar → `prepped calendar events`, then `prepped calendar setup <key>`, so the meeting follows the event and its call link; change its fields afterwards with `meetings update`.
- A talk given with others → `prepped talk outline` with each of their sections' `presenter`, the minutes adding up to `durationMinutes`.
- A large project folder → `prepped projects add` for its code and docs folders (such as `src`), leaving out data, outputs, dependencies and builds.
- A coding interview or a project demo where Prepped should see the screen → tell them to turn on "Read the shared screen when this meeting starts" on the meeting's page in the desktop app (or the overlay's Read screen button during it); it is a choice of that computer.
- Leave `--model` and `--speed` out unless the person asks; Prepped chooses the model for the meeting type.

A weekly series takes the same choices: how the answers read for every meeting (`myRole`, `responseStyle`, `speechLanguage`) in `--setup`, and the answer language and switches as `--language`, `--answers`, `--keep-record`, `--limit-usd` on `groups create`, which its meetings carry on.

The report after creating, for example:

```text
Created "Northwind interview" on Thu 12 Nov, 11:00 (America/New_York):
- interview, round technical: you said "second round (technical)"
- field software: the role is Backend Engineer
- job description from jd.md; resume.md imported and used as your background
- answers when a turn needs one, record kept, at most $0.25: the defaults
Prepped prepares it by itself on this computer: keep Prepped running until it is done (closing its window is fine; quitting pauses it until you open Prepped again).
```

## Material from this computer

When the person points to files or folders ("用这个文件夹里的资料", "the slides in ./talk"), read them yourself first, then attach what matters:

- Files (PDF, DOCX, PPTX, TXT, Markdown, CSV, JSON, up to 8 MB): `--files <path>` on `meetings create` / `groups create`, or `prepped material add --meeting <id> --files <path> --files <path>`. Use absolute paths. A meeting or a group holds up to 8 documents (200,000 characters in all): attach the ones that matter most and add a folder of the rest as a project.
- Anything else (spreadsheets in other formats, notes scattered in chat): write the useful text into `--text "…" --text-name requirements.md`.
- Web pages and shared Google Docs: `--urls <address>`.
- A code project or a folder of work: `prepped projects add --meeting <id> --folder <absolute path>` (desktop app only), or `--github owner/name`. Prepped indexes it and only reads it; `prepped projects get <project>` shows whether it is ready and whether it was cut short (`truncated`), in which case add its important subfolders as their own projects. `prepped projects update <project> --brief "…"` writes what the project is in the person's words, which answers read first.
- Material on a group is read by every meeting of the group.

## Switches

- The person asks for a meeting to be translated: set `"translateInto": "auto"` in that meeting's or group's setup (meetings_create, meetings_update, groups_create, groups_update), which translates into the app's interface language; a language code such as `"ja"` only when the person names a language, `"none"` when they want none. The desktop app translates the meeting on whichever computer runs it; this computer's translation setting below may be on while the computer the person meets on has it off.
- The person asks for the live translation in general, another speech recognition, hiding from screen sharing or meeting detection: `prepped settings update --translation --translate-into zh` (and the others; `prepped settings get` shows them under the same names). They are the desktop app's settings on this computer and change at once; a switch turned off is given as JSON (`--input '{"translation":false}'`). `--answer-wait quick|balanced|patient` sets how long the other side's pause lasts before an answer.
- A meeting's own switches: `--answers every|judged|manual`, `--keep-record`, `--limit-usd <n>`, `--speed standard|ultrafast` on `meetings create` / `meetings update`; how the answers read (length, tone, format) is `setup.responseStyle` (`prepped types`). A series' shared memory: `--memory` on `groups create` / `groups update` (`--input '{"memory":false}'` turns it off).
- Whatever you set reads back under the same names: `settings get`, `meetings get`, `groups get`, `talk get`, `projects get`, `material get` (a document's text), `questions get`.
- The person does not need to open Prepped for you to set things up: when the desktop app is closed, the first command starts it in the background (only its icon appears, in the taskbar's notification area on Windows or the menu bar on macOS); wait for that answer.
- A result with `tellThePerson` explains when Prepped started in the background and where it prepares the meeting. In the desktop app it runs on this computer and needs Prepped to keep running until it finishes. Closing the window is fine. Quitting pauses preparation until Prepped opens again. On the web it runs online. Pass each point on in your reply in the person's language, once per reply. `prepped prep status <meeting>` shows how far it is.
- A presentation or defense can be rehearsed in the app before it starts (Rehearse, beside Activate meeting); `prepped meetings get` lists its rehearsals.

## Weekly or monthly meetings

A repeating meeting is a session group with a repeat rule. Prepped makes each next meeting by itself.

```bash
prepped groups create --name "Lab meeting" --type meeting \
  --setup '{"agenda":"Each person reports progress; then paper discussion","myRole":"presenter","goals":"Get feedback on the experiment plan","responseStyle":{"length":"balanced"}}' \
  --repeat weekly --days fri --time 14:00 --minutes 60 --language zh \
  --purpose "Weekly lab meeting with Prof. Li's group" --participants "Prof. Li" --participants "Wang Fang" \
  --instructions "Name the dataset and the number of runs behind each result" \
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

- Planned meetings with material are prepared by themselves (see `tellThePerson` above for what to tell the person). `prepped prep status <meeting>` shows the state.
- `prep start`, `resumes import --read`, `questions spoken` and `practice feedback` spend the person's credits. Before running one, tell the person what it does and the most it may cost (for `prep start`, `--max-cost-usd`, such as 0.30), and wait for their yes. A token without the `paid` permission is refused; tell them to create one with it if they want this.

## Reading back

- `prepped meetings computers <meeting>` shows each computer's online, open, listening and answering roles. At the person's request, use `--action update --computer <id> --open`, then `--listening` or `--answering` in a separate update. Several desktops can listen. One writes the answers. To stop listening, pass `--input '{"action":"update","computer":"<id>","listening":false}'`.
- `prepped settings get` shows this desktop's folder sharing and overlay appearance and the account's quick actions. For example, `prepped settings update --overlay '{"layout":"list","preset":"glass","size":"large","opacity":0.85}'`.

- `prepped meetings list --status completed`, `prepped meetings record <meeting>` (transcript, questions, answers and notes; `--format markdown` for one text).
- Resumes: `prepped resumes list`, `resumes import <file>`, `resumes export <id> --format pdf`.
- Question bank and practice: `prepped questions search --query "…"`, `questions answer <id> --frame star --parts '{"situation":"…"}'`, `practice create --questions <id> --model <model>`.

## Care

- Deleting (`meetings delete`, `groups delete`, `resumes delete`, …) cannot be undone: confirm first.
- A live meeting (listening, answering) runs in the Prepped app, not through these commands.
- After setting something up, say what you created with its date and time in the person's time zone.
