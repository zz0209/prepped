import { z } from 'zod';
import { TEXT_LIMITS } from './text-limits.js';
import { INTERVIEW_FIELDS, INTERVIEW_ROUNDS } from './interview-fields.js';
import { AUTO_TRANSLATION, NO_TRANSLATION, TRANSLATION_LANGUAGES } from './meeting-options.js';
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
// The `.describe()` texts here are how a coding agent chooses each field from what the person says and the files they
// give (agent/src/operations.ts `types` shows them): when to choose each value, the default, and an example.
export const responseStyleSchema = z.object({
  form: z.enum(ANSWER_FORMS).default('plain').describe('How the person uses an answer while speaking. plain (default): an answer they say in their own words; keep it for interviews, recruiter calls and other live calls where they answer aloud. script: they read it aloud word for word ("read it out", "word for word", a scripted Q&A). cues: short cues they talk from, only when the person asks for keyword cards, and then not with length concise; cues leave out what to say, so a person answering a recruiter or an interviewer gets too little from them.'),
  length: z.enum(['concise', 'balanced', 'detailed']).default('concise').describe('Set it from what the person says about answers, never from the meeting type or their role. balanced: every meeting, talk and interview when the person says nothing about length; an open question then gets what they did, used and measured, and a short factual one stays short. concise: only when the person asks for short answers ("keep it short", "简短"). detailed: only when the person asks for detailed or in-depth answers ("详细"). A presenter in a lab meeting, a recruiter call or a 1:1 is still balanced unless they say otherwise.'),
  format: z.enum(['paragraphs', 'bullets', 'steps']).default('paragraphs').describe('paragraphs (default): answers said aloud, as in interviews and calls. bullets: only when the person asks for points to glance at. steps: answers that walk through a procedure.'),
  tone: z.enum(['professional', 'conversational', 'formal']).default('professional').describe('professional (default). conversational: casual settings, podcasts, friendly chats, or the person says "casual". formal: a board, officials, a committee or defense.'),
  tradeOffs: z.boolean().default(false).describe('true when answers should weigh options and their costs (design reviews, system design, decisions to make); default false.'),
  behavioral: z.enum(BEHAVIORAL_STRUCTURES).default('auto').describe('How answers about a past experience are built: auto (default) picks per story; star, car or soar only when the person names one; free for no structure.'),
  // A reply goes to the detailed length when the other side asks for depth (shared/response-style.ts); saved setups
  // without it take it on.
  depthOnRequest: z.boolean().default(true).describe('A reply goes detailed when the other side asks for depth (default true); leave it.'),
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
const style = {
  responseStyle: responseStyleSchema.optional().describe('How Prepped\'s answers read in this meeting. Give only the fields the person\'s words or the meeting call for; the others keep their defaults.'),
  expectedQuestions: expectedQuestionsSchema.default([]).describe('Questions the person says they expect or were sent, one each in their words; preparation writes an answer for each. Leave it empty rather than guess.'),
  speechLanguage: z.enum(SPEECH_LANGUAGES).default('auto').describe('The language spoken in the meeting, for speech recognition (the answer language is the meeting\'s language). auto (default): more than one language is spoken, or it is not known. One code when everyone speaks it: en, zh (Mandarin), yue (Cantonese), ja, ko. Example: an English podcast: en; a Japanese client and a Chinese-speaking person: auto.'),
  otherSide: z.enum(OTHER_SIDES).default('computer').describe('Where Prepped hears the other side. computer (default): a video call or call app on this computer. nearby: the same room, or a phone on speaker beside the computer (one microphone hears both sides; the person holds a button while they answer).'),
  resumeId: z.string().uuid().nullable().default(null).describe('The person\'s resume (resumes_list) that answers use as their background, in every meeting type. Left out, a new meeting takes the most recently changed one. A resume file the person gives: import it (resumes_import), write its content from the file with resumes_update (answers read the content; resumes_import with read has a model do it, paid), and give its id. null: the person wants none.'),
  translateInto: z.union([z.enum(TRANSLATION_LANGUAGES), z.literal(AUTO_TRANSLATION), z.literal(NO_TRANSLATION)]).nullable().optional()
    .describe('The live translation of the other side during this meeting, on whichever computer runs it: "auto" translates into the app\'s interface language there (use it when the person asks for translation); a language code only when the person names that language; "none" for no translation') };

const text = z.string().trim().max(SAVED_LIMIT).default('');
const describedText = (description: string) => text.describe(description);
// Exported for the coding agents' description of each meeting type (agent/src/operations.ts `types`).
export const sessionSetupSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('general'), ...style }).strict(),
  z.object({ mode: z.literal('research'), ...style }).strict(),
  z.object({ mode: z.literal('interview'), ...style,
    company: describedText('The company, as the person or the job posting names it.'),
    role: describedText('The job title, as in the posting or the invitation.'),
    // The field of the role (shared/interview-fields.ts); null until the person picks one or the role names one.
    field: z.enum(INTERVIEW_FIELDS).nullable().default(null).describe('The field of the role, which decides what answers draw on and which rounds fit: software for engineers of any kind, data for data scientists, analysts and ML engineers, product for product managers, and so on. Choose it from the role and the job description; a coding or system design round with no role named is software. null (default) guesses it from the role.'),
    round: z.enum(INTERVIEW_ROUNDS).default('screening').describe('What this round is, from the invitation or the person\'s words. screening (default): a recruiter or intro call. Examples: "second round, technical" → technical; live coding on CoderPad or LeetCode → coding; "design a URL shortener" → system-design; "tell me about a time" questions → behavioral; several interviewers at once → panel; the last round → final.'),
    interviewers: describedText('The interviewers\' names and roles, if the person or the invitation gives them.'),
    jobDescription: describedText('The job posting\'s text (responsibilities and requirements), from the file or page the person gives; leave it empty without one.'),
    answerStyle: z.enum(['star', 'concise', 'detailed']).default('concise').describe('The older form of responseStyle, used only when responseStyle is not given; set responseStyle instead.'),
  }).strict(),
  z.object({ mode: z.literal('meeting'), ...style,
    agenda: describedText('The topics in order, from the invitation or the person\'s notes.'),
    myRole: z.enum(MEETING_ROLES).default('participant').describe('The person\'s part. participant (default): attends and speaks when asked, as in a 1:1 or a client call. host: runs the meeting. presenter: reports or presents in it, such as their progress in a lab meeting or numbers in a review. observer: mostly listens.'),
    decisions: describedText('The decisions the meeting has to reach, if the person names any.'),
    goals: describedText('What the person wants from the meeting, in a line.'),
  }).strict(),
  z.object({ mode: z.literal('media'), ...style,
    myRole: z.enum(MEDIA_ROLES).default('interviewee').describe('interviewee (default): the person is interviewed or a guest. interviewer: the person hosts or asks the questions.'),
    outlet: describedText('The publication, show or podcast.'),
    hostOrGuests: describedText('The host (or, for an interviewer, the guests), with their roles.'),
    topic: describedText('What the interview is about.'),
    audience: describedText('Who reads, watches or listens.'),
    keyMessages: describedText('The points the person wants to get across, in their words, one per line.'),
    offLimitTopics: describedText('Topics the person wants to stay away from.'),
    questionOutline: describedText('Questions the host sent in advance.'),
  }).strict(),
  z.object({ mode: z.literal('presentation'), ...style,
    title: describedText('The talk\'s title, from the person, the deck\'s first slide or the invitation.'),
    audience: describedText('Who listens: a thesis committee, the team, investors, a conference.'),
    abstract: describedText('What the talk covers, in a few sentences, from the person, the deck or the paper.'),
    durationMinutes: z.number().int().min(1).max(240).nullable().default(null).describe('The talk\'s length in minutes, as the person or the invitation gives it; the outline\'s minutes add up to it. null: not known.'),
  }).strict(),
]).transform(setup => ({ ...setup, responseStyle: setup.responseStyle ?? {
  ...defaultResponseStyle(),
  length: setup.mode === 'interview' && setup.answerStyle === 'detailed' ? 'detailed' as const : 'concise' as const,
  behavioral: setup.mode === 'interview' && setup.answerStyle === 'star' ? 'star' as const : 'auto' as const,
} }));

export type SessionSetup = z.infer<typeof sessionSetupSchema>;
