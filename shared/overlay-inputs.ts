import { z } from 'zod';

export const BUILTIN_ACTION_IDS = [
  'answer', 'screenshot', 'coding', 'say', 'recap', 'follow-up', 'agent-questions',
  'shorter', 'detail', 'example', 'retry', 'translate',
] as const;
export type BuiltinActionId = typeof BUILTIN_ACTION_IDS[number];
export const TEMPLATE_KEYS = ['interview', 'coding', 'meeting', 'general', 'media', 'presentation', 'research'] as const;
export type TemplateKey = typeof TEMPLATE_KEYS[number];
export const MAX_TEMPLATE_ACTIONS = 8;
export const customActionId = z.string().regex(/^custom:[a-z0-9-]{1,40}$/);
export const actionId = z.union([z.enum(BUILTIN_ACTION_IDS), customActionId]);
export const quickActionsChange = z.partialRecord(
  z.enum(TEMPLATE_KEYS), z.array(actionId).min(1).max(MAX_TEMPLATE_ACTIONS).nullable(),
);

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const appearanceSchema = z.object({
  layout: z.enum(['answer', 'list']), glass: z.boolean(), size: z.enum(['small', 'medium', 'large']),
  colors: z.object({ background: color, text: color }).strict(),
  opacity: z.number().min(0.2).max(1),
}).strict();
export const appearanceChange = appearanceSchema.partial().extend({
  opacity: appearanceSchema.shape.opacity.multipleOf(0.05).optional(),
  preset: z.enum(['dark', 'light', 'contrast', 'glass']).optional().describe('Sets colors and glass together. Explicit colors or glass override the preset.'),
}).strict();
