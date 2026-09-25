import test from 'node:test';
import assert from 'node:assert/strict';
import { WIDTH, HEIGHT, LAYOUTS, coverRect, containRect, presetRect, layerRect, unlockLayer, moveLayer, hitTest, reorderLayer } from '../model.js';

function logo(id, category = 'network', iw = 400, ih = 200) { return { id, category, iw, ih, fixed: true, visible: true, scale: 1 }; }
function inside(rect) { assert.ok(rect.x >= 0 && rect.y >= 0); assert.ok(rect.x + rect.w <= WIDTH + .00001); assert.ok(rect.y + rect.h <= HEIGHT + .00001); }

test('wallpaper cover fills the export for portrait and landscape photos at every crop edge', () => {
  for (const [w, h] of [[4000, 2000], [1000, 3000], [1536, 969]]) for (const zoom of [1, 1.7, 4]) for (const x of [0, .5, 1]) for (const y of [0, .5, 1]) {
    const r = coverRect(w, h, zoom, x, y);
    assert.ok(r.x <= 0 && r.y <= 0); assert.ok(r.x + r.w >= WIDTH - .00001); assert.ok(r.y + r.h >= HEIGHT - .00001);
    assert.ok(Math.abs(r.w / r.h - w / h) < .00001);
  }
});

test('full-size transparent overlays preserve exact registration and mismatched overlays preserve ratio', () => {
  const full = { ...logo('full', 'custom', WIDTH, HEIGHT), fullCard: true };
  assert.deepEqual(presetRect(full, [full]), { x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const square = { ...full, iw: 1000, ih: 1000 };
  const rect = presetRect(square, [square]); assert.equal(rect.w, rect.h); assert.equal(rect.h, HEIGHT); assert.equal(rect.x, (WIDTH - HEIGHT) / 2);
});

test('all template slots are within the export and concurrent payment marks do not overlap within each category', () => {
  for (const category of ['network', 'issuer', 'service', 'symbol']) {
    const layers = Array.from({ length: 8 }, (_, i) => logo(`brand-${i}`, category));
    for (const layout of LAYOUTS) {
      const rects = layers.map(layer => layerRect(layer, layers, layout)); rects.forEach(inside);
      rects.forEach((a, i) => rects.slice(i + 1).forEach(b => assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)));
    }
  }
});

test('fixed logos cannot move; unlock preserves position and re-lock snaps to the preset', () => {
  const layer = logo('visa'), layers = [layer]; const original = layerRect(layer, layers, 'classic');
  assert.equal(moveLayer(layer, layers, 'classic', 12, 25), false); assert.deepEqual(layerRect(layer, layers, 'classic'), original);
  unlockLayer(layer, layers, 'classic'); assert.deepEqual(layerRect(layer, layers, 'classic'), original);
  moveLayer(layer, layers, 'classic', 12, 25); assert.equal(layerRect(layer, layers, 'classic').x, 12);
  layer.fixed = true; assert.deepEqual(layerRect(layer, layers, 'classic'), original);
});

test('multiple network rows leave space for payment services in each layout', () => {
  const layers = [...Array.from({ length: 6 }, (_, i) => logo(`network-${i}`)), ...Array.from({ length: 3 }, (_, i) => logo(`service-${i}`, 'service'))];
  for (const layout of LAYOUTS) {
    const rects = layers.map(layer => layerRect(layer, layers, layout));
    rects.forEach((a, i) => rects.slice(i + 1).forEach(b => assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `Overlapping marks in ${layout}`)));
  }
});

test('unlocked layers clamp to bounds after dragging and scaling', () => {
  const layer = logo('visa'), layers = [layer]; unlockLayer(layer, layers, 'classic');
  layer.scale = 3; moveLayer(layer, layers, 'classic', -100, 10000); const rect = layerRect(layer, layers, 'classic');
  inside(rect); assert.equal(rect.x, 0); assert.equal(rect.y + rect.h, HEIGHT);
});

test('changing layout keeps free placement while fixed layers follow the layout', () => {
  const layer = logo('hsbc', 'issuer'), layers = [layer]; unlockLayer(layer, layers, 'classic'); moveLayer(layer, layers, 'classic', 200, 300);
  assert.deepEqual(layerRect(layer, layers, 'classic'), layerRect(layer, layers, 'minimal'));
  layer.fixed = true; assert.notEqual(layerRect(layer, layers, 'classic').y, layerRect(layer, layers, 'minimal').y);
});

test('layer reordering and hiding do not alter fixed registration', () => {
  const layers = [logo('visa'), logo('mastercard'), logo('quicpay', 'service')];
  const visa = layers[0], original = layerRect(visa, layers, 'japan');
  reorderLayer(layers, 'visa', 1); reorderLayer(layers, 'visa', 1); assert.equal(layers.at(-1), visa);
  layers[0].visible = false; assert.deepEqual(layerRect(visa, layers, 'japan'), original);
  assert.equal(reorderLayer(layers, 'visa', 1), false);
});

test('hit testing respects visibility and stacking order, excluding full-card overlays', () => {
  const back = { ...logo('back'), fixed: false, x: 100, y: 100 }, front = { ...logo('front'), fixed: false, x: 100, y: 100 };
  const full = { ...logo('overlay', 'custom', WIDTH, HEIGHT), fullCard: true };
  const layers = [back, front, full];
  assert.equal(hitTest(layers, 'classic', 150, 150), front); front.visible = false;
  assert.equal(hitTest(layers, 'classic', 150, 150), back); assert.equal(hitTest(layers, 'classic', 0, 0), null);
});

test('invalid image dimensions cannot propagate into canvas geometry', () => {
  assert.throws(() => coverRect(0, 500)); assert.throws(() => containRect(50, 0, { x: 0, y: 0, w: 10, h: 10 }));
});
