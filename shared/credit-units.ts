// What a credit is (docs/CREDITS.md): the unit people see for what Prepped's AI work uses, and how a request's cost at
// its provider's price turns into credits. The plans, their prices and the rest of the subscription system are in
// shared/credits.ts; this part is also in the `prepped` command for coding tools (scripts/agent-bundle.mjs).

/** Integer units an account's credits are kept in (users.credits_micro, ledger.amount_micro, invites.credits_micro,
 *  referrals): a ten-thousandth of a credit. */
export const CREDIT_UNITS = 10_000;
/** The provider cost one credit stands for, in millionths of the provider's currency: 100 credits for US$1 of provider
 *  usage. At this rate a unit is a millionth of a dollar, so balances kept before credits had their own unit (when 100
 *  credits were sold for US$1) keep their number. */
export const COST_MICRO_PER_CREDIT = 10_000;

/** Credit units a request costing `costMicro` at its provider's price is charged. */
export const creditUnitsForCost = (costMicro: number): number => Math.ceil(costMicro * CREDIT_UNITS / COST_MICRO_PER_CREDIT);
/** Credits a provider cost stands for (for showing a cost that was metered, such as a meeting's or an answer's). */
export const creditsForCost = (costMicro: number): number => costMicro / COST_MICRO_PER_CREDIT;
/** The provider cost a number of credits allows (a meeting's own credit limit, kept as a cost cap). */
export const costForCredits = (credits: number): number => Math.round(credits * COST_MICRO_PER_CREDIT);
export const creditsFromUnits = (units: number): number => units / CREDIT_UNITS;
export const unitsForCredits = (credits: number): number => Math.round(credits * CREDIT_UNITS);

/** A number of credits as people read it: whole credits from 100, one decimal from 1, two below, and "<0.01" for a
 *  charge too small to show. */
export function formatCredits(credits: number, language?: string): string {
  const magnitude = Math.abs(credits);
  if (magnitude > 0 && magnitude < 0.01) return `${credits < 0 ? '-' : ''}<${new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(0.01)}`;
  const digits = magnitude >= 100 ? 0 : magnitude >= 1 ? 1 : 2;
  return new Intl.NumberFormat(language, { maximumFractionDigits: digits }).format(credits);
}
