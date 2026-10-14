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
