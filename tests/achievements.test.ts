import { expect, it } from 'vitest';
import { earnedAchievements } from '../src/game/achievements';
import type { RunResult } from '../src/game/types';
const base: RunResult = { level: 1, score: 0, stars: 0, served: 0, failed: 0, bestCombo: 0, revenue: 0, ingredientCost: 0, profit: 0, tips: 0, wasted: 0, wasteCost: 0, wasteBreakdown: [] };
const ids = (r: RunResult) => earnedAchievements(r).map(a => a.id);
it('awards nothing for an empty run, not even zero-waste', () => {
  expect(ids(base)).toEqual([]);
});
it('awards badges from combo, perfect heat, throws, tips and a clean service', () => {
  const run = { ...base, served: 6, bestCombo: 5, perfects: 3, throws: 5, tips: 30 };
  expect(ids(run)).toEqual(['combo', 'perfect', 'thrower', 'clean', 'tips', 'flawless']);
});
it('withholds waste and no-complaint badges when the kitchen was messy', () => {
  const run = { ...base, served: 4, failed: 1, wasted: 2, perfects: 2, throws: 4 };
  expect(ids(run)).toEqual([]);
});
