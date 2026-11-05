import {z} from 'zod';

// Preparation that starts by itself for a planned meeting with material (server/auto-prep.ts), with the cost limit of
// each run in micro-dollars. Settings saved before 0.7.9 have none and take the default.
export const AUTO_PREPARE_LIMITS=[100_000,200_000,500_000,1_000_000,5_000_000] as const;
export const DEFAULT_AUTO_PREPARE={enabled:true,maxCostMicro:200_000};
export const autoPrepareSchema=z.object({enabled:z.boolean(),maxCostMicro:z.number().int().min(AUTO_PREPARE_LIMITS[0]).max(AUTO_PREPARE_LIMITS.at(-1)!)}).strict();
