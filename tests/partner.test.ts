import { expect, it } from 'vitest';
import { Simulation } from '../src/game/Simulation';
import { ChefAI } from '../src/game/ChefAI';
import { LEVELS } from '../src/levels/data';
import type { Control } from '../src/game/types';

const idle: Control = { x: 0, y: 0, interact: false, work: false, dash: false };
function runWithPartner(levelIndex: number, seconds: number) {
  const sim = new Simulation(LEVELS[levelIndex]), ai = new ChefAI();
  sim.addPartner(ai.brain);
  for (let i = 0; i < seconds * 60 && !sim.finished; i++) sim.update(1 / 60, idle);
  return { sim, ai };
}

it('adds a second chef that starts away from the first and obeys the same collision rules', () => {
  const sim = new Simulation(LEVELS[0]);
  sim.addPartner(new ChefAI().brain);
  expect(sim.partner).not.toBe(null);
  expect(Math.hypot(sim.partner!.x - sim.mainPlayer.x, sim.partner!.y - sim.mainPlayer.y)).toBeGreaterThan(20);
  expect(sim.player).toBe(sim.mainPlayer);
  sim.update(1 / 60, idle);
  expect(sim.player).toBe(sim.mainPlayer);
});

it('the AI chef cooks and serves dishes on its own in every kitchen without ever getting stuck', () => {
  const report: { level: number; served: number; score: number; error: string }[] = [];
  for (let i = 0; i < LEVELS.length; i++) {
    const { sim, ai } = runWithPartner(i, 200);
    report.push({ level: i + 1, served: sim.served, score: sim.score, error: ai.lastError });
  }
  for (const row of report) {
    expect(row.error, JSON.stringify(report)).toBe('');
    expect(row.served, JSON.stringify(report)).toBeGreaterThanOrEqual(2);
  }
  console.log('AI partner solo run', JSON.stringify(report));
});

it('partner does not leak coaching hints and its held items count as waste when the round ends', () => {
  const { sim } = runWithPartner(0, 20);
  expect(sim.events.some(e => e.kind === 'hint')).toBe(false);
  const heldByPartner = sim.partner!.held;
  const result = sim.result();
  if (heldByPartner && heldByPartner.type !== 'extinguisher') expect(result.wasted).toBeGreaterThan(0);
});

it('a human-style brain drives only the second chef while the first stays put', () => {
  const sim = new Simulation(LEVELS[0]);
  let calls = 0;
  sim.addPartner(() => { calls++; return { ...idle, x: 0, y: 1 }; });
  const main = { x: sim.mainPlayer.x, y: sim.mainPlayer.y }, start = { x: sim.partner!.x, y: sim.partner!.y };
  for (let i = 0; i < 30; i++) sim.update(1 / 60, idle);
  expect(calls).toBe(30);
  expect(sim.mainPlayer.x).toBe(main.x);
  expect(sim.mainPlayer.y).toBe(main.y);
  expect(sim.partner!.y === start.y && sim.partner!.x === start.x).toBe(false);
});

it('the two chefs cannot be pushed through each other', () => {
  const sim = new Simulation(LEVELS[0]);
  sim.addPartner(() => ({ ...idle, x: Math.sign(sim.mainPlayer.x - sim.partner!.x), y: Math.sign(sim.mainPlayer.y - sim.partner!.y) }));
  for (let i = 0; i < 180; i++) sim.update(1 / 60, idle);
  expect(Math.hypot(sim.partner!.x - sim.mainPlayer.x, sim.partner!.y - sim.mainPlayer.y)).toBeGreaterThan(20);
});
