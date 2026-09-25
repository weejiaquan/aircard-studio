import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCard, releaseFinishCache } from '../renderer.js';
import { WIDTH, HEIGHT, createEffects } from '../model.js';

function context() {
  const calls = [];
  const stack = [], draws = [], fills = [];
  return {
    calls, draws, fills, globalAlpha: 1, globalCompositeOperation: 'source-over', shadowColor: 'transparent', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    snapshot() { return { globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation, shadowColor: this.shadowColor, shadowBlur: this.shadowBlur, shadowOffsetX: this.shadowOffsetX, shadowOffsetY: this.shadowOffsetY, fillStyle: this.fillStyle }; },
    save() { stack.push(this.snapshot()); calls.push(['save']); },
    restore() { Object.assign(this, stack.pop()); calls.push(['restore']); },
    clearRect(...args) { calls.push(['clear', ...args]); },
    fillRect(...args) { fills.push({ ...this.snapshot(), args }); calls.push(['fill', ...args]); },
    drawImage(...args) { draws.push({ ...this.snapshot(), args }); calls.push(['image', this.globalAlpha, ...args]); },
    createLinearGradient(...args) { const stops = []; calls.push(['gradient', ...args, stops]); return { addColorStop(...values) { stops.push(values); } }; },
  };
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

test('colour overlay blends after the finish and preserves the alpha mask', () => {
  const state = base(), target = { ...layer('overlay-test'), effects: createEffects(), tone: 'white' };
  Object.assign(target.effects.overlay, { enabled: true, color: '#aabbcc', opacity: .35 }); state.layers = [target];
  let finish;
  renderCard(context(), state, () => { finish = context(); return { getContext: () => finish }; });
  assert.equal(finish.fills.length, 2);
  assert.equal(finish.fills[0].globalCompositeOperation, 'source-in');
  assert.equal(finish.fills[1].globalCompositeOperation, 'source-atop');
  assert.equal(finish.fills[1].globalAlpha, .35); assert.equal(finish.fills[1].fillStyle, '#aabbcc');
});

test('shadow and glow combine behind a single source image; layer opacity applies once', () => {
  const state = base(), target = { ...layer('both-effects'), effects: createEffects() }; state.layers = [target];
  Object.assign(target.effects.shadow, { enabled: true, color: '#123456', opacity: .4, blur: 15, x: -8, y: 20 });
  Object.assign(target.effects.glow, { enabled: true, color: '#abcdef', opacity: .8, blur: 32 });
  const main = context(); let group;
  const factory = () => { group = context(); return { getContext: () => group }; };
  renderCard(main, state, factory);
  assert.equal(main.draws.length, 1); assert.equal(main.draws[0].globalAlpha, .7);
  assert.equal(group.draws.length, 3);
  const [shadow, glow, artwork] = group.draws;
  assert.equal(shadow.shadowColor, 'rgba(18, 52, 86, 0.4)'); assert.equal(shadow.shadowBlur, 15); assert.equal(shadow.shadowOffsetY, 20);
  assert.equal(glow.shadowColor, 'rgba(171, 205, 239, 0.8)'); assert.equal(glow.shadowBlur, 32); assert.equal(glow.shadowOffsetY, 0);
  assert.ok(shadow.args[1] < -WIDTH && glow.args[1] < -WIDTH);
  assert.equal(artwork.shadowColor, 'transparent'); assert.equal(artwork.shadowOffsetX, 0); assert.equal(artwork.globalAlpha, 1);
  assert.ok(artwork.args[1] >= 0);
  renderCard(main, state, factory);
  assert.equal(group.calls.filter(call => call[0] === 'clear').length, 2);
});

test('effects disabled or at zero opacity leave the original rendering unchanged', () => {
  const state = base(), target = { ...layer('disabled-effects'), effects: createEffects() }; state.layers = [target];
  for (const effect of Object.values(target.effects)) { effect.enabled = true; effect.opacity = 0; }
  const main = context(); renderCard(main, state, () => { throw new Error('Unexpected effects surface'); });
  assert.equal(main.draws[0].args[0], target.image);
});

test('effect state is independent per layer and a new defaults object clears it', () => {
  const a = createEffects(), b = createEffects(); a.shadow.enabled = true; a.overlay.color = '#ffffff';
  assert.equal(b.shadow.enabled, false); assert.equal(b.overlay.color, '#d8f36a');
  assert.deepEqual(createEffects(), b);
});

test('changing overlay colour and opacity invalidates the cached finish', () => {
  const state = base(), target = { ...layer('overlay-cache'), effects: createEffects() }; state.layers = [target];
  target.effects.overlay.enabled = true;
  let surfaces = 0;
  const factory = () => { surfaces++; return { getContext: () => context() }; };
  renderCard(context(), state, factory); renderCard(context(), state, factory); assert.equal(surfaces, 1);
  target.effects.overlay.color = '#abcdef'; renderCard(context(), state, factory); assert.equal(surfaces, 2);
  target.effects.overlay.opacity = .25; renderCard(context(), state, factory); assert.equal(surfaces, 3);
  target.effects.overlay.enabled = false;
  const main = context(); renderCard(main, state, factory); assert.equal(main.draws[0].args[0], target.image);
});
