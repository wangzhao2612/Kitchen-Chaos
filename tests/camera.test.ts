import { expect, it } from 'vitest';
import { Camera } from '../src/rendering/Camera';
import { processSteps } from '../src/ui/ProcessIcons';
import { RECIPES, recipe } from '../src/cooking/recipes';

const view = { width: 1280, height: 600, zoom: 1.5, top: 80, bottom: 85 };
it('follows both movement axes smoothly, keeping physics coordinates intact and pausing completely', () => {
  const camera = new Camera(), player = { x: 530, y: 420 };
  camera.follow(player, view, 1/60, true);
  const before = { x: camera.x, y: camera.y };
  player.x += 100; player.y -= 100;
  camera.follow(player, view, 1/60, true);
  expect(camera.x).toBeLessThan(before.x); expect(camera.x).toBeGreaterThan(before.x - 150);
  expect(camera.y).toBeGreaterThan(before.y); expect(player).toEqual({ x: 630, y: 320 });
  const paused = { x: camera.x, y: camera.y };
  camera.follow({x:120,y:110},view,5,false);
  expect({x:camera.x,y:camera.y}).toEqual(paused);
});
it('keeps the chef and nearby target clear of the corner cards at every kitchen edge', () => {
  for(const x of [40,170,980,1080]) for(const y of [90,650]) {
    const camera = new Camera(); camera.follow({x,y},view,1,true);
    const screen = camera.screenPoint(80+x,95+y*.78);
    expect(screen.x).toBeGreaterThan(450); expect(screen.x).toBeLessThan(900);
    expect(screen.y).toBeGreaterThan(view.top+90); expect(screen.y).toBeLessThan(view.height-view.bottom-70);
  }
});
it('derives preparation pictograms from the actual recipe rules, including chopping before soup cooking', () => {
  const soup = recipe('soup'); soup.components.forEach(part=>expect(processSteps(soup,part)).toEqual(['chop','boil']));
  for(const r of RECIPES.filter(r=>r.id!=='soup')) for(const part of r.components) {
    const expected=part.state==='CHOPPED'?'chop':part.state==='RAW'?'plate':['beef','chicken'].includes(part.kind)?'fry':'boil';
    expect(processSteps(r,part)).toEqual([expected]);
  }
});
it('frames both chefs in co-op: midpoint focus, zooms out when far apart, unchanged for one chef', () => {
  const solo = new Camera(); solo.follow({ x: 300, y: 300 }, view, 1, true);
  const near = new Camera(); near.follow({ x: 300, y: 300 }, view, 1, true, { x: 300, y: 300 });
  expect(near.zoom).toBe(solo.zoom); expect(near.x).toBe(solo.x); expect(near.y).toBe(solo.y);
  const far = new Camera(); far.follow({ x: 100, y: 120 }, view, 1, true, { x: 1000, y: 640 });
  expect(far.zoom).toBeLessThan(view.zoom); expect(far.zoom).toBeGreaterThanOrEqual(view.zoom * 0.65 - 1e-9);
  for (const chef of [{ x: 100, y: 120 }, { x: 1000, y: 640 }]) {
    const screen = far.screenPoint(80 + chef.x, 95 + chef.y * .78);
    expect(screen.x).toBeGreaterThan(0); expect(screen.x).toBeLessThan(view.width);
    expect(screen.y).toBeGreaterThan(view.top); expect(screen.y).toBeLessThan(view.height - view.bottom);
  }
});
