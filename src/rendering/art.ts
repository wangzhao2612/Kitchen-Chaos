import { INGREDIENTS } from '../game/types';
import type { Component, IngredientKind, Item } from '../game/types';
import { matchRecipe } from '../cooking/recipes';
export function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient, stroke?: string): void {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
export function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, stroke?: string): void {
  c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.stroke(); }
}
function line(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 2): void { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }
export function ingredientIcon(c: CanvasRenderingContext2D, kind: IngredientKind, x: number, y: number, size = 28, state = 'RAW'): void {
  c.save(); c.translate(x, y); c.scale(size / 32, size / 32); c.lineWidth = 1.6; c.lineJoin = 'round';
  if (state === 'BURNT') { ellipse(c, 0, 2, 14, 10, '#403432', '#241f21'); ellipse(c, -5, -3, 4, 2, '#726258'); c.restore(); return; }
  if (state === 'CHOPPED') {
    const color = INGREDIENTS[kind].color;
    for (let i = 0; i < 6; i++) { const px = Math.cos(i * 2.1) * 8, py = Math.sin(i * 2.1) * 5; rounded(c, px - 4, py - 3, 8, 6, 2, color, kind === 'lettuce' ? '#4d8f44' : '#ad6547'); line(c, px - 2, py - 1, px + 2, py - 1, '#ffffff65', 1.5); }
    c.restore(); return;
  }
  switch (kind) {
    case 'tomato': {
      const gradient=c.createRadialGradient(-4,-4,1,0,2,16); gradient.addColorStop(0,'#ffac7a'); gradient.addColorStop(.4,'#ef7250'); gradient.addColorStop(1,'#b74036');
      ellipse(c, 0, 2, 13, 12, gradient, '#a94138'); ellipse(c, -5, -4, 3, 2, '#ffcba080');
      c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, radius = i % 2 ? 3 : 8; c.lineTo(Math.cos(a) * radius, -8 + Math.sin(a) * radius * 0.55); } c.closePath(); c.fillStyle = '#518748'; c.fill(); break;
    }
    case 'lettuce': {
      for (let i = 0; i < 6; i++) ellipse(c, Math.cos(i) * 7, Math.sin(i) * 5, 8, 7, i % 2 ? '#79bd5b' : '#5b9c49', '#4d8943');
      ellipse(c, -1, -2, 8, 8, '#a8d77b'); line(c, -5, -6, 3, 6, '#d5ebad', 2); line(c, -1, 0, 6, -4, '#d5ebad', 1.5); break;
    }
    case 'onion': {
      ellipse(c, 0, 3, 12, 10, '#b978af', '#825680'); ellipse(c, -2, 0, 9, 8, '#dbb0d2');
      for (let i = -1; i <= 1; i++) { c.beginPath(); c.ellipse(i * 3, 2, 4, 8, 0, -1.3, 1.4); c.strokeStyle = '#9a6597'; c.stroke(); }
      line(c, 0, -7, 2, -13, '#77914e', 3); break;
    }
    case 'carrot': {
      c.beginPath(); c.moveTo(-10, -7); c.quadraticCurveTo(1, -12, 7, -3); c.lineTo(-3, 14); c.closePath(); c.fillStyle = '#ef963d'; c.fill(); c.strokeStyle = '#b7682b'; c.stroke();
      line(c, -4, -8, -7, -16, '#639743', 3); line(c, -2, -8, 2, -15, '#7aaf4d', 3); line(c, -7, -2, -2, 0, '#f9c478', 2); line(c, -4, 5, 0, 6, '#be6d30', 1); break;
    }
    case 'potato': ellipse(c, 0, 2, 13, 10, '#c6a168', '#977344'); ellipse(c, -3, -1, 10, 7, '#e3c18a'); for (const [px, py] of [[-6, -2], [5, 3], [-2, 6], [4, -3]]) ellipse(c, px, py, 1.3, 1, '#a68554'); break;
    case 'beef': {
      const cooked = state === 'COOKED'; ellipse(c, 0, 2, 14, 10, cooked ? '#8e5537' : '#ba5e5c', cooked ? '#633c2b' : '#8f4547'); ellipse(c, -2, -1, 11, 7, cooked ? '#b67b4b' : '#e6877c');
      if (cooked) for (let i = -6; i <= 6; i += 5) line(c, i - 3, -5, i + 3, 7, '#67412d', 2);
      else { ellipse(c, 4, 2, 4, 3, '#f7d8b3'); ellipse(c, 4, 2, 2, 1.5, '#d09584'); line(c, -8, -2, -2, 4, '#f2bfaa', 2); } break;
    }
    case 'chicken': {
      ellipse(c, -3, 1, 11, 10, state === 'COOKED' ? '#c98745' : '#edba9e', '#ad7955'); ellipse(c, -5, -2, 6, 5, state === 'COOKED' ? '#e9b36d' : '#f9d6ba');
      line(c, 4, 5, 12, 10, '#f5ede0', 5); ellipse(c, 13, 8, 3, 3, '#fff8ed'); ellipse(c, 11, 12, 3, 3, '#fff8ed'); break;
    }
    case 'rice': {
      if (state === 'RAW') { rounded(c, -10, -12, 20, 26, 4, '#e2cba5', '#a58962'); rounded(c, -8, -5, 16, 13, 2, '#f4efe0'); }
      else { ellipse(c, 0, 4, 14, 9, '#b9c8cb'); ellipse(c, 0, 0, 13, 8, '#fffae9'); }
      for (let i = 0; i < 10; i++) ellipse(c, Math.sin(i * 5) * 8, Math.cos(i * 4) * 5 + 1, 2, 0.9, '#d8d2b9'); break;
    }
    case 'bread': {
      ellipse(c, 0, 8, 14, 6, '#b97936', '#89582c'); ellipse(c, 0, 0, 14, 10, '#efbc66', '#b9803e'); ellipse(c, -3, -3, 10, 5, '#ffd791');
      for (let i = 0; i < 8; i++) ellipse(c, Math.sin(i * 4) * 9, Math.cos(i * 3) * 5 - 2, 1.7, 0.7, '#fff0ba'); break;
    }
    case 'cheese': {
      c.beginPath(); c.moveTo(-14, 7); c.lineTo(5, -11); c.lineTo(14, 9); c.closePath(); c.fillStyle = '#f4cd4b'; c.fill(); c.strokeStyle = '#c0952e'; c.stroke();
      for (const [px, py] of [[0, 0], [7, 5], [-5, 5]]) ellipse(c, px, py, 2.5, 2, '#d8a72d'); line(c, -9, 5, 4, -7, '#ffe996', 2); break;
    }
    case 'noodles': {
      if (state === 'RAW') { rounded(c, -9, -13, 18, 28, 3, '#eac266', '#b89142'); for (let i = -5; i <= 5; i += 3) line(c, i, -10, i, 10, '#f9e1a1', 2); rounded(c, -11, -2, 22, 8, 2, '#a86545'); }
      else { ellipse(c, 0, 4, 14, 9, '#eee8d7', '#b9b5a8'); for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(Math.sin(i) * 5, Math.cos(i) * 3, 8, 4, i * 0.5, 0, Math.PI * 1.8); c.strokeStyle = '#d8ab52'; c.lineWidth = 2.4; c.stroke(); } } break;
    }
  }
  c.restore();
}

export function dishIcon(c: CanvasRenderingContext2D, id: string, x: number, y: number, size = 45): void {
  c.save(); c.translate(x, y); c.scale(size / 48, size / 48);
  ellipse(c, 0, 4, 24, 16, '#c3c7c0'); ellipse(c, 0, 1, 24, 15, '#fffbed', '#c6c9bd'); ellipse(c, 0, 1, 18, 11, '#efeee1');
  if (id === 'salad') { ingredientIcon(c, 'lettuce', -5, -1, 29); ingredientIcon(c, 'tomato', 10, 3, 18, 'CHOPPED'); }
  if (id === 'soup') { ellipse(c, 0, 0, 19, 13, '#e4ceac', '#b69e7a'); ellipse(c, 0, -2, 16, 10, '#d85e40'); for (let i = 0; i < 4; i++) ellipse(c, Math.sin(i * 4) * 10, Math.cos(i * 3) * 5 - 2, 3, 1.5, '#f3b884'); ingredientIcon(c, 'lettuce', 1, -3, 11, 'CHOPPED'); }
  if (id === 'burger' || id === 'cheeseburger') {
    ellipse(c, 0, 8, 18, 7, '#db994a', '#a56e32'); rounded(c, -17, 2, 34, 6, 3, '#729949'); rounded(c, -17, -3, 34, 7, 3, '#7d4d34');
    if (id === 'cheeseburger') { c.beginPath(); c.moveTo(-19, -3); c.lineTo(19, -3); c.lineTo(9, 4); c.lineTo(-2, 0); c.closePath(); c.fillStyle = '#f7ce52'; c.fill(); }
    ellipse(c, 0, -7, 18, 10, '#efbb64', '#b78545'); ellipse(c, -3, -10, 12, 5, '#ffd992');
    for (let i = 0; i < 6; i++) ellipse(c, Math.sin(i * 4) * 11, Math.cos(i * 3) * 4 - 8, 1.7, 0.7, '#fff3c8');
  }
  if (id === 'chickenrice') { ingredientIcon(c, 'rice', -3, 0, 36, 'COOKED'); ingredientIcon(c, 'chicken', 7, 0, 28, 'COOKED'); }
  if (id === 'pasta') { ingredientIcon(c, 'noodles', 0, 0, 36, 'COOKED'); ingredientIcon(c, 'tomato', -8, 1, 17, 'CHOPPED'); ingredientIcon(c, 'carrot', 10, 3, 16, 'CHOPPED'); }
  c.restore();
}

export function itemIcon(c: CanvasRenderingContext2D, item: Item, x: number, y: number, size = 32): void {
  if (item.type === 'extinguisher') {
    c.save(); c.translate(x, y); c.scale(size / 32, size / 32); rounded(c, -7, -10, 14, 25, 5, '#db5c4a', '#a13e35'); rounded(c, -6, -15, 12, 6, 2, '#454e4b'); rounded(c, -5, -1, 10, 8, 1, '#fff1d9'); line(c, 6, -12, 13, -5, '#48544e', 3); c.restore(); return;
  }
  if (item.type === 'plate') {
    if (!item.dirty) {
      const dish = matchRecipe(item.components);
      if (dish) { dishIcon(c, dish.id, x, y, size + 8); return; }
    }
    ellipse(c, x, y + 2, size * 0.6, size * 0.38, '#b9c4bf'); ellipse(c, x, y, size * 0.6, size * 0.36, '#fff9e9', '#cad0c2'); ellipse(c, x, y, size * 0.44, size * 0.24, '#edeade');
    if (item.dirty) { ellipse(c, x - 4, y, size * 0.24, size * 0.12, '#9c7753'); ellipse(c, x + 8, y - 3, 3, 2, '#bf9265'); }
    else componentsIcon(c, item.components, x, y, size * 0.62);
    return;
  }
  componentsIcon(c, item.components, x, y, size);
}
function componentsIcon(c: CanvasRenderingContext2D, parts: Component[], x: number, y: number, size: number): void {
  parts.forEach((part, index) => ingredientIcon(c, part.kind, x + (parts.length > 1 ? (index - (parts.length - 1) / 2) * size * 0.6 : 0), y, parts.length > 1 ? size * 0.7 : size, part.state));
}
export function iconData(id: string, ingredient = false): string {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  const c = canvas.getContext('2d')!;
  if (ingredient) ingredientIcon(c, id as IngredientKind, 48, 47, 82); else dishIcon(c, id, 48, 48, 82);
  return canvas.toDataURL();
}
export function itemData(item: Item): string {
  const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
  itemIcon(canvas.getContext('2d')!, item, 48, 48, item.type === 'plate' ? 66 : 74);
  return canvas.toDataURL();
}
