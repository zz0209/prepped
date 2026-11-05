// The longest text, in characters, that each field sent to a model accepts. The server checks these limits and the
// dashboard shows them beside the field (src/TextLimit.tsx), so pasting a long text cannot run up the cost of every
// answer that uses it.
export const TEXT_LIMITS = {
  // A question typed in the dashboard or the overlay, or one heard from the other side (a transcript excerpt).
  question: 6000,
  // A transcript excerpt added or corrected by hand.
  transcript: 6000,
  purpose: 4000,
  instructions: 4000,
  // A meeting's setup goes with every answer: one-line fields, longer fields and the job description.
  setupLine: 500,
  setupArea: 2000,
  jobDescription: 8000,
  // The brief that preparation reads with the material.
  brief: 12000,
  practiceAnswer: 12000,
  actionInstruction: 2000,
  // A paragraph of a resume (summary, description, one highlight); its short fields take 500.
  resumeParagraph: 6000,
  resumeLine: 500,
  // One entry of a meeting series' shared memory (server/series-memory.ts).
  memoryEntry: 1000,
} as const;

// A meeting's or a group's documents (server/reference-documents.ts): how many, and their characters in all. Project
// folders and repositories are indexed apart and have no such limit.
export const MATERIAL_LIMITS = { documents: 8, characters: 200_000 } as const;
