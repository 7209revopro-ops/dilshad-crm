/**
 * Assertions about how auto-assign spread a batch of leads.
 *
 * The pool is leaders *and* members, deduped, minus anyone marked inactive —
 * the same pool the scheduled daily split uses. Leaders taking part is
 * deliberate (teamService: "so leaders participate here exactly like they do at
 * the daily split time"), so every expectation here counts them in.
 *
 * These check the shape of the split rather than exact per-person numbers.
 * Six leads across four people is 2/2/1/1, and which two get the extra depends
 * on existing load — pinning that would be testing the tie-break, not the rule.
 */
import { expect } from "bun:test";

export function countBy(results: { assignedTo: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.assignedTo] = (counts[r.assignedTo] ?? 0) + 1;
  return counts;
}

/**
 * Every lead went to somebody in `pool`, everybody in `pool` got at least one,
 * and nobody got more than one more than anybody else.
 */
export function expectSplitAcross(results: { assignedTo: string }[], pool: string[]): void {
  const counts = countBy(results);
  const got = Object.keys(counts);

  for (const id of got) expect(pool).toContain(id);
  for (const id of pool) expect(counts[id] ?? 0).toBeGreaterThan(0);

  const numbers = pool.map((id) => counts[id] ?? 0);
  expect(Math.max(...numbers) - Math.min(...numbers)).toBeLessThanOrEqual(1);
}

/** Nobody in `excluded` received anything. */
export function expectNothingFor(results: { assignedTo: string }[], excluded: string[]): void {
  const counts = countBy(results);
  for (const id of excluded) expect(counts[id] ?? 0).toBe(0);
}
