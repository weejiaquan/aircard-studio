import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCard, releaseFinishCache } from '../renderer.js';
import { WIDTH, HEIGHT } from '../model.js';

function context() {
  const calls = [];
  return { calls, save() { calls.push(['save']); }, restore() { calls.push(['restore']); }, clearRect(...args) { calls.push(['clear', ...args]); }, fillRect(...args) { calls.push(['fill', ...args]); }, drawImage(...args) { calls.push(['image', this.globalAlpha, ...args]); }, createLinearGradient(...args) { const stops = []; calls.push(['gradient', ...args, stops]); return { addColorStop(...values) { stops.push(values); } }; } };
}
const base = () => ({ background: 'aurora', crop: { zoom: 1, x: .5, y: .5 }, layout: 'classic', layers: [] });
const layer = id => ({ id, category: 'network', image: { name: id }, iw: 400, ih: 200, fixed: true, visible: true, opacity: .7, tone: 'original' });

test('export renderer draws a full-bleed 1536 × 969 image without UI decorations or clipping', () => {
  const ctx = context(); renderCard(ctx, base());
  assert.deepEqual(ctx.calls[1], ['clear', 0, 0, WIDTH, HEIGHT]);
  assert.ok(ctx.calls.some(call => call[0] === 'fill' && call[3] === WIDTH && call[4] === HEIGHT));
  assert.equal(ctx.calls.at(-1)[0], 'restore');
});

test('wallpaper renders first, then visible layers in order with independent opacity', () => {
  const state = base(); const a = layer('a'), b = layer('b'), hidden = { ...layer('hidden'), visible: false };
  state.layers = [a, hidden, b]; state.wallpaper = { image: { name: 'wallpaper' }, iw: 1600, ih: 1000 };
  const ctx = context(); renderCard(ctx, state);
  const draws = ctx.calls.filter(call => call[0] === 'image');
  assert.deepEqual(draws.map(call => call[2].name), ['wallpaper', 'a', 'b']); assert.equal(draws[0][1], 1); assert.equal(draws[1][1], .7);
});

test('logo finish uses its alpha mask and cached surface without mutating source images', () => {
  const state = base(), tinted = { ...layer('gold-test'), tone: 'gold' }; state.layers = [tinted];
  let surfaces = 0, finish;
  const factory = () => { surfaces++; finish = context(); return { getContext: () => finish }; };
  renderCard(context(), state, factory); assert.equal(finish.globalCompositeOperation, 'source-in');
  assert.equal(finish.calls.filter(call => call[0] === 'image')[0][2], tinted.image);
  renderCard(context(), state, factory); assert.equal(surfaces, 1);
  releaseFinishCache(tinted.id); renderCard(context(), state, factory); assert.equal(surfaces, 2);
});
