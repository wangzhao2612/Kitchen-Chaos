import type { RunResult } from './types';
export interface Achievement { id: string; icon: string; name: string; hint: string }
const ALL: (Achievement & { test: (r: RunResult) => boolean })[] = [
  { id: 'combo', icon: '🔥', name: '连击大师', hint: '连续上菜 5 次', test: r => r.bestCombo >= 5 },
  { id: 'perfect', icon: '✨', name: '火候大师', hint: '完美火候装盘 3 次', test: r => (r.perfects ?? 0) >= 3 },
  { id: 'thrower', icon: '🎯', name: '投掷高手', hint: '投掷食材 5 次', test: r => (r.throws ?? 0) >= 5 },
  { id: 'clean', icon: '🌿', name: '零浪费', hint: '至少上菜一次且没有浪费', test: r => r.served > 0 && r.wasted === 0 },
  { id: 'tips', icon: '💰', name: '小费收割机', hint: '赚到 30 金币小费', test: r => (r.tips ?? 0) >= 30 },
  { id: 'flawless', icon: '🏅', name: '无差评', hint: '上菜至少 3 次且无人离开', test: r => r.served >= 3 && r.failed === 0 }
];
/** Badges earned in one run; derived only from the run result, so nothing needs saving. */
export function earnedAchievements(result: RunResult): Achievement[] { return ALL.filter(a => a.test(result)).map(({ id, icon, name, hint }) => ({ id, icon, name, hint })); }
export const ACHIEVEMENT_COUNT = ALL.length;
