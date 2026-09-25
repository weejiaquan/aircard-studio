import { WIDTH, HEIGHT, coverRect, layerRect } from './model.js';

export const BACKGROUNDS = {
  aurora: ['#071d33', '#336587', '#97dcb7'],
  ink: ['#11131b', '#2c3346', '#5a6c86'],
  gold: ['#745025', '#d2ad61', '#f1deb0'],
  rose: ['#442b45', '#96576f', '#dfaf96'],
};

const finishCache = new Map();
const effectsSurfaces = new WeakMap();
export function releaseFinishCache(id) {
  finishCache.delete(id);
}

function finishedImage(layer, makeCanvas) {
  const overlay = layer.effects?.overlay;
  const hasOverlay = overlay?.enabled && overlay.opacity > 0;
  if (layer.tone === 'original' && !hasOverlay) return layer.image;
  const key = `${layer.tone}:${hasOverlay ? `${overlay.color}:${overlay.opacity}` : 'none'}`;
  const cached = finishCache.get(layer.id);
  if (cached?.key === key && cached.image === layer.image) return cached.surface;
  const surface = makeCanvas();
  const scale = Math.min(1536 / layer.iw, 969 / layer.ih);
  surface.width = Math.max(1, Math.round(layer.iw * scale));
  surface.height = Math.max(1, Math.round(layer.ih * scale));
  const ctx = surface.getContext('2d');
  ctx.drawImage(layer.image, 0, 0, surface.width, surface.height);
  if (layer.tone !== 'original') {
    ctx.globalCompositeOperation = 'source-in';
    if (layer.tone === 'gold' || layer.tone === 'silver') {
      const gradient = ctx.createLinearGradient(0, 0, surface.width * .25, surface.height);
      const colors = layer.tone === 'gold' ? ['#90601a', '#ffedb0', '#d5a444', '#a97620', '#f4db8f'] : ['#737f8d', '#f6f9ff', '#a6b1bf', '#71808f', '#e5ecf4'];
      colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = layer.tone === 'white' ? '#ffffff' : '#111111';
    ctx.fillRect(0, 0, surface.width, surface.height);
  }
  if (hasOverlay) {
    // Tint only existing pixels; source-atop preserves the original alpha exactly.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = overlay.opacity;
    ctx.fillStyle = overlay.color;
    ctx.fillRect(0, 0, surface.width, surface.height);
  }
  // Keep only the latest finish per layer, including during colour-picker drags.
  finishCache.set(layer.id, { key, surface, image: layer.image });
  return surface;
}

function shadowColor(color, opacity) {
  const hex = color.replace('#', '');
  return `rgba(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)}, ${opacity})`;
}

function drawHalo(ctx, image, rect, effect, x = 0, y = 0) {
  if (!effect?.enabled || effect.opacity <= 0) return;
  // Cast the shadow into the output while keeping its source outside the canvas.
  // This avoids drawing the logo twice (important for semi-transparent PNGs).
  const shift = WIDTH * 3;
  ctx.save();
  ctx.shadowColor = shadowColor(effect.color, effect.opacity);
  ctx.shadowBlur = effect.blur;
  ctx.shadowOffsetX = shift + x;
  ctx.shadowOffsetY = y;
  ctx.drawImage(image, rect.x - shift, rect.y, rect.w, rect.h);
  ctx.restore();
}

function drawLayer(ctx, layer, rect, makeCanvas) {
  const image = finishedImage(layer, makeCanvas);
  const shadow = layer.effects?.shadow, glow = layer.effects?.glow;
  if (!(shadow?.enabled && shadow.opacity > 0) && !(glow?.enabled && glow.opacity > 0)) {
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
    return;
  }
  let surface = effectsSurfaces.get(makeCanvas);
  if (!surface) {
    surface = makeCanvas(); surface.width = WIDTH; surface.height = HEIGHT;
    effectsSurfaces.set(makeCanvas, surface);
  }
  const group = surface.getContext('2d');
  group.clearRect(0, 0, WIDTH, HEIGHT);
  drawHalo(group, image, rect, shadow, shadow?.x, shadow?.y);
  drawHalo(group, image, rect, glow);
  group.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  // Layer opacity applies once to the whole group, including its shadow and glow.
  ctx.drawImage(surface, 0, 0);
}

export function renderCard(ctx, state, makeCanvas) {
  ctx.save();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
  if (state.wallpaper) {
    const rect = coverRect(state.wallpaper.iw, state.wallpaper.ih, state.crop.zoom, state.crop.x, state.crop.y);
    ctx.drawImage(state.wallpaper.image, rect.x, rect.y, rect.w, rect.h);
  } else {
    const colors = BACKGROUNDS[state.background];
    if (colors) {
      const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
      colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = /^#[\da-f]{6}$/i.test(state.background) ? state.background : '#203c54';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  for (const layer of state.layers) {
    if (!layer.visible || !layer.image) continue;
    const rect = layerRect(layer, state.layers, state.layout);
    ctx.globalAlpha = layer.opacity;
    drawLayer(ctx, layer, rect, makeCanvas);
  }
  ctx.restore();
}
