import type { Component, Recipe } from '../game/types';
export type Process = 'chop' | 'fry' | 'boil' | 'plate';
const names: Record<Process, string> = { chop: '用刀切菜', fry: '用锅煎熟', boil: '用锅煮熟', plate: '直接装盘' };
const drawings: Record<Process, string> = {
  chop: '<rect x="3" y="20" width="26" height="9" rx="3" fill="#d6a268"/><path d="M12 5L25 18Q26 22 20 23L7 10Z" fill="#ecf1e9" stroke="#4e6e66" stroke-width="2"/><path d="M5 3L10 8" stroke="#795741" stroke-width="6" stroke-linecap="round"/>',
  fry: '<ellipse cx="14" cy="20" rx="11" ry="7" fill="#526d64" stroke="#31483f" stroke-width="2"/><ellipse cx="14" cy="18" rx="8" ry="4" fill="#d19a54"/><path d="M24 19L31 15" stroke="#4b6158" stroke-width="5" stroke-linecap="round"/><path d="M9 11Q5 8 9 4M17 10Q13 7 17 3" stroke="#91a49b" stroke-width="2" fill="none"/>',
  boil: '<path d="M6 15L8 27Q16 30 24 27L26 15Z" fill="#91aca1" stroke="#3f6358" stroke-width="2"/><ellipse cx="16" cy="15" rx="10" ry="4" fill="#e3ede1" stroke="#3f6358" stroke-width="2"/><path d="M3 17L6 19M26 19L29 17M11 9Q7 6 11 2M20 10Q16 7 20 3" stroke="#648576" stroke-width="2" fill="none" stroke-linecap="round"/>',
  plate: '<ellipse cx="16" cy="20" rx="14" ry="8" fill="#fffaf0" stroke="#7c9989" stroke-width="2"/><ellipse cx="16" cy="20" rx="9" ry="4" fill="#e6ead9"/><path d="M13 8L16 11L22 4" stroke="#72a657" stroke-width="3" fill="none" stroke-linecap="round"/>'
};
export function processSteps(r: Recipe, part: Component): Process[] {
  if (r.id === 'soup') return ['chop', 'boil'];
  if (part.state === 'CHOPPED') return ['chop'];
  if (part.state === 'COOKED') return [part.kind === 'beef' || part.kind === 'chicken' ? 'fry' : 'boil'];
  return ['plate'];
}
export function processIcon(step: Process): string {
  return `<svg class="process-icon" data-process="${step}" viewBox="0 0 32 32" role="img" aria-label="${names[step]}">${drawings[step]}</svg>`;
}
