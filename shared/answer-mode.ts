import {z} from 'zod';
import type {SessionMode} from './session-setup.js';

// How a live meeting answers the other side: every turn they finish (each one a paid request), the turns the question
// rules (server/questions.ts) recognize as a question or request, or only when the person asks.
export const ANSWER_MODES=['every','judged','manual'] as const;
export type AnswerMode=typeof ANSWER_MODES[number];
export const answerModeSchema=z.enum(ANSWER_MODES);
// A new meeting's answer mode by meeting type: the one place to change the default. Saved meetings keep theirs.
export const DEFAULT_ANSWER_MODE:Record<SessionMode,AnswerMode>={interview:'judged',general:'judged',meeting:'judged',media:'judged',presentation:'judged',research:'judged'};

// How long a speaker's pause has to last before their turn counts as finished and is judged and answered
// (desktop/asr/turns.cjs, src/audio.ts); one setting of the account. In recorded meetings (AMI and AliMeeting,
// scripts/turn-pause-stats.py) a speaker paused inside an unfinished question for longer than 0.8 s in about 4 of 100
// questions, longer than 1.5 s in about 2, and longer than 2.5 s in fewer than 1.
export const ANSWER_WAITS=['quick','balanced','patient'] as const;
export type AnswerWait=typeof ANSWER_WAITS[number];
export const answerWaitSchema=z.enum(ANSWER_WAITS);
export const ANSWER_WAIT_MS:Record<AnswerWait,number>={quick:800,balanced:1500,patient:2500};
export const DEFAULT_ANSWER_WAIT:AnswerWait='balanced';

// What became of the other side's latest turn that did not get a complete automatic answer: it may be for the person
// (the turn judge's 'ask', server/question-judge.ts), a newer question arrived before it was answered, or its answer
// failed or was stopped.
export const HEARD_OUTCOMES=['maybe','superseded','unfinished'] as const;
export type HeardOutcome=typeof HEARD_OUTCOMES[number];
