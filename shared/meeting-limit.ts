// Value used by the meeting API when there is no per-meeting spending limit, in micro-dollars.
export const NO_MEETING_LIMIT_MICRO = 100_000_000;
export const hasMeetingLimit = (micro: number): boolean => micro < NO_MEETING_LIMIT_MICRO;
