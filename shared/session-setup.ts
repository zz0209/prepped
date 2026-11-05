import { z } from 'zod';
import { HttpError } from './http-error.js';
import { TEXT_LIMITS } from './text-limits.js';
import { INTERVIEW_FIELDS, INTERVIEW_ROUNDS } from './interview-fields.js';
export { INTERVIEW_FIELDS, INTERVIEW_ROUNDS };

export const SESSION_MODES = ['general', 'meeting', 'interview', 'media', 'presentation', 'research'] as const;
export type SessionMode = typeof SESSION_MODES[number];
// Every answer of a meeting sends its setup in full, so each text field has a length limit: one-line fields, longer
// fields, and the job description.
const LINE = TEXT_LIMITS.setupLine, AREA = TEXT_LIMITS.setupArea;
// The limit of each text field of every meeting type.
export const SETUP_FIELD_LIMITS: Record<string, number> = {
  company: LINE, role: LINE, interviewers: LINE, jobDescription: TEXT_LIMITS.jobDescription,
  agenda: AREA, decisions: AREA, goals: LINE,
  outlet: LINE, hostOrGuests: LINE, topic: AREA, audience: LINE,
  keyMessages: AREA, offLimitTopics: AREA, questionOutline: AREA,
  title: LINE, abstract: AREA,
};
// Each text field as the setup form names it, for the message about a field over its limit.
const SETUP_FIELD_NAMES: Record<string, string> = {
  company: 'Company', role: 'Target role', interviewers: 'Interviewers and roles', jobDescription: 'Job description',
  agenda: 'Agenda', decisions: 'Decisions to make', goals: 'Meeting goals',
  outlet: 'Publication or program', hostOrGuests: 'Host or guests', topic: 'Interview topic', audience: 'Audience',
  keyMessages: 'Key messages', offLimitTopics: 'Topics to avoid', questionOutline: 'Question outline',
  title: 'Presentation title', abstract: 'Abstract',
};
// Setups saved before 0.7.1, when every text field took up to 12,000 characters, are kept as they were saved: the
// schema takes that much, and parseSessionSetup holds a changed field to its limit.
const SAVED_LIMIT = 12000;
// How answers to questions about a past experience are organized: a fixed structure, the one that fits each story
// (auto), or none beyond the answer format (free).
export const BEHAVIORAL_STRUCTURES = ['auto', 'star', 'car', 'soar', 'free'] as const;
export type BehavioralStructure = typeof BEHAVIORAL_STRUCTURES[number];
// How the person uses an answer while speaking (shared/response-style.ts): reads it aloud word for word (script), says
// a plain answer in their own words (plain), or talks from cues (cues).
export const ANSWER_FORMS = ['plain', 'script', 'cues'] as const;
export type AnswerForm = typeof ANSWER_FORMS[number];
export const responseStyleSchema = z.object({
  form: z.enum(ANSWER_FORMS).default('plain'),
  length: z.enum(['concise', 'balanced', 'detailed']).default('concise'),
  format: z.enum(['paragraphs', 'bullets', 'steps']).default('paragraphs'),
  tone: z.enum(['professional', 'conversational', 'formal']).default('professional'),
  tradeOffs: z.boolean().default(false),
  behavioral: z.enum(BEHAVIORAL_STRUCTURES).default('auto'),
  // A reply goes to the detailed length when the other side asks for depth (shared/response-style.ts); saved setups
  // without it take it on.
  depthOnRequest: z.boolean().default(true),
}).strict();
export type ResponseStyle = z.infer<typeof responseStyleSchema>;
export function defaultResponseStyle(): ResponseStyle { return responseStyleSchema.parse({}); }
export const MEETING_ROLES = ['host', 'presenter', 'participant', 'observer'] as const;
export const MEDIA_ROLES = ['interviewee', 'interviewer'] as const;
// Questions the person expects in this conversation; preparation writes an answer for each.
export const expectedQuestionsSchema = z.array(z.string().trim().min(3).max(600)).max(40);
// The language people speak in the conversation, for speech recognition; 'auto' leaves it to the recognizer.
export const SPEECH_LANGUAGES = ['auto', 'en', 'zh', 'yue', 'ja', 'ko'] as const;
export type SpeechLanguage = typeof SPEECH_LANGUAGES[number];
export const SPEECH_LANGUAGE_NAMES: Record<Exclude<SpeechLanguage, 'auto'>, string> = { en: 'English', zh: '中文（普通话）', yue: '粤语', ja: '日本語', ko: '한국어' };
// Where Prepped hears the other side (docs/MOBILE.md, phone calls): on this computer, which plays them (a video call, a
// call app, or a phone call answered on the computer), while the microphone is the person; or nearby, where one
// microphone hears both sides (a phone on speaker beside it, the same room) and the person holds a button while they
// answer, so their words are kept as theirs. A phone's own meeting always hears the other side nearby.
export const OTHER_SIDES = ['computer', 'nearby'] as const;
export type OtherSide = typeof OTHER_SIDES[number];
// `resumeId`: the person's resume that answers and preparation use as their background, in every type of meeting; null
// when the person chose none. New meetings start with the most recently updated resume (server/groups.ts
// newestResumeId); before 0.24.0 only interviews had one.
const style = { responseStyle: responseStyleSchema.optional(), expectedQuestions: expectedQuestionsSchema.default([]), speechLanguage: z.enum(SPEECH_LANGUAGES).default('auto'),
  otherSide: z.enum(OTHER_SIDES).default('computer'), resumeId: z.string().uuid().nullable().default(null) };

const text = z.string().trim().max(SAVED_LIMIT).default('');
// Exported for the coding agents' description of each meeting type (agent/src/operations.ts `types`).
export const sessionSetupSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('general'), ...style }).strict(),
  z.object({ mode: z.literal('research'), ...style }).strict(),
  z.object({ mode: z.literal('interview'), ...style, company: text, role: text,
    // The field of the role (shared/interview-fields.ts); null until the person picks one or the role names one.
    field: z.enum(INTERVIEW_FIELDS).nullable().default(null),
    round: z.enum(INTERVIEW_ROUNDS).default('screening'),
    interviewers: text, jobDescription: text,
    answerStyle: z.enum(['star', 'concise', 'detailed']).default('concise'),
  }).strict(),
  z.object({ mode: z.literal('meeting'), ...style, agenda: text, myRole: z.enum(MEETING_ROLES).default('participant'), decisions: text, goals: text }).strict(),
  z.object({ mode: z.literal('media'), ...style, myRole: z.enum(MEDIA_ROLES).default('interviewee'), outlet: text, hostOrGuests: text,
    topic: text, audience: text, keyMessages: text, offLimitTopics: text, questionOutline: text,
  }).strict(),
  z.object({ mode: z.literal('presentation'), ...style, title: text, audience: text, abstract: text, durationMinutes: z.number().int().min(1).max(240).nullable().default(null) }).strict(),
]).transform(setup => ({ ...setup, responseStyle: setup.responseStyle ?? {
  ...defaultResponseStyle(),
  length: setup.mode === 'interview' && setup.answerStyle === 'detailed' ? 'detailed' as const : 'concise' as const,
  behavioral: setup.mode === 'interview' && setup.answerStyle === 'star' ? 'star' as const : 'auto' as const,
} }));

export type SessionSetup = z.infer<typeof sessionSetupSchema>;
export function defaultSessionSetup(mode: SessionMode): SessionSetup { return sessionSetupSchema.parse({ mode }); }
/**
 * A setup the person sends, of the conversation's type, with each text field within its limit (SETUP_FIELD_LIMITS).
 * A field that still holds what `kept` (the meeting's or group's saved setup, or the group a new meeting copies) has
 * keeps it, so a setup saved before the limits can be sent back unchanged; the message names the field over its limit.
 */
export function parseSessionSetup(mode: SessionMode, input?: unknown, kept?: SessionSetup | null): SessionSetup {
  const setup = ofMode(mode, sessionSetupSchema.parse(input ?? { mode }));
  for (const [field, limit] of Object.entries(SETUP_FIELD_LIMITS)) {
    const value = (setup as Record<string, unknown>)[field];
    if (typeof value !== 'string' || value.length <= limit || value === (kept as Record<string, unknown> | null | undefined)?.[field]) continue;
    throw new HttpError(400, `${SETUP_FIELD_NAMES[field]} takes up to ${limit.toLocaleString('en')} characters; it has ${value.length.toLocaleString('en')}.`);
  }
  return setup;
}
/** A setup read from the database, or one kept from a saved meeting or group. */
export function readSessionSetup(mode: SessionMode, saved?: unknown): SessionSetup {
  return ofMode(mode, sessionSetupSchema.parse(saved ?? { mode }));
}
function ofMode(mode: SessionMode, setup: SessionSetup) {
  if (setup.mode !== mode) throw new HttpError(400, 'Session setup must match the selected conversation type.');
  return setup;
}

// A setup saved before 0.6.0, when STAR was an answer format and answers had no trade-off rule. A saved setup without
// an answer style took it from the interview answerStyle. The conversion keeps what each saved meeting asked of its
// answers: STAR becomes the past-experience structure with paragraphs, every other format keeps no structure, and the
// trade-off rule stays off (tests/response-style.test.ts).
const savedStyleSchema = z.object({
  length: z.enum(['concise', 'balanced', 'detailed']).default('concise'),
  format: z.enum(['paragraphs', 'bullets', 'steps', 'star']).default('paragraphs'),
  tone: z.enum(['professional', 'conversational', 'formal']).default('professional'),
}).strict();
export function migrateSavedSetup(saved: unknown): unknown {
  const setup = z.object({ mode: z.enum(SESSION_MODES), responseStyle: z.unknown().optional(), answerStyle: z.string().optional() }).passthrough().parse(saved);
  const style = savedStyleSchema.parse(setup.responseStyle ?? {
    length: setup.mode === 'interview' && setup.answerStyle === 'detailed' ? 'detailed' : 'concise',
    format: setup.mode === 'interview' && setup.answerStyle === 'star' ? 'star' : 'paragraphs',
  });
  return { ...setup, responseStyle: { length: style.length, format: style.format === 'star' ? 'paragraphs' : style.format, tone: style.tone,
    tradeOffs: false, behavioral: style.format === 'star' ? 'star' : 'free' } };
}

// Setups saved from 0.6.0 to 0.21.1 had a rule to lead every answer with its conclusion. The order of an answer now
// comes from the kind of question in each meeting type (server/answer-guides), so the saved rule is dropped once
// (server/domain.ts).
export function dropAnswerLead(saved: unknown): unknown {
  const setup = z.object({ responseStyle: z.object({ leadWithAnswer: z.boolean().optional() }).passthrough().optional() }).passthrough().parse(saved);
  if (!setup.responseStyle) return setup;
  const { leadWithAnswer: _dropped, ...responseStyle } = setup.responseStyle;
  return { ...setup, responseStyle };
}
