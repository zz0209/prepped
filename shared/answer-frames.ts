// The structures a person can write an interview answer in (the question bank's answer builder, src/QuestionWorkspace.tsx):
// each frame is an ordered list of parts. The service stores the parts by id and uses the English names in prompts.

export const ANSWER_FRAMES = {
  star: [['situation', 'Situation'], ['task', 'Task'], ['action', 'What I did'], ['result', 'Result']],
  ppf: [['present', 'Where I am now'], ['past', 'What led here'], ['future', 'Next step']],
  project: [['problem', 'Problem'], ['role', 'My role'], ['decisions', 'Key decisions'], ['outcome', 'Outcome']],
  prep: [['point', 'Point'], ['reason', 'Reason'], ['example', 'Example'], ['close', 'Back to the role']],
  growth: [['weakness', 'The weakness'], ['impact', 'When it shows'], ['steps', 'What I am doing about it'], ['progress', 'Progress so far']],
  approach: [['clarify', 'Clarify'], ['approach', 'Approach'], ['tradeoffs', 'Trade-offs'], ['evidence', 'Where I have done this']],
  design: [['requirements', 'Requirements and scale'], ['overview', 'High-level design'], ['deepdive', 'Deep dive'], ['scaling', 'Bottlenecks and scaling']],
  ask: [['why', 'Why I ask'], ['listen', 'What to listen for'], ['followup', 'My follow-up']],
  direct: [['answer', 'Answer'], ['detail', 'Supporting detail'], ['close', 'Back to the role']],
} as const satisfies Record<string, readonly (readonly [string, string])[]>;
export type AnswerFrame = keyof typeof ANSWER_FRAMES;
export const FRAME_IDS = Object.keys(ANSWER_FRAMES) as [AnswerFrame, ...AnswerFrame[]];

// Library questions whose category does not name the frame that fits them.
const QUESTION_FRAMES: Record<string, AnswerFrame> = {
  'aside-greatest-weakness': 'growth', 'aside-greatest-strength': 'prep', 'aside-portfolio-walkthrough': 'project', 'aside-research-summary': 'project', 'aside-gpa-question': 'direct',
};

/** The frame a question starts with, from the question or its category; the person can choose another. */
export function defaultFrame(category: string, questionId = ''): AnswerFrame {
  if (QUESTION_FRAMES[questionId]) return QUESTION_FRAMES[questionId];
  switch (category) {
    case 'behavioral': return 'star';
    case 'background': return 'ppf';
    case 'role-fit': return 'prep';
    case 'situational': case 'technical': case 'case': return 'approach';
    case 'system-design': case 'object-oriented-design': return 'design';
    case 'questions-to-ask': return 'ask';
    case 'logistics': return 'direct';
    default: return 'prep';
  }
}

/** Spoken length that usually works for a frame, in seconds; null where the conversation sets the length (system design). */
export const FRAME_TARGET_SECONDS: Record<AnswerFrame, readonly [number, number] | null> = {
  star: [90, 150], ppf: [60, 120], project: [90, 180], prep: [45, 90], growth: [45, 90], approach: [60, 150], design: null, ask: [10, 30], direct: [15, 45],
};

/** Days until a question comes back for review after each box of the review schedule. */
export const REVIEW_DAYS = [0, 1, 3, 7, 14, 30] as const;
export type ReviewRating = 1 | 2 | 3;

/** The next box after a rating: 1 (needs work) starts over, 2 (almost) keeps the box (at least 1), 3 (ready) moves on, to at least 2. */
export function nextBox(box: number, rating: ReviewRating): number {
  if (rating === 1) return 0;
  if (rating === 2) return Math.max(1, box);
  return Math.min(REVIEW_DAYS.length - 1, Math.max(2, box + 1));
}
