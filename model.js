export const WIDTH = 1536;
export const HEIGHT = 969;
export const LAYOUTS = ['classic', 'japan', 'minimal'];
export const TONES = ['original', 'white', 'black', 'gold', 'silver'];
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createEffects() {
  return {
    overlay: { enabled: false, color: '#d8f36a', opacity: .5 },
    shadow: { enabled: false, color: '#000000', opacity: .65, blur: 20, x: 8, y: 12 },
    glow: { enabled: false, color: '#ffffff', opacity: .8, blur: 30 },
  };
}

export function containRect(iw, ih, box) {
  if (!(iw > 0 && ih > 0)) throw new Error('Image dimensions must be positive.');
  const scale = Math.min(box.w / iw, box.h / ih);
  const w = iw * scale, h = ih * scale;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

export function coverRect(iw, ih, zoom = 1, panX = .5, panY = .5) {
  if (!(iw > 0 && ih > 0)) throw new Error('Image dimensions must be positive.');
  const scale = Math.max(WIDTH / iw, HEIGHT / ih) * clamp(zoom, 1, 4);
  const w = iw * scale, h = ih * scale;
  return { x: (WIDTH - w) * clamp(panX, 0, 1), y: (HEIGHT - h) * clamp(panY, 0, 1), w, h };
}

// Slots are template conventions, not a claim of universal issuer standards.
// Stable IDs keep logo placement independent of drawing order and visibility.
export function presetRect(layer, layers, layout = 'classic') {
  if (layer.fullCard) return containRect(layer.iw, layer.ih, { x: 0, y: 0, w: WIDTH, h: HEIGHT });
  const category = layer.category === 'custom' ? 'issuer' : layer.category;
  const peers = layers.filter(l => (l.category === 'custom' ? 'issuer' : l.category) === category && !l.fullCard).sort((a, b) => a.id.localeCompare(b.id));
  const index = Math.max(0, peers.findIndex(l => l.id === layer.id));
  const networkRows = Math.max(1, Math.ceil(layers.filter(l => l.category === 'network').length / 4));
  let box;
  if (category === 'issuer') {
    const col = index % 4, row = Math.floor(index / 4);
    box = { x: 74 + col * 300, y: layout === 'minimal' ? HEIGHT - 130 - row * 105 : 70 + row * 112, w: 250, h: 83 };
  } else if (category === 'symbol') {
    box = { x: WIDTH - 145 - (index % 5) * 110, y: 70 + Math.floor(index / 5) * 120, w: 70, h: 100 };
  } else if (category === 'service') {
    box = layout === 'japan'
      ? { x: WIDTH - 320 - (index % 4) * 300, y: HEIGHT - 460 - Math.floor(index / 4) * 210, w: 240, h: 210 }
      : { x: WIDTH - 290 - (index % 4) * 290, y: HEIGHT - 355 - Math.floor(index / 4) * 175, w: 210, h: 145 };
    box.y -= (networkRows - 1) * 145 + (layout === 'minimal' ? 145 : 0);
  } else {
    box = { x: WIDTH - 322 - (index % 4) * 300, y: HEIGHT - 199 - Math.floor(index / 4) * 145, w: 245, h: 122 };
  }
  box.x = clamp(box.x, 0, WIDTH - box.w);
  box.y = clamp(box.y, 0, HEIGHT - box.h);
  if (layout === 'minimal' && category === 'network') box.y -= 110;
  return containRect(layer.iw, layer.ih, box);
}

export function layerRect(layer, layers, layout) {
  const base = presetRect(layer, layers, layout);
  if (layer.fixed) return base;
  const scale = clamp(layer.scale ?? 1, .25, 3);
  const fit = Math.min(scale, WIDTH / base.w, HEIGHT / base.h);
  const w = base.w * fit, h = base.h * fit;
  return { x: clamp(layer.x ?? base.x, 0, WIDTH - w), y: clamp(layer.y ?? base.y, 0, HEIGHT - h), w, h };
}

export function unlockLayer(layer, layers, layout) {
  const rect = layerRect(layer, layers, layout);
  layer.x = rect.x; layer.y = rect.y; layer.scale = 1; layer.fixed = false;
}

export function moveLayer(layer, layers, layout, x, y) {
  if (layer.fixed) return false;
  const rect = layerRect(layer, layers, layout);
  layer.x = clamp(x, 0, WIDTH - rect.w); layer.y = clamp(y, 0, HEIGHT - rect.h);
  return true;
}

export function hitTest(layers, layout, x, y) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer.visible || layer.fullCard) continue;
    const r = layerRect(layer, layers, layout);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return layer;
  }
  return null;
}

export function reorderLayer(layers, id, direction) {
  const index = layers.findIndex(l => l.id === id);
  const next = clamp(index + direction, 0, layers.length - 1);
  if (index < 0 || index === next) return false;
  [layers[index], layers[next]] = [layers[next], layers[index]];
  return true;
}
