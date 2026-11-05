import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { Client, PreppedError } from './client.js';
import { SESSION_MODES, SETUP_FIELD_LIMITS, sessionSetupSchema, type SessionMode } from '../../shared/session-setup.js';
import { LANGUAGE_CODES } from '../../shared/languages.js';
import { ANSWER_FRAMES, FRAME_IDS, defaultFrame } from '../../shared/answer-frames.js';
import { DIFFICULTIES, QUESTION_CATEGORIES } from '../../shared/question-categories.js';
import { ANSWER_MODES, ANSWER_WAITS } from '../../shared/answer-mode.js';
import { MATERIAL_LIMITS, TEXT_LIMITS } from '../../shared/text-limits.js';
import { AUTO_PREPARE_LIMITS } from '../../shared/auto-prepare.js';
import { TRANSLATION_LANGUAGES } from '../../shared/translation.js';

// Every operation an agent can ask of Prepped, once: its name, what it does, its input and the HTTP requests it makes
// (docs/API.md). The command line (src/cli.ts) makes each a subcommand and the MCP server (src/mcp.ts) a tool, so the two
// always offer the same operations.

/** read: changes nothing; write: creates or changes; delete: removes; paid: spends the account's credits. */
export type Effect = 'read' | 'write' | 'delete' | 'paid';
export type Context = { client: () => Promise<Client>; cwd: string; timeZone: string; now: () => Date };
export type Operation = {
  name: string; title: string; description: string; effect: Effect;
  /** The input field the command line takes as its first plain argument (`prepped meetings get <id>`). */
  positional?: string;
  input: z.ZodObject<z.ZodRawShape>;
  run: (context: Context, input: any) => Promise<unknown>;
};

function operation<S extends z.ZodRawShape>(spec: Omit<Operation, 'input' | 'run'> & { input: S; run: (context: Context, input: z.infer<z.ZodObject<S>>) => Promise<unknown> }): Operation {
  return { ...spec, input: z.object(spec.input).strict() as unknown as z.ZodObject<z.ZodRawShape>, run: spec.run as Operation['run'] };
}

// Inputs used by many operations.
const uuid = (what: string) => z.string().uuid().describe(`The ${what}'s id`);
const type = z.enum(SESSION_MODES).describe('Meeting type: general, meeting (a team or work meeting), interview, media (being interviewed by the press, a podcast), presentation, or research (user research)');
const setup = z.record(z.string(), z.unknown()).describe('The fields of the meeting type (agenda, goals, myRole for a meeting; company, role, round, jobDescription for an interview; …). Run the `types` operation for every type\'s fields and limits. Given fields replace those fields only.');
const start = z.string().describe('When the meeting starts: local time as 2026-11-06T14:00 in timeZone, or an ISO time with its offset (2026-11-06T19:00:00Z)');
const timeZone = z.string().describe('IANA time zone such as America/New_York or Asia/Shanghai; this computer\'s time zone when left out');
const participants = z.array(z.string().min(1).max(120)).max(50).describe('The people in the meeting, as names (with their roles if known)');
const purpose = z.string().max(4000).describe('What the meeting is for, in a sentence or a few');
const instructions = z.string().max(4000).describe('Standing instructions for the answers Prepped writes in this meeting (the person\'s requirements, tone, what to stress)');
const files = z.array(z.string().min(1)).describe('Paths of files on this computer to attach as material: PDF, DOCX, PPTX, TXT, Markdown, CSV or JSON, up to 8 MB each. Relative paths start at the current folder. A presentation\'s own slides go in with talk_slides.');
const urls = z.array(z.string().url()).describe('Web pages, PDFs on the web or Google Docs/Slides/Sheets shared by link, read now and attached as material');
const model = z.string().min(1).max(100).describe('A model id from `whoami` (its models with available: true)');
const language = z.enum(LANGUAGE_CODES).describe('Language code, or auto');
// A meeting's own switches (server/app-core.ts PATCH /api/sessions/:id).
const meetingSwitches = {
  answers: z.enum(ANSWER_MODES).optional().describe('When Prepped answers during the meeting: every (each turn of the other side), judged (the turns that need an answer; the default), manual (only when the person asks)'),
  keepRecord: z.boolean().optional().describe('Keep the meeting\'s transcript and answers after the app closes (default true)'),
  limitUsd: z.number().min(0).max(100).optional().describe('The most the meeting\'s live answers and writing may spend, in USD'),
  speed: z.enum(['standard', 'ultrafast']).optional().describe('How fast the provider serves the meeting\'s answers: standard, or ultrafast (OpenAI\'s fastest service, with the models that offer it; it costs more, and raises the meeting\'s spending limit unless limitUsd is given). Another model turns it back to standard.'),
};
const switchesOf = (input: { answers?: string; keepRecord?: boolean; limitUsd?: number; speed?: string }) => ({
  ...(input.answers ? { answerMode: input.answers } : {}), ...(input.keepRecord !== undefined ? { saveHistory: input.keepRecord } : {}),
  ...(input.limitUsd !== undefined ? { sessionLimitMicro: Math.round(input.limitUsd * 1e6) } : {}), ...(input.speed ? { serviceTier: input.speed } : {}),
});

const MATERIAL_TYPES = ['.pdf', '.docx', '.pptx', '.txt', '.md', '.csv', '.json'];
// A presentation's deck (server/talk-deck.ts), and its draft script as a file.
const DECK_TYPES = ['.pptx', '.pdf'];
const DECK_BYTES = 80 * 1024 * 1024;
const SCRIPT_TYPES = ['.txt', '.md', '.docx', '.pdf'];
const newSectionId = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

// Times: a local time in a zone becomes the instant the service keeps.
const ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
function zoneOf(context: Context, given?: string): string {
  const zone = given ?? context.timeZone;
  if (!ZONES.has(zone)) throw new PreppedError(`Unknown time zone "${zone}". Use an IANA name such as America/New_York or Asia/Shanghai.`);
  return zone;
}
const LOCAL_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/;
export function instant(text: string, zone: string): string {
  const local = LOCAL_TIME.exec(text.trim());
  if (local) {
    const [year, month, day, hour, minute] = local.slice(1).map(Number) as [number, number, number, number, number];
    return new Date(new TZDate(year, month - 1, day, hour, minute, zone).getTime()).toISOString();
  }
  if (!z.iso.datetime({ offset: true }).safeParse(text.trim()).success) throw new PreppedError(`Write the time as 2026-11-06T14:00 (local time in the time zone) or an ISO time with its offset; "${text}" is neither.`);
  return new Date(text.trim()).toISOString();
}
/** The calendar date in `zone` at `at`, as YYYY-MM-DD. */
const dateIn = (at: Date, zone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
// Weekday names an agent may write, to 0 (Sunday) … 6 (Saturday) as server/series.ts counts them.
const WEEKDAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
function weekday(name: string): number {
  const index = WEEKDAY_NAMES[name.trim().toLowerCase()];
  if (index === undefined) throw new PreppedError(`Unknown weekday "${name}". Use mon, tue, wed, thu, fri, sat or sun.`);
  return index;
}

// A repeat rule (server/series.ts recurrenceSchema) from what an agent says: weekly on some days, or monthly on the
// first date's weekday of the month, at a local time. Without a first date, the first chosen day from today on whose
// time has not passed.
const repeatInput = {
  repeat: z.enum(['weekly', 'monthly']).optional().describe('Make the group a repeating series: weekly (on `days`) or monthly (on the same weekday of the month as `firstDate`, such as the 2nd Tuesday). Each meeting is made by itself when the previous one is over.'),
  days: z.array(z.string()).max(7).optional().describe('Weekdays of a weekly series: mon, tue, wed, thu, fri, sat, sun'),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional().describe('Local start time, 24-hour HH:MM, such as 14:00'),
  minutes: z.number().int().min(5).max(600).optional().describe('How long each meeting lasts, in minutes (default 60)'),
  every: z.number().int().min(1).max(12).optional().describe('Every how many weeks or months (default 1)'),
  firstDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Date of the first meeting, YYYY-MM-DD; for weekly it defaults to the next chosen day'),
  timeZone: timeZone.optional(),
};
type RepeatInput = { repeat?: 'weekly' | 'monthly'; days?: string[]; time?: string; minutes?: number; every?: number; firstDate?: string; timeZone?: string };
// A series' shared memory (server/series-memory.ts).
const groupMemory = z.boolean().describe('Whether the group\'s meetings keep a shared memory: the decisions, action items, progress, facts and terms of each meeting, which the next ones read (on by default)');
export function repeatRule(input: RepeatInput, context: Context) {
  const zone = zoneOf(context, input.timeZone);
  if (!input.time) throw new PreppedError('A repeating series needs its start time, such as time: "14:00".');
  const days = [...new Set((input.days ?? []).map(weekday))];
  let first = input.firstDate;
  if (input.repeat === 'monthly' && !first) throw new PreppedError('A monthly series needs firstDate: its meetings fall on that date\'s weekday of the month (the 1st to 4th, or the last).');
  if (!first) {
    if (!days.length) throw new PreppedError('A weekly series needs days, such as ["fri"], or a firstDate.');
    const today = dateIn(context.now(), zone);
    for (let offset = 0; offset < 8 && !first; offset++) {
      const date = new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
      if (days.includes(weekdayOf(date)) && Date.parse(instant(`${date}T${input.time}`, zone)) > context.now().getTime()) first = date;
    }
  }
  if (input.repeat === 'weekly' && days.length && !days.includes(weekdayOf(first!))) throw new PreppedError(`firstDate ${first} is a ${WEEKDAYS[weekdayOf(first!)]}, which is not one of the chosen days.`);
  return { frequency: input.repeat!, interval: input.every ?? 1, weekdays: input.repeat === 'weekly' && days.length ? days.sort((a, b) => a - b) : [weekdayOf(first!)],
    start: `${first}T${input.time}`, minutes: input.minutes ?? 60, timeZone: zone };
}

// Material: files on this computer, web pages and text, for a meeting or a group. Every file is read before anything is
// created, so a wrong path or type stops the operation before it changes the account.
type Material = { parts: { blob: Blob; name: string }[]; urls: string[] };
async function readMaterial(context: Context, input: { files?: string[]; urls?: string[]; text?: string; textName?: string }): Promise<Material> {
  const parts: Material['parts'] = [];
  for (const file of input.files ?? []) {
    const full = path.resolve(context.cwd, file);
    if (!MATERIAL_TYPES.includes(path.extname(full).toLowerCase())) throw new PreppedError(`${full}: Prepped takes PDF, DOCX, PPTX, TXT, Markdown, CSV or JSON files as material. Convert it, or attach its text with \`text\`.`);
    parts.push({ blob: new Blob([await readFile(full)]), name: path.basename(full) });
  }
  if (input.text !== undefined) {
    const name = input.textName ?? 'notes.md';
    if (!['.md', '.txt'].includes(path.extname(name).toLowerCase())) throw new PreppedError('Name text material with .md or .txt, such as requirements.md.');
    parts.push({ blob: new Blob([input.text]), name });
  }
  return { parts, urls: input.urls ?? [] };
}
/** A meeting or a group holds up to 8 documents (server/reference-documents.ts): material that would pass them stops the
 * operation before it changes anything, with what to do instead. */
function roomFor(existing: number, material: Material) {
  const adding = material.parts.length + material.urls.length;
  if (existing + adding <= MATERIAL_LIMITS.documents) return;
  throw new PreppedError(`A meeting or a group holds up to ${MATERIAL_LIMITS.documents} documents (${MATERIAL_LIMITS.characters.toLocaleString('en-US')} characters in all); it has ${existing} and this adds ${adding}. Nothing was changed. Attach the documents that matter most; put the others in one folder and add it with projects_add (a project folder has no such limit and is searched during the meeting), or join short notes into one text.`, 409, 'MATERIAL_LIMIT');
}
async function attach(client: Client, owner: string, material: Material) {
  const documents: unknown[] = [];
  for (const part of material.parts) {
    const form = new FormData();
    form.append('file', part.blob, part.name);
    documents.push((await client.request('POST', `${owner}/documents`, { form })).document);
  }
  for (const url of material.urls) documents.push((await client.request('POST', `${owner}/documents/web`, { json: { url } })).document);
  return documents;
}
const materialInput = {
  files: files.optional(),
  urls: urls.optional(),
  text: z.string().min(1).max(200_000).optional().describe('Text to attach as one document, such as requirements or notes written for this meeting'),
  textName: z.string().min(1).max(120).optional().describe('File name for `text`, ending in .md or .txt (default notes.md)'),
};

/** A meeting or a group, by exactly one of `meeting` and `group`. */
function ownerOf(input: { meeting?: string; group?: string }): string {
  if (Boolean(input.meeting) === Boolean(input.group)) throw new PreppedError('Give either meeting or group, not both.');
  return input.meeting ? `/api/sessions/${input.meeting}` : `/api/groups/${input.group}`;
}

// What an agent sees of a meeting: what meetings_create and meetings_update set, under the names they take (type, start,
// group, answers, keepRecord, limitUsd, speed), so it reads back what it set.
const meetingOut = ({ mode, scheduledAt, groupId, answerMode, saveHistory, sessionLimitMicro, serviceTier, costMicro, costCredits: _credits, sessionLimitCredits: _limitCredits, ...session }: any) => ({
  ...session, type: mode, start: scheduledAt, group: groupId, answers: answerMode, keepRecord: saveHistory, limitUsd: sessionLimitMicro / 1e6, speed: serviceTier, costUsd: costMicro / 1e6 });
const meetingBrief = (session: any) => ({ id: session.id, title: session.title, type: session.mode, status: session.status, start: session.scheduledAt,
  group: session.groupId, purpose: session.purpose, participants: session.participants, model: session.model, ...(session.calendar ? { calendar: session.calendar } : {}), updatedAt: session.updatedAt });
// A group's repeat rule (server/series.ts) as groups_create and groups_update take it.
function repeatOut(rule: { frequency: 'weekly' | 'monthly'; interval: number; weekdays: number[]; start: string; minutes: number; timeZone: string } | null) {
  if (!rule) return { repeat: 'none' as const };
  return { repeat: rule.frequency, ...(rule.frequency === 'weekly' ? { days: rule.weekdays.map(day => WEEKDAYS[day]) } : {}), time: rule.start.slice(11), minutes: rule.minutes,
    every: rule.interval, firstDate: rule.start.slice(0, 10), timeZone: rule.timeZone };
}
// What an agent sees of a group: its type, its repeat rule and whether its meetings keep a shared memory, under the names
// groups_create and groups_update take.
const groupOut = ({ mode, recurrence, memoryEnabled, costMicro, ...group }: any) => ({ ...group, type: mode, ...repeatOut(recurrence), memory: memoryEnabled, costUsd: costMicro / 1e6 });
const documentOut = (document: any) => ({ id: document.id, name: document.name, characters: document.characters, groupId: document.groupId ?? null, origin: document.origin ?? null, createdAt: document.createdAt });
const prepOut = (prep: any) => prep && ({ status: prep.status, stale: prep.stale, model: prep.model, startedAt: prep.startedAt, finishedAt: prep.finishedAt, error: prep.error,
  stopReason: prep.stopReason, costMicro: prep.costMicro, maxCostMicro: prep.maxCostMicro, progress: prep.progress, preparedAnswers: prep.itemCount });
// What an agent sees of a presentation's talk (server/talk.ts state): the outline with each section's slides, the deck's
// slide titles, the draft script (its start, or all of it for talk_get), whether the desktop app follows the slides, and
// what is written to say.
const talkOut = (talk: any, fullScript = false) => ({
  outline: (talk.outline.sections as any[]).map(section => ({ id: section.id, title: section.title, points: section.points ? String(section.points).split('\n') : [], minutes: section.minutes,
    fromSlide: section.slides?.from ?? null, toSlide: section.slides?.to ?? null, presenter: section.presenter ?? null, written: Boolean(talk.content[section.id]), outdated: Boolean(talk.content[section.id]?.stale) })),
  deck: talk.deck && { name: talk.deck.name, kind: talk.deck.kind, slides: (talk.deck.slides as any[]).map(slide => `${slide.number}. ${slide.title}`) },
  script: fullScript ? { characters: talk.script.length, text: talk.script } : { characters: talk.script.length, start: talk.script.slice(0, 400) }, followSlides: talk.follow,
  writing: talk.writing, writeError: talk.error, live: talk.view && { slide: talk.view.slide, now: talk.view.now, section: talk.view.sections[talk.view.current]?.title ?? null },
});
// The switches as settings_update takes them (server/switches.ts), so an agent reads back what it turned; this computer's
// are null where the service is not a desktop app (on the web).
const settingsOut = ({ account, device }: any) => ({
  autoPrepare: account.autoPrepare.on, autoPrepareLimitUsd: account.autoPrepare.maxCostMicro / 1e6, endAfterSilenceMinutes: account.endAfterSilenceMinutes, answerWait: account.answerWait,
  translation: device?.translation.on ?? null, translateInto: device?.translation.into ?? null, translateMe: device?.translation.translateMe ?? null, recognition: device?.recognition ?? null,
  hideFromScreenShare: device?.hideFromScreenShare ?? null, meetingDetection: device?.meetingDetection ?? null, otherSideInRoom: device?.otherSideInRoom ?? null,
});
const sectionInput = z.object({
  title: z.string().min(1).max(160).describe('A few words, as on a slide'),
  points: z.array(z.string().min(1).max(400)).max(12).default([]).describe('What the section says, one short phrase each'),
  minutes: z.number().min(0.5).max(240).nullable().optional().describe('Planned minutes, in halves (null shares what the talk\'s length leaves)'),
  fromSlide: z.number().int().min(1).max(300).nullable().optional().describe('The section\'s first slide in the deck'),
  toSlide: z.number().int().min(1).max(300).nullable().optional().describe('The section\'s last slide in the deck'),
  presenter: z.string().trim().max(80).nullable().optional().describe('With more than one presenter: the name of the other presenter who gives this section (Prepped writes nothing for the person to say in it and follows it by its slides); omitted or null: the person gives it'),
}).strict();
type SectionInput = z.infer<typeof sectionInput>;
const sectionOf = (section: SectionInput) => ({ id: newSectionId(), title: section.title, points: section.points.join('\n'), minutes: section.minutes === undefined || section.minutes === null ? null : Math.round(section.minutes * 2) / 2,
  slides: section.fromSlide && section.toSlide ? { from: section.fromSlide, to: section.toSlide } : null, presenter: section.presenter || null });

/** Setup fields given by the agent over the saved ones, of the meeting type the meeting or group will have. */
function mergedSetup(current: { mode: SessionMode; setup: Record<string, unknown> }, nextType: SessionMode, given?: Record<string, unknown>) {
  if (!given) return undefined;
  return nextType === current.mode ? { ...current.setup, ...given, mode: nextType } : { ...given, mode: nextType };
}

const describeTypes = (only?: SessionMode) => {
  const schema = z.toJSONSchema(sessionSetupSchema, { io: 'input' }) as { oneOf: { properties: Record<string, any> }[] };
  return Object.fromEntries(schema.oneOf.map(variant => {
    const mode = variant.properties.mode.const as SessionMode;
    const fields = Object.fromEntries(Object.entries(variant.properties).filter(([field]) => field !== 'mode').map(([field, value]) => [field,
      field in SETUP_FIELD_LIMITS ? { ...value, maxLength: SETUP_FIELD_LIMITS[field] } : value]));
    return [mode, fields];
  }).filter(([mode]) => !only || mode === only));
};

export const OPERATIONS: Operation[] = [
  operation({
    name: 'whoami', title: 'Who is signed in', effect: 'read',
    description: 'The Prepped account and service this agent is signed in to, the token\'s permissions (read, write, paid), the models available, and this computer\'s time zone. Run this first.',
    input: {},
    async run(context) {
      const client = await context.client();
      return { ...await client.request('GET', '/api/agent/me'), connection: { url: client.target.url, desktop: client.target.desktop }, timeZone: context.timeZone };
    },
  }),
  operation({
    name: 'types', title: 'Meeting types and their fields', effect: 'read', positional: 'type',
    description: 'The six meeting types and the setup fields each takes (with allowed values, defaults and length limits), as JSON Schema. Use it to fill `setup` in meetings_create, groups_create and their updates.',
    input: { type: type.optional() },
    async run(_context, input) { return { types: describeTypes(input.type) }; },
  }),

  // The switches people turn most (server/switches.ts): the account's, and in the desktop app this computer's.
  operation({
    name: 'settings_get', title: 'Show the switches', effect: 'read',
    description: 'The switches people turn most, under the names settings_update takes. The account\'s: automatic preparation and its limit per run, the minutes of silence after which a meeting ends by itself (null: never), and how long the other side\'s pause lasts before their turn is answered. This computer\'s, in the desktop app only (null on the web): the live translation beside the overlay, the language it translates into and whether it translates the person too; speech recognition (online, local on this computer, or cloud for an older setting); hiding the dashboard from screen sharing; meeting detection; and whether the other side is heard through a speaker in the room. A meeting\'s own switches are in meetings_get (answers, keepRecord, limitUsd, speed), a group\'s memory in groups_get, and a talk\'s slide following in talk_get.',
    input: {},
    async run(context) { return settingsOut(await (await context.client()).request('GET', '/api/settings/switches')); },
  }),
  operation({
    name: 'settings_update', title: 'Turn switches', effect: 'write',
    description: 'Turns the switches given and leaves the others. The device ones change the desktop app on this computer at once, as its Settings do: translation needs online speech recognition and a language (into); local recognition needs its speech model on this computer. The translation adds about 0.50 to 1.20 USD an hour of speech to the account\'s charges.',
    input: {
      autoPrepare: z.boolean().optional().describe('Prepare planned meetings with material by themselves'),
      autoPrepareLimitUsd: z.number().refine(value => (AUTO_PREPARE_LIMITS as readonly number[]).includes(Math.round(value * 1e6)), `One of ${AUTO_PREPARE_LIMITS.map(value => value / 1e6).join(', ')}`).optional().describe('The most one automatic preparation may spend, in USD'),
      endAfterSilenceMinutes: z.number().int().min(1).max(60).nullable().optional().describe('End a meeting after this many minutes without speech or use; null: never'),
      answerWait: z.enum(ANSWER_WAITS).optional().describe('How long the other side\'s pause lasts before their turn counts as finished and is answered: quick (0.8 s), balanced (1.5 s, the default) or patient (2.5 s, for people who pause mid-question)'),
      translation: z.boolean().optional().describe('Show the live translation beside the overlay (desktop app)'),
      translateInto: z.enum(TRANSLATION_LANGUAGES).optional().describe('The language the translation is written in, such as zh, en or ja'),
      translateMe: z.boolean().optional().describe('Translate the person\'s own speech too, not only the other side\'s'),
      recognition: z.enum(['online', 'local']).optional().describe('Speech recognition online, or on this computer'),
      hideFromScreenShare: z.boolean().optional().describe('Leave the dashboard out of screen sharing and screenshots (the overlay always is)'),
      meetingDetection: z.boolean().optional().describe('Offer to start a meeting when the microphone is in use'),
      otherSideInRoom: z.boolean().optional().describe('The other side is heard through a speaker or a phone in the room: the microphone hears them'),
    },
    async run(context, input) {
      const translation = { ...(input.translation !== undefined ? { on: input.translation } : {}), ...(input.translateInto ? { into: input.translateInto } : {}), ...(input.translateMe !== undefined ? { translateMe: input.translateMe } : {}) };
      const device = { ...(Object.keys(translation).length ? { translation } : {}), ...(input.recognition ? { recognition: input.recognition } : {}),
        ...(input.hideFromScreenShare !== undefined ? { hideFromScreenShare: input.hideFromScreenShare } : {}), ...(input.meetingDetection !== undefined ? { meetingDetection: input.meetingDetection } : {}),
        ...(input.otherSideInRoom !== undefined ? { otherSideInRoom: input.otherSideInRoom } : {}) };
      const autoPrepare = { ...(input.autoPrepare !== undefined ? { on: input.autoPrepare } : {}), ...(input.autoPrepareLimitUsd !== undefined ? { maxCostMicro: Math.round(input.autoPrepareLimitUsd * 1e6) } : {}) };
      return settingsOut(await (await context.client()).request('PATCH', '/api/settings/switches', { json: {
        ...(Object.keys(autoPrepare).length ? { autoPrepare } : {}), ...(input.endAfterSilenceMinutes !== undefined ? { endAfterSilenceMinutes: input.endAfterSilenceMinutes } : {}),
        ...(input.answerWait ? { answerWait: input.answerWait } : {}), ...(Object.keys(device).length ? { device } : {}),
      } }));
    },
  }),

  // Meetings
  operation({
    name: 'meetings_list', title: 'List meetings', effect: 'read',
    description: 'The account\'s meetings, newest change first, with their type, status (planned, live, completed), time, group and purpose.',
    input: { status: z.enum(['planned', 'live', 'completed']).optional(), group: uuid('group').optional(), search: z.string().max(200).optional().describe('Words in the title or purpose'),
      limit: z.number().int().min(1).max(200).optional().describe('At most this many (default 50)') },
    async run(context, input) {
      const { sessions } = await (await context.client()).request('GET', '/api/sessions');
      const words = input.search?.toLowerCase();
      const found = (sessions as any[]).filter(session => (!input.status || session.status === input.status) && (!input.group || session.groupId === input.group)
        && (!words || `${session.title} ${session.purpose}`.toLowerCase().includes(words)));
      return { meetings: found.slice(0, input.limit ?? 50).map(meetingBrief), total: found.length };
    },
  }),
  operation({
    name: 'meetings_get', title: 'Show a meeting', effect: 'read', positional: 'meeting',
    description: 'A meeting in full, with everything meetings_create and meetings_update set under the names they take (type, start, group, setup, purpose, participants, instructions, model, language, answers, keepRecord, limitUsd, speed), its documents (material_get reads one), its projects with their indexing state, its calendar event, its preparation and its rehearsals.',
    input: { meeting: uuid('meeting') },
    async run(context, input) {
      const client = await context.client();
      const detail = await client.request('GET', `/api/sessions/${input.meeting}`);
      const { prep } = await client.request('GET', `/api/sessions/${input.meeting}/prep`);
      const projects = await client.request('GET', `/api/sessions/${input.meeting}/projects`);
      // Its rehearsals (server/rehearsals.ts): each held in the app beforehand, apart from the meeting.
      const rehearsals = detail.session.rehearsalOf ? [] : (await client.request('GET', `/api/sessions/${input.meeting}/rehearsals`)).rehearsals as any[];
      return { meeting: meetingOut(detail.session), documents: detail.documents.map(documentOut), projects: projects.projects, groupProjects: projects.groupProjects, projectsElsewhere: projects.elsewhere ?? null,
        calendarEvent: detail.calendarEvent, preparation: prepOut(prep), transcriptPieces: detail.transcripts.length, messages: detail.messages.length,
        rehearsals: rehearsals.map(item => ({ id: item.id, status: item.status, startedAt: item.startedAt, endedAt: item.endedAt, durationSeconds: item.durationSeconds, costMicro: item.costMicro })) };
    },
  }),
  operation({
    name: 'meetings_record', title: 'Read a meeting\'s record', effect: 'read', positional: 'meeting',
    description: 'What was said and answered in a meeting: the transcript by speaker turn, and every question, answer and note Prepped wrote. format markdown gives the same as one Markdown text.',
    input: { meeting: uuid('meeting'), format: z.enum(['json', 'markdown']).optional().describe('json (default) or markdown') },
    async run(context, input) {
      const client = await context.client();
      if (input.format === 'markdown') return { markdown: (await client.download(`/api/sessions/${input.meeting}/export`)).data.toString('utf8') };
      const detail = await client.request('GET', `/api/sessions/${input.meeting}`);
      const session = detail.session;
      return {
        meeting: { id: session.id, title: session.title, type: session.mode, status: session.status, startedAt: session.startedAt, endedAt: session.endedAt, participants: session.participants },
        transcript: (detail.turns as any[]).map(turn => ({ source: turn.source, speaker: turn.speakerName ?? turn.speaker?.label ?? (turn.source === 'microphone' ? 'me' : null), startMs: turn.startMs, text: turn.text })),
        // Pieces saved outside a turn (typed by hand, or before turns existed).
        otherTranscript: (detail.transcripts as any[]).filter(piece => !piece.turnId).map(piece => ({ source: piece.source, at: piece.createdAt, text: piece.text })),
        messages: (detail.messages as any[]).map(message => ({ role: message.role === 'user' ? 'question' : 'answer', kind: message.kind, text: message.content, status: message.status, model: message.model ?? null, at: message.createdAt })),
      };
    },
  }),
  operation({
    name: 'meetings_create', title: 'Create a meeting', effect: 'write',
    description: 'Creates a planned meeting with its type, time, purpose, participants, setup fields, instructions, switches (when to answer, keeping its record, its spending limit, the provider\'s speed) and material (up to 8 documents; a folder of more goes in with projects_add). In a group, it starts from the group\'s setup.',
    input: { title: z.string().min(1).max(120), type: type.optional(), start: start.optional(), timeZone: timeZone.optional(), purpose: purpose.optional(),
      participants: participants.optional(), instructions: instructions.optional(), setup: setup.optional(), group: uuid('group').optional().describe('Put the meeting in this session group'),
      model: model.optional(), language: language.optional().describe('Answer language (default auto: the language of each question)'), ...meetingSwitches, ...materialInput },
    async run(context, input) {
      const material = await readMaterial(context, input);
      roomFor(0, material);
      const client = await context.client();
      // In a group of the same type, the given fields go over the group's setup, as the app's form starts from it.
      const group = input.group ? (await client.request('GET', `/api/groups/${input.group}`)).group as { mode: SessionMode; setup: Record<string, unknown> } : undefined;
      const mode = input.type ?? group?.mode ?? 'general';
      const meetingSetup = input.setup && (group ? mergedSetup(group, mode, input.setup) : { ...input.setup, mode });
      const { session } = await client.request('POST', '/api/sessions', { json: {
        title: input.title, mode, ...(input.start ? { scheduledAt: instant(input.start, zoneOf(context, input.timeZone)) } : {}), ...(input.purpose ? { purpose: input.purpose } : {}),
        ...(input.participants ? { participants: input.participants } : {}), ...(input.group ? { groupId: input.group } : {}), ...(input.model ? { model: input.model } : {}),
        ...(input.language ? { language: input.language } : {}), ...(meetingSetup ? { setup: meetingSetup } : {}),
      } });
      const later = { ...(input.instructions ? { instructions: input.instructions } : {}), ...switchesOf(input) };
      const meeting = Object.keys(later).length ? (await client.request('PATCH', `/api/sessions/${session.id}`, { json: later })).session : session;
      return { meeting: meetingOut(meeting), documents: (await attach(client, `/api/sessions/${session.id}`, material)).map(documentOut) };
    },
  }),
  operation({
    name: 'meetings_update', title: 'Change a meeting', effect: 'write', positional: 'meeting',
    description: 'Changes a meeting\'s title, type, time, purpose, participants, instructions, setup fields (only those given), group, model, language or switches (when to answer, keeping its record, its spending limit, the provider\'s speed). start null removes its time; group null takes it out of its group.',
    input: { meeting: uuid('meeting'), title: z.string().min(1).max(120).optional(), type: type.optional(), start: start.nullable().optional(), timeZone: timeZone.optional(),
      purpose: purpose.optional(), participants: participants.optional(), instructions: instructions.optional(), setup: setup.optional(),
      group: uuid('group').nullable().optional(), model: model.optional(), language: language.optional(), ...meetingSwitches },
    async run(context, input) {
      const client = await context.client();
      const { session } = await client.request('GET', `/api/sessions/${input.meeting}`);
      const mode = input.type ?? session.mode;
      const change = {
        ...(input.title !== undefined ? { title: input.title } : {}), ...(input.type ? { mode } : {}),
        ...(input.start !== undefined ? { scheduledAt: input.start === null ? null : instant(input.start, zoneOf(context, input.timeZone)) } : {}),
        ...(input.purpose !== undefined ? { purpose: input.purpose } : {}), ...(input.participants ? { participants: input.participants } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions } : {}), ...(input.group !== undefined ? { groupId: input.group } : {}),
        ...(input.model ? { model: input.model } : {}), ...(input.language ? { language: input.language } : {}),
        ...(input.setup ? { setup: mergedSetup(session, mode, input.setup) } : {}), ...switchesOf(input),
      };
      return { meeting: meetingOut((await client.request('PATCH', `/api/sessions/${input.meeting}`, { json: change })).session) };
    },
  }),
  operation({
    name: 'meetings_copy', title: 'Copy a meeting', effect: 'write', positional: 'meeting',
    description: 'A new planned meeting with everything of this one: setup, documents, project folders with their index, the talk, every preparation with its prepared answers, and its record. A meeting runs on one computer at a time; its copy can run at the same time on another.',
    input: { meeting: uuid('meeting'), title: z.string().trim().min(1).max(160).optional().describe('The copy\'s name (default: the meeting\'s)') },
    async run(context, input) {
      const { session } = await (await context.client()).request('POST', `/api/sessions/${input.meeting}/copy`, { json: input.title ? { title: input.title } : {} });
      return { meeting: meetingBrief(session) };
    },
  }),
  operation({
    name: 'meetings_delete', title: 'Delete a meeting', effect: 'delete', positional: 'meeting',
    description: 'Deletes a meeting with its transcript, answers, preparation and material. This cannot be undone; confirm with the person first.',
    input: { meeting: uuid('meeting') },
    async run(context, input) { return (await context.client()).request('DELETE', `/api/sessions/${input.meeting}`); },
  }),

  // Session groups and repeating meetings
  operation({
    name: 'groups_list', title: 'List session groups', effect: 'read',
    description: 'The account\'s session groups: meetings that share a setup and material, such as an interview process or a weekly team meeting, with each group\'s repeat rule (repeat, days, time, minutes, every, firstDate, timeZone) and whether its meetings keep a shared memory.',
    input: {},
    async run(context) {
      const { groups } = await (await context.client()).request('GET', '/api/groups');
      return { groups: (groups as any[]).map(group => ({ id: group.id, name: group.name, type: group.mode, meetings: group.sessionCount, ...repeatOut(group.recurrence), memory: group.memoryEnabled,
        followsCalendar: group.followsCalendar, updatedAt: group.updatedAt })) };
    },
  }),
  operation({
    name: 'groups_get', title: 'Show a session group', effect: 'read', positional: 'group',
    description: 'A group in full, with everything groups_create and groups_update set under the names they take: its name, type and setup, its repeat rule and the start times of its next meetings, its shared memory (on or off, and what it holds: decisions, action items, progress, facts and terms from earlier meetings), its documents (material_get reads one) and projects, its meetings, and its next planned meeting in full (where purpose, participants and instructions carry on).',
    input: { group: uuid('group') },
    async run(context, input) {
      const client = await context.client();
      const detail = await client.request('GET', `/api/groups/${input.group}`);
      const schedule = await client.request('GET', `/api/groups/${input.group}/schedule`);
      const memory = await client.request('GET', `/api/groups/${input.group}/memory`);
      const { projects } = await client.request('GET', `/api/groups/${input.group}/projects`);
      const planned = (detail.sessions as any[]).filter(session => session.status === 'planned').sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'))[0];
      return { group: groupOut(detail.group), schedule, memoryEntries: memory.entries, documents: (detail.documents as any[]).map(documentOut), projects,
        meetings: (detail.sessions as any[]).map(meetingBrief), nextMeeting: planned ? meetingOut(planned) : null };
    },
  }),
  operation({
    name: 'groups_create', title: 'Create a session group or a repeating meeting', effect: 'write',
    description: 'Creates a session group: meetings that share a setup and material. With repeat (weekly on days, or monthly) it is a series such as a weekly lab or team meeting: Prepped makes its next meeting by itself, each one starting from the group\'s setup and the previous meeting\'s purpose, participants and instructions. purpose, participants and instructions here go to the first meeting and carry on to the next ones. files, urls and text become the group\'s material, which every meeting of the group reads (up to 8 documents; a folder of more goes in with projects_add). memory turns the series\' shared memory on or off.',
    input: { name: z.string().min(1).max(120), type, setup: setup.optional(), ...repeatInput, purpose: purpose.optional(), participants: participants.optional(), instructions: instructions.optional(),
      memory: groupMemory.optional(), ...materialInput },
    async run(context, input) {
      if (!input.repeat && (input.purpose || input.participants || input.instructions)) throw new PreppedError('purpose, participants and instructions belong to the meetings of a repeating group. Give repeat, or create the meeting with meetings_create and group.');
      const rule = input.repeat ? repeatRule(input, context) : null;
      const material = await readMaterial(context, input);
      roomFor(0, material);
      const client = await context.client();
      const { group } = await client.request('POST', '/api/groups', { json: { name: input.name, mode: input.type, ...(input.setup ? { setup: { ...input.setup, mode: input.type } } : {}) } });
      // After the group exists, a failure says so, so the agent can carry on with it.
      try {
        if (input.memory !== undefined) await client.request('PUT', `/api/groups/${group.id}/memory/enabled`, { json: { enabled: input.memory } });
        const schedule = rule ? await client.request('PUT', `/api/groups/${group.id}/recurrence`, { json: { recurrence: rule } }) : null;
        const meetingChange = { ...(input.purpose ? { purpose: input.purpose } : {}), ...(input.participants ? { participants: input.participants } : {}), ...(input.instructions ? { instructions: input.instructions } : {}) };
        let firstMeeting = null;
        if (schedule?.made) {
          firstMeeting = Object.keys(meetingChange).length ? (await client.request('PATCH', `/api/sessions/${schedule.made}`, { json: meetingChange })).session
            : (await client.request('GET', `/api/sessions/${schedule.made}`)).session;
        }
        const documents = await attach(client, `/api/groups/${group.id}`, material);
        return { group: groupOut((await client.request('GET', `/api/groups/${group.id}`)).group), schedule: schedule && { recurrence: schedule.recurrence, next: schedule.next },
          firstMeeting: firstMeeting && meetingOut(firstMeeting), documents: documents.map(documentOut) };
      } catch (error) {
        if (error instanceof PreppedError) throw new PreppedError(`Group "${input.name}" was created (id ${group.id}), then this failed: ${error.message}`, error.status, error.code);
        throw error;
      }
    },
  }),
  operation({
    name: 'groups_update', title: 'Change a session group or its repeat rule', effect: 'write', positional: 'group',
    description: 'Changes a group\'s name, type or setup fields (only those given), sets its repeat rule (repeat weekly or monthly with days and time) or ends it (repeat none), and turns its shared memory on or off. purpose, participants and instructions change the group\'s next planned meeting, and the meetings after it carry them on.',
    input: { group: uuid('group'), name: z.string().min(1).max(120).optional(), type: type.optional(), setup: setup.optional(), ...repeatInput,
      repeat: z.enum(['weekly', 'monthly', 'none']).optional().describe('weekly or monthly sets a new repeat rule (see groups_create); none stops making meetings'),
      purpose: purpose.optional(), participants: participants.optional(), instructions: instructions.optional(), memory: groupMemory.optional() },
    async run(context, input) {
      const client = await context.client();
      const { group, sessions } = await client.request('GET', `/api/groups/${input.group}`);
      const mode = input.type ?? group.mode;
      if (input.name || input.type || input.setup) {
        await client.request('PATCH', `/api/groups/${input.group}`, { json: { ...(input.name ? { name: input.name } : {}), ...(input.type ? { mode } : {}), ...(input.setup ? { setup: mergedSetup(group, mode, input.setup) } : {}) } });
      }
      if (input.memory !== undefined) await client.request('PUT', `/api/groups/${input.group}/memory/enabled`, { json: { enabled: input.memory } });
      const schedule = input.repeat ? await client.request('PUT', `/api/groups/${input.group}/recurrence`, { json: { recurrence: input.repeat === 'none' ? null : repeatRule({ ...input, repeat: input.repeat }, context) } }) : null;
      const meetingChange = { ...(input.purpose ? { purpose: input.purpose } : {}), ...(input.participants ? { participants: input.participants } : {}), ...(input.instructions !== undefined ? { instructions: input.instructions } : {}) };
      let nextMeeting = null;
      if (Object.keys(meetingChange).length) {
        const current = (await client.request('GET', `/api/groups/${input.group}`)).sessions as any[];
        const planned = current.filter(session => session.status === 'planned').sort((a, b) => (a.scheduledAt ?? '9999').localeCompare(b.scheduledAt ?? '9999'))[0];
        if (!planned) throw new PreppedError(`The group has no planned meeting to change (it has ${sessions.length} meetings). Set a repeat rule, or create one with meetings_create and group.`);
        nextMeeting = meetingOut((await client.request('PATCH', `/api/sessions/${planned.id}`, { json: meetingChange })).session);
      }
      return { group: groupOut((await client.request('GET', `/api/groups/${input.group}`)).group), schedule: schedule && { recurrence: schedule.recurrence, next: schedule.next, made: schedule.made }, nextMeeting };
    },
  }),
  operation({
    name: 'groups_delete', title: 'Delete a session group', effect: 'delete', positional: 'group',
    description: 'Deletes a group and its shared material and stops its repeat rule. Its meetings stay, outside any group. Confirm with the person first.',
    input: { group: uuid('group') },
    async run(context, input) { return (await context.client()).request('DELETE', `/api/groups/${input.group}`); },
  }),

  // Material
  operation({
    name: 'material_add', title: 'Attach material', effect: 'write',
    description: 'Attaches files from this computer, web pages, or text to a meeting or a group (a group\'s material is read by all its meetings). Preparation and live answers read the material. Read the files the person points to, and attach the ones that matter for the meeting: a meeting or a group holds up to 8 documents (200,000 characters in all); a folder of more goes in with projects_add.',
    input: { meeting: uuid('meeting').optional(), group: uuid('group').optional(), ...materialInput },
    async run(context, input) {
      if (!input.files?.length && !input.urls?.length && input.text === undefined) throw new PreppedError('Give files, urls or text to attach.');
      const owner = ownerOf(input);
      const material = await readMaterial(context, input);
      const client = await context.client();
      // A meeting's own documents count toward its 8; its group's are the group's.
      const { documents } = await client.request('GET', owner);
      roomFor((documents as { groupId: string | null }[]).filter(document => input.group || !document.groupId).length, material);
      return { documents: (await attach(client, owner, material)).map(documentOut) };
    },
  }),
  operation({
    name: 'material_get', title: 'Read a document', effect: 'read',
    description: 'One document of a meeting\'s or a group\'s material with its whole text, as the answers read it (for a meeting, its own documents and its group\'s). meetings_get and groups_get list the documents.',
    input: { meeting: uuid('meeting').optional(), group: uuid('group').optional(), document: uuid('document') },
    async run(context, input) {
      const { document } = await (await context.client()).request('GET', `${ownerOf(input)}/documents/${input.document}`);
      return { document: { ...documentOut(document), text: document.text } };
    },
  }),
  operation({
    name: 'material_remove', title: 'Remove material', effect: 'delete',
    description: 'Removes one document from a meeting\'s or a group\'s material.',
    input: { meeting: uuid('meeting').optional(), group: uuid('group').optional(), document: uuid('document') },
    async run(context, input) { return (await context.client()).request('DELETE', `${ownerOf(input)}/documents/${input.document}`); },
  }),
  operation({
    name: 'projects_list', title: 'List project folders and repositories', effect: 'read',
    description: 'The project folders and code repositories of a meeting or a group, with their indexing state (indexing, ready, error) and file counts. For a meeting prepared on another computer, elsewhere says what of its projects differs on this one: folders that stay on that computer (missing), repositories at another commit or with changes not committed (changed), and projects not indexed here (unready); live answers here search only this computer\'s copy. Null when nothing differs.',
    input: { meeting: uuid('meeting').optional(), group: uuid('group').optional() },
    async run(context, input) { return (await context.client()).request('GET', `${ownerOf(input)}/projects`); },
  }),
  operation({
    name: 'projects_get', title: 'Show a project', effect: 'read', positional: 'project',
    description: 'A project folder or repository in full: its indexing state and size (truncated: it holds more files than Prepped indexes), its brief (the person\'s own explanation, which answers and preparation read first), its overview, and the AI coding tools whose memory files it is read with.',
    input: { project: uuid('project') },
    async run(context, input) { return (await context.client()).request('GET', `/api/knowledge/projects/${input.project}`); },
  }),
  operation({
    name: 'projects_update', title: 'Rename a project or write its brief', effect: 'write', positional: 'project',
    description: 'Changes a project\'s name, or its brief: what the project is and what matters in it, in the person\'s words, which answers and preparation read before its files. An empty brief removes it.',
    input: { project: uuid('project'), name: z.string().trim().min(1).max(80).optional(), brief: z.string().max(TEXT_LIMITS.brief).optional() },
    async run(context, input) {
      if (input.name === undefined && input.brief === undefined) throw new PreppedError('Give name or brief.');
      return (await context.client()).request('PATCH', `/api/knowledge/projects/${input.project}`, { json: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.brief !== undefined ? { brief: input.brief } : {}) } });
    },
  }),
  operation({
    name: 'projects_add', title: 'Add a project folder or repository', effect: 'write',
    description: 'Adds a folder on this computer, a GitHub repository, or another Git repository to a meeting or a group, so its answers and preparation can quote the person\'s real work. Prepped indexes it on this computer and only reads it. Desktop app only.',
    input: { meeting: uuid('meeting').optional(), group: uuid('group').optional(),
      folder: z.string().min(1).optional().describe('A folder on this computer'), github: z.string().min(1).optional().describe('owner/name or a github.com address'),
      git: z.string().min(1).optional().describe('A clone address on another Git host (https://…, ssh://… or user@host:path), never with a password in it'),
      ref: z.string().min(1).max(200).optional().describe('Branch, tag or commit for github or git'), name: z.string().min(1).max(120).optional().describe('Name shown for a folder') },
    async run(context, input) {
      const sources = [input.folder, input.github, input.git].filter(Boolean);
      if (sources.length !== 1) throw new PreppedError('Give one of folder, github or git.');
      const client = await context.client();
      const owner = ownerOf(input);
      if (input.folder) return client.request('POST', `${owner}/projects`, { json: { path: path.resolve(context.cwd, input.folder), ...(input.name ? { name: input.name } : {}) } });
      if (input.github) return client.request('POST', `${owner}/projects/github`, { json: { repository: input.github, ...(input.ref ? { ref: input.ref } : {}) } });
      return client.request('POST', `${owner}/projects/git`, { json: { address: input.git, ...(input.ref ? { ref: input.ref } : {}) } });
    },
  }),
  operation({
    name: 'projects_remove', title: 'Remove a project', effect: 'delete', positional: 'project',
    description: 'Removes a project from its meeting or group and deletes its index. A folder\'s files stay as they are.',
    input: { project: uuid('project') },
    async run(context, input) { return (await context.client()).request('DELETE', `/api/knowledge/projects/${input.project}`); },
  }),
  operation({
    name: 'projects_reindex', title: 'Index a project again', effect: 'write', positional: 'project',
    description: 'Reads a project folder again after its files changed, or downloads a repository\'s newest commit.',
    input: { project: uuid('project') },
    async run(context, input) { return (await context.client()).request('POST', `/api/knowledge/projects/${input.project}/reindex`); },
  }),

  // Preparation
  operation({
    name: 'prep_status', title: 'Preparation state', effect: 'read', positional: 'meeting',
    description: 'Whether a meeting\'s answers are prepared: the run\'s state and progress, its cost, and what automatic preparation will do.',
    input: { meeting: uuid('meeting') },
    async run(context, input) {
      const client = await context.client();
      const { prep } = await client.request('GET', `/api/sessions/${input.meeting}/prep`);
      const { auto } = await client.request('GET', `/api/sessions/${input.meeting}/auto-prep`);
      return { preparation: prepOut(prep), automatic: auto };
    },
  }),
  operation({
    name: 'prep_start', title: 'Prepare a meeting', effect: 'paid', positional: 'meeting',
    description: 'Starts preparing a meeting: Prepped reads its material and writes the likely questions with answers. It spends the account\'s credits up to maxCostUsd; tell the person the limit and get their agreement first. Planned meetings with material are also prepared by themselves; check prep_status first. Returns at once; follow it with prep_status.',
    input: { meeting: uuid('meeting'), maxCostUsd: z.number().min(0.001).max(5).describe('The most this preparation may spend, in US dollars'), model: model.optional().describe('Model to read and write with (default: the meeting\'s)'),
      questions: z.number().int().min(10).max(80).optional().describe('How many questions to prepare (default 40)') },
    async run(context, input) {
      const client = await context.client();
      const chosen = input.model ?? (await client.request('GET', `/api/sessions/${input.meeting}`)).session.model;
      const { estimate } = await client.request('POST', `/api/sessions/${input.meeting}/prep/estimate`, { json: { model: chosen, ...(input.questions ? { questionCount: input.questions } : {}) } });
      const { prep } = await client.request('POST', `/api/sessions/${input.meeting}/prep`, { json: { model: chosen, maxCostMicro: Math.round(input.maxCostUsd * 1_000_000), ...(input.questions ? { questionCount: input.questions } : {}) } });
      return { preparation: prepOut(prep), estimate };
    },
  }),
  operation({
    name: 'prep_pause', title: 'Pause a preparation', effect: 'write', positional: 'meeting',
    description: 'Pauses a meeting\'s running preparation; what is finished stays, and prep_start continues it.',
    input: { meeting: uuid('meeting') },
    async run(context, input) { return { preparation: prepOut((await (await context.client()).request('POST', `/api/sessions/${input.meeting}/prep/cancel`)).prep) }; },
  }),
  operation({
    name: 'prep_answers', title: 'Prepared answers', effect: 'read', positional: 'meeting',
    description: 'The questions and answers a meeting\'s preparation wrote, with their sources.',
    input: { meeting: uuid('meeting') },
    async run(context, input) {
      const { items } = await (await context.client()).request('GET', `/api/sessions/${input.meeting}/prep/items`);
      return { answers: (items as any[]).map(item => ({ category: item.category, question: item.question, answer: item.answer, sources: item.sources })) };
    },
  }),

  // A presentation's talk: its slides, draft script and outline. When the meeting is activated, Prepped writes what to
  // say on each slide; during the talk the desktop app follows the slides on screen and says what to say on each one.
  operation({
    name: 'talk_get', title: 'Show a presentation\'s talk', effect: 'read', positional: 'meeting',
    description: 'A presentation meeting\'s talk: its outline (sections with points, minutes and slides), the deck\'s slides, the whole draft script, whether the desktop app follows the slides on screen, and, while it is live, the slide on screen and what to say on it.',
    input: { meeting: uuid('meeting') },
    async run(context, input) { return talkOut((await (await context.client()).request('GET', `/api/sessions/${input.meeting}/talk`)).talk, true); },
  }),
  operation({
    name: 'talk_slides', title: 'Add a presentation\'s slides', effect: 'write',
    description: 'Gives a presentation meeting its deck: a PowerPoint file (.pptx) or a PDF of the slides on this computer, up to 80 MB. Prepped keeps each slide\'s text and speaker notes, adds them to the meeting\'s material, and replaces an earlier deck. The outline\'s sections are tied to slide ranges, and during the talk the desktop app follows the slide on screen.',
    input: { meeting: uuid('meeting'), file: z.string().min(1).describe('Path of the .pptx or .pdf'),
      follow: z.enum(['on', 'off']).optional().describe('Whether the desktop app reads which slide is on screen during the talk (default on)') },
    async run(context, input) {
      const full = path.resolve(context.cwd, input.file);
      if (!DECK_TYPES.includes(path.extname(full).toLowerCase())) throw new PreppedError(`${full}: the slides go in as a PowerPoint file (.pptx) or a PDF. Export the deck as one of them.`);
      const bytes = await readFile(full);
      if (bytes.length > DECK_BYTES) throw new PreppedError(`${full} is ${(bytes.length / 1048576).toFixed(1)} MB; the slides may be up to 80 MB. Export them without videos, or as a PDF.`);
      const form = new FormData();
      form.append('file', new Blob([bytes]), path.basename(full));
      if (input.follow !== undefined) form.append('follow', String(input.follow === 'on'));
      return talkOut((await (await context.client()).request('POST', `/api/sessions/${input.meeting}/talk/slides`, { form })).talk);
    },
  }),
  operation({
    name: 'talk_script', title: 'Set a presentation\'s draft script', effect: 'write',
    description: 'Gives a presentation meeting the person\'s draft script: what they plan to say, as a reference that the outline and what to say on each slide follow (content, order, examples); the wording is fitted to the slides and the time. Give `text`, or `file` (TXT, Markdown, DOCX or PDF on this computer); an empty text removes it.',
    input: { meeting: uuid('meeting'), text: z.string().max(60_000).optional().describe('The draft script'), file: z.string().min(1).optional().describe('Path of a file holding the draft script') },
    async run(context, input) {
      if ((input.text === undefined) === (input.file === undefined)) throw new PreppedError('Give either text or file.');
      const client = await context.client();
      if (input.text !== undefined) return talkOut((await client.request('PUT', `/api/sessions/${input.meeting}/talk/script`, { json: { text: input.text } })).talk);
      const full = path.resolve(context.cwd, input.file!);
      if (!SCRIPT_TYPES.includes(path.extname(full).toLowerCase())) throw new PreppedError(`${full}: the draft script goes in as TXT, Markdown, DOCX or PDF, or as text.`);
      const form = new FormData();
      form.append('file', new Blob([await readFile(full)]), path.basename(full));
      return talkOut((await client.request('PUT', `/api/sessions/${input.meeting}/talk/script`, { form })).talk);
    },
  }),
  operation({
    name: 'talk_outline', title: 'Set a presentation\'s outline', effect: 'write',
    description: 'Replaces a presentation\'s outline with these sections, in the order they are given. With a deck, give each section its slides (fromSlide, toSlide) so that the sections take the slides in order; the minutes add up to the talk\'s length (setup.durationMinutes), every presenter\'s part included. When others present parts of the talk, give each of their sections its presenter\'s name. What to say in each of the person\'s sections is written when the meeting is activated.',
    input: { meeting: uuid('meeting'), sections: z.array(sectionInput).min(1).max(24).describe('The talk\'s sections, first to last') },
    async run(context, input) {
      return talkOut((await (await context.client()).request('PUT', `/api/sessions/${input.meeting}/talk/outline`, { json: { sections: input.sections.map(sectionOf) } })).talk);
    },
  }),
  operation({
    name: 'talk_draft', title: 'Draft a presentation\'s outline', effect: 'paid', positional: 'meeting',
    description: 'Drafts a presentation\'s outline with the meeting\'s model from its slides, draft script, material and setup (title, audience, abstract, length), each section tied to its slides, and saves it in place of the current outline. One request; it spends a little of the account\'s credit, so tell the person first. Change it afterwards with talk_outline.',
    input: { meeting: uuid('meeting') },
    async run(context, input) {
      const client = await context.client();
      const { outline } = await client.request('POST', `/api/sessions/${input.meeting}/talk/outline/draft`, { json: {} });
      return talkOut((await client.request('PUT', `/api/sessions/${input.meeting}/talk/outline`, { json: outline })).talk);
    },
  }),
  operation({
    name: 'talk_follow', title: 'Follow a presentation\'s slides on screen', effect: 'write',
    description: 'Turns on or off whether the desktop app reads which slide is on the person\'s screen during the talk (with the provider\'s low-cost model with screen support, each time the screen settles on a new slide).',
    input: { meeting: uuid('meeting'), follow: z.enum(['on', 'off']).describe('on: follow the slides on screen; off: do not read the screen') },
    async run(context, input) { return talkOut((await (await context.client()).request('PUT', `/api/sessions/${input.meeting}/talk/follow`, { json: { follow: input.follow === 'on' } })).talk); },
  }),

  // Calendar
  operation({
    name: 'calendar_events', title: 'Calendar events', effect: 'read',
    description: 'Events of the person\'s connected calendars and imported invitations, with the meeting type each looks like, its call link, and the Prepped meeting already made from it (sessionId).',
    input: { days: z.number().int().min(1).max(60).optional().describe('From now, how many days ahead (default 14)') },
    async run(context, input) {
      const now = context.now();
      const { events } = await (await context.client()).request('GET', '/api/calendar/events', { query: { from: new Date(now.getTime() - 12 * 3_600_000).toISOString(), to: new Date(now.getTime() + (input.days ?? 14) * 86_400_000).toISOString() } });
      return { events: (events as any[]).filter(event => !event.hidden).map(event => ({ key: event.key, title: event.title, startsAt: event.startsAt, endsAt: event.endsAt, allDay: event.allDay,
        calendar: event.calendarName, joinUrl: event.joinUrl, organizer: event.organizer, attendees: event.attendeeCount, looksLike: event.guess?.mode ?? null,
        repeating: event.repeating, seriesGroup: event.seriesGroup, meeting: event.sessionId })) };
    },
  }),
  operation({
    name: 'calendar_setup', title: 'Set up a calendar event', effect: 'write', positional: 'event',
    description: 'Makes a planned Prepped meeting from a calendar event (its time, title, description, guests and call link), following the event when it moves. keepSeries puts every occurrence of a repeating event into one session group.',
    input: { event: z.string().min(1).max(600).describe('The event\'s key from calendar_events'), type: type.optional().describe('Meeting type (default: the type the event looks like)'),
      keepSeries: z.boolean().optional() },
    async run(context, input) {
      const { session } = await (await context.client()).request('POST', `/api/calendar/events/${encodeURIComponent(input.event)}/meeting`, { json: { ...(input.type ? { mode: input.type } : {}), ...(input.keepSeries ? { keepSeries: true } : {}) } });
      return { meeting: meetingOut(session) };
    },
  }),
  operation({
    name: 'calendar_import', title: 'Import an invitation', effect: 'write', positional: 'file',
    description: 'Reads a calendar invitation file (.ics, up to 2 MB) from this computer; its events can then be set up with calendar_setup.',
    input: { file: z.string().min(1).describe('Path of the .ics file') },
    async run(context, input) {
      const full = path.resolve(context.cwd, input.file);
      const form = new FormData();
      form.append('file', new Blob([await readFile(full)]), path.basename(full));
      return (await context.client()).request('POST', '/api/calendar/files', { form });
    },
  }),

  // Resumes
  operation({
    name: 'resumes_list', title: 'List resumes', effect: 'read',
    description: 'The person\'s resumes in the resume studio. A new meeting uses the most recently changed one as the person\'s background unless its setup names another (resumeId) or none.',
    input: {},
    async run(context) { return (await context.client()).request('GET', '/api/resumes'); },
  }),
  operation({
    name: 'resumes_get', title: 'Show a resume', effect: 'read', positional: 'resume',
    description: 'A resume\'s structured content (profile), layout and revision.',
    input: { resume: uuid('resume') },
    async run(context, input) { return (await context.client()).request('GET', `/api/resumes/${input.resume}`); },
  }),
  operation({
    name: 'resumes_import', title: 'Import a resume file', effect: 'write', positional: 'file',
    description: 'Imports a resume file from this computer (PDF, DOCX, TXT, Markdown, PNG or JPEG; a JSON file of resumes_get\'s profile is taken as it is). With read, Prepped then reads it into structured fields with a model, which spends credits (paid permission; ask the person first).',
    input: { file: z.string().min(1).describe('Path of the resume file'), title: z.string().min(1).max(160).optional(), read: z.boolean().optional(), model: model.optional().describe('Model for reading (default: Prepped\'s extraction model)') },
    async run(context, input) {
      const client = await context.client();
      const full = path.resolve(context.cwd, input.file);
      const form = new FormData();
      form.append('file', new Blob([await readFile(full)]), path.basename(full));
      if (input.title) form.append('title', input.title);
      const { resume } = await client.request('POST', '/api/resumes', { form });
      if (!input.read) return { resume };
      try {
        return await client.request('POST', `/api/resumes/${resume.id}/extract`, { json: { revision: resume.revision, ...(input.model ? { model: input.model } : {}) } });
      } catch (error) {
        if (error instanceof PreppedError) throw new PreppedError(`The resume was imported (id ${resume.id}), then reading it failed: ${error.message}`, error.status, error.code);
        throw error;
      }
    },
  }),
  operation({
    name: 'resumes_create', title: 'Create a resume', effect: 'write',
    description: 'Creates a resume from structured content: profile as resumes_get returns it (basics, experience, education, skills, …), and optionally a layout.',
    input: { title: z.string().min(1).max(160), profile: z.record(z.string(), z.unknown()), layout: z.record(z.string(), z.unknown()).optional() },
    async run(context, input) { return (await context.client()).request('POST', '/api/resumes', { json: input }); },
  }),
  operation({
    name: 'resumes_update', title: 'Change a resume', effect: 'write', positional: 'resume',
    description: 'Changes a resume\'s title, content or layout; each top-level part of profile given (such as experience) replaces that part. Earlier revisions stay.',
    input: { resume: uuid('resume'), title: z.string().min(1).max(160).optional(), profile: z.record(z.string(), z.unknown()).optional(), layout: z.record(z.string(), z.unknown()).optional() },
    async run(context, input) {
      const client = await context.client();
      const { resume } = await client.request('GET', `/api/resumes/${input.resume}`);
      return client.request('PATCH', `/api/resumes/${input.resume}`, { json: { revision: resume.revision, ...(input.title ? { title: input.title } : {}),
        ...(input.profile ? { profile: { ...resume.profile, ...input.profile } } : {}), ...(input.layout ? { layout: { ...resume.layout, ...input.layout } } : {}) } });
    },
  }),
  operation({
    name: 'resumes_export', title: 'Export a resume', effect: 'read', positional: 'resume',
    description: 'Saves a resume as a PDF, Word or JSON file on this computer.',
    input: { resume: uuid('resume'), format: z.enum(['pdf', 'docx', 'json']), output: z.string().min(1).optional().describe('File or folder to save to (default: the current folder, under the resume\'s title)') },
    async run(context, input) {
      const file = await (await context.client()).download(`/api/resumes/${input.resume}/export`, { format: input.format });
      const given = input.output ? path.resolve(context.cwd, input.output) : context.cwd;
      const target = path.extname(given) ? given : path.join(given, file.name ?? `resume.${input.format}`);
      await writeFile(target, file.data);
      return { path: target, bytes: file.data.length };
    },
  }),
  operation({
    name: 'resumes_delete', title: 'Delete a resume', effect: 'delete', positional: 'resume',
    description: 'Deletes a resume with its revisions and original file. Confirm with the person first.',
    input: { resume: uuid('resume') },
    async run(context, input) { return (await context.client()).request('DELETE', `/api/resumes/${input.resume}`); },
  }),

  // Question bank
  operation({
    name: 'questions_search', title: 'Search the question bank', effect: 'read',
    description: 'Interview questions in Prepped\'s question bank and the person\'s own, with whether the person saved or answered each.',
    input: { query: z.string().max(300).optional(), category: z.enum(QUESTION_CATEGORIES).optional(), difficulty: z.enum(DIFFICULTIES).optional(),
      track: z.string().max(80).optional().describe('A role track such as software-engineering, product-management, data-analytics, design, sales'),
      saved: z.boolean().optional(), answered: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional().describe('At most this many (default 20)'),
      language: z.enum(['en', 'zh', 'ja', 'ko', 'es', 'fr']).optional().describe('Show Prepped\'s library questions in this language (default en)') },
    async run(context, input) {
      const result = await (await context.client()).request('GET', '/api/question-bank', { query: { q: input.query, category: input.category, difficulty: input.difficulty, track: input.track,
        saved: input.saved ? '1' : undefined, answered: input.answered ? '1' : undefined, limit: input.limit ?? 20 } });
      return { total: result.total, questions: (result.questions as any[]).map(question => ({ id: question.id, text: (input.language && question.translations?.[input.language]?.text) || question.text,
        category: question.category, difficulty: question.difficulty ?? null, track: question.track ?? null, saved: question.saved, progress: question.progress ?? null })) };
    },
  }),
  operation({
    name: 'questions_get', title: 'Show a question and my answer', effect: 'read', positional: 'question',
    description: 'A question with what interviewers look for and a suggested approach, and the person\'s saved answer notes and review progress.',
    input: { question: z.string().min(1).max(100).describe('The question\'s id') },
    async run(context, input) {
      const client = await context.client();
      const { question } = await client.request('GET', `/api/question-bank/${encodeURIComponent(input.question)}`);
      const answer = await client.request('GET', `/api/question-bank/${encodeURIComponent(input.question)}/answer`);
      return { question, answer, frames: Object.fromEntries(Object.entries(ANSWER_FRAMES).map(([frame, parts]) => [frame, parts.map(([id, label]) => ({ id, label }))])) };
    },
  }),
  operation({
    name: 'questions_add', title: 'Add my own question', effect: 'write',
    description: 'Adds a question of the person\'s own to the question bank, such as one they were asked or expect.',
    input: { text: z.string().min(5).max(600), category: z.enum(QUESTION_CATEGORIES), lookFor: z.string().max(600).optional(), approach: z.string().max(1200).optional(),
      probes: z.array(z.string().min(3).max(400)).max(4).optional().describe('Follow-up questions'), language: language.optional() },
    async run(context, input) {
      const { language: questionLanguage, ...body } = input;
      return (await context.client()).request('POST', '/api/question-bank/mine', { json: body, query: { language: questionLanguage } });
    },
  }),
  operation({
    name: 'questions_answer', title: 'Write my answer notes', effect: 'write', positional: 'question',
    description: `Saves the person's answer notes for a question in a structure (frame) of parts: ${Object.entries(ANSWER_FRAMES).map(([frame, parts]) => `${frame} (${parts.map(([id]) => id).join(', ')})`).join('; ')}. Parts given replace those parts; spoken is the answer as they would say it.`,
    input: { question: z.string().min(1).max(100), frame: z.enum(FRAME_IDS).optional().describe('Default: the saved frame, or the one that fits the question'),
      parts: z.record(z.string(), z.string().max(4000)).optional(), followUps: z.array(z.string().max(2000)).max(4).optional(), spoken: z.string().max(8000).optional() },
    async run(context, input) {
      const client = await context.client();
      const route = `/api/question-bank/${encodeURIComponent(input.question)}`;
      const saved = (await client.request('GET', `${route}/answer`)).content as { frame: string; parts: Record<string, string>; followUps: string[]; spoken: string } | null;
      const frame = input.frame ?? saved?.frame ?? defaultFrame((await client.request('GET', route)).question.category, input.question);
      return client.request('PUT', `${route}/answer`, { json: { frame, parts: { ...saved?.parts, ...input.parts }, followUps: input.followUps ?? saved?.followUps ?? [], spoken: input.spoken ?? saved?.spoken ?? '' } });
    },
  }),
  operation({
    name: 'questions_save', title: 'Save a question', effect: 'write', positional: 'question',
    description: 'Saves a question to the person\'s saved questions (saved true), as its star in the app does, or takes it out (saved false). questions_get shows whether it is saved, and questions_search with saved true lists them.',
    input: { question: z.string().min(1).max(100).describe('The question\'s id'), saved: z.boolean() },
    async run(context, input) { return (await context.client()).request('PUT', `/api/question-bank/${encodeURIComponent(input.question)}/saved`, { json: { saved: input.saved } }); },
  }),
  operation({
    name: 'questions_review', title: 'Rate a practised answer', effect: 'write',
    description: 'Records how ready the person\'s answer is (1 needs work, 2 almost, 3 ready), which sets when the question comes back for review.',
    input: { question: z.string().min(1).max(100), rating: z.number().int().min(1).max(3) },
    async run(context, input) { return (await context.client()).request('POST', `/api/question-bank/${encodeURIComponent(input.question)}/review`, { json: { rating: input.rating } }); },
  }),
  operation({
    name: 'questions_spoken', title: 'Write the spoken answer', effect: 'paid', positional: 'question',
    description: 'Writes the person\'s answer as they would say it, from their notes for the question, with a model (spends credits; ask the person first). Parts left empty become one sentence in square brackets.',
    input: { question: z.string().min(1).max(100), model, language: language.optional().describe('Language of the spoken answer (default en)') },
    async run(context, input) { return (await context.client()).request('POST', `/api/question-bank/${encodeURIComponent(input.question)}/spoken`, { json: { model: input.model, ...(input.language ? { language: input.language } : {}) } }); },
  }),

  // Interview practice
  operation({
    name: 'practice_list', title: 'List practice runs', effect: 'read',
    description: 'The person\'s interview practice runs and their state.',
    input: {},
    async run(context) { return (await context.client()).request('GET', '/api/practice'); },
  }),
  operation({
    name: 'practice_get', title: 'Show a practice run', effect: 'read', positional: 'run',
    description: 'A practice run: its questions, the person\'s answers, feedback on each and the final report.',
    input: { run: uuid('practice run') },
    async run(context, input) { return (await context.client()).request('GET', `/api/practice/${input.run}`); },
  }),
  operation({
    name: 'practice_create', title: 'Create a practice run', effect: 'write',
    description: 'Creates an interview practice run, started and ready for answers: from question bank ids (questions), or from a meeting\'s expected and prepared questions (fromMeeting).',
    input: { title: z.string().min(1).max(160).optional().describe('Required with questions'), questions: z.array(z.string().min(1).max(100)).min(1).max(20).optional().describe('Question bank ids'),
      fromMeeting: uuid('meeting').optional(), model: model.describe('Model that gives feedback (a model id from whoami)'), language: language.optional().describe('Practice language (default en)'),
      resume: uuid('resume').optional(), jobDescription: z.string().max(8000).optional() },
    async run(context, input) {
      if (Boolean(input.questions) === Boolean(input.fromMeeting)) throw new PreppedError('Give either questions or fromMeeting.');
      const client = await context.client();
      const { run } = input.fromMeeting ? await client.request('POST', `/api/sessions/${input.fromMeeting}/practice`, { json: { model: input.model } })
        : await client.request('POST', '/api/practice', { json: { title: input.title ?? 'Practice', questionIds: input.questions, model: input.model, language: input.language ?? 'en',
          ...(input.resume ? { resumeId: input.resume } : {}), ...(input.jobDescription ? { jobDescription: input.jobDescription } : {}) } });
      return client.request('POST', `/api/practice/${run.id}/start`, { json: { revision: run.revision } });
    },
  }),
  operation({
    name: 'practice_answer', title: 'Answer a practice question', effect: 'write',
    description: 'Saves the person\'s typed answer to one question of a practice run.',
    input: { run: uuid('practice run'), question: z.string().min(1).max(100).describe('The question\'s id in the run'), text: z.string().max(12000) },
    async run(context, input) {
      const client = await context.client();
      const { run } = await client.request('GET', `/api/practice/${input.run}`);
      return client.request('PUT', `/api/practice/${input.run}/answers/${encodeURIComponent(input.question)}`, { json: { revision: run.revision, text: input.text, source: 'typed' } });
    },
  }),
  operation({
    name: 'practice_feedback', title: 'Get feedback on a practice answer', effect: 'paid',
    description: 'Reviews a saved practice answer for clarity, relevance and specificity, quoting the answer (spends credits; ask the person first).',
    input: { run: uuid('practice run'), question: z.string().min(1).max(100) },
    async run(context, input) {
      const client = await context.client();
      const { run } = await client.request('GET', `/api/practice/${input.run}`);
      return client.request('POST', `/api/practice/${input.run}/answers/${encodeURIComponent(input.question)}/feedback`, { json: { revision: run.revision } });
    },
  }),
  operation({
    name: 'practice_end', title: 'End a practice run', effect: 'write', positional: 'run',
    description: 'Ends a practice run and makes its report from the feedback given.',
    input: { run: uuid('practice run') },
    async run(context, input) {
      const client = await context.client();
      const { run } = await client.request('GET', `/api/practice/${input.run}`);
      return client.request('POST', `/api/practice/${input.run}/end`, { json: { revision: run.revision } });
    },
  }),
  operation({
    name: 'practice_delete', title: 'Delete a practice run', effect: 'delete', positional: 'run',
    description: 'Deletes a practice run with its answers and feedback. Confirm with the person first.',
    input: { run: uuid('practice run') },
    async run(context, input) { return (await context.client()).request('DELETE', `/api/practice/${input.run}`); },
  }),
];

export const OPERATION_BY_NAME = new Map(OPERATIONS.map(item => [item.name, item]));
