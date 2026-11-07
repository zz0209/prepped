// The stages of a job target (server/job-target.ts), shared with the coding agents' tools (agent/src/operations.ts).
export const JOB_STAGES = ['preparing', 'interviewing', 'offer', 'closed'] as const;
export type JobStage = typeof JOB_STAGES[number];
