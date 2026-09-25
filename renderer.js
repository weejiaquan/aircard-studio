import { WIDTH, HEIGHT, coverRect, layerRect } from './model.js';

export const BACKGROUNDS = {
  aurora: ['#071d33', '#336587', '#97dcb7'],
  ink: ['#11131b', '#2c3346', '#5a6c86'],
  gold: ['#745025', '#d2ad61', '#f1deb0'],
  rose: ['#442b45', '#96576f', '#dfaf96'],
};

const finishCache = new Map();
export function releaseFinishCache(id) {
  for (const key of finishCache.keys()) if (key.startsWith(`${id}:`)) finishCache.delete(key);
}

function finishedImage(layer, makeCanvas) {
  if (layer.tone === 'original') return layer.image;
  const key = `${layer.id}:${layer.tone}`;
  if (finishCache.has(key)) return finishCache.get(key);
  const surface = makeCanvas();
  const scale = Math.min(1536 / layer.iw, 969 / layer.ih);
  surface.width = Math.max(1, Math.round(layer.iw * scale));
  surface.height = Math.max(1, Math.round(layer.ih * scale));
  const ctx = surface.getContext('2d');
  ctx.drawImage(layer.image, 0, 0, surface.width, surface.height);
  ctx.globalCompositeOperation = 'source-in';
  if (layer.tone === 'gold' || layer.tone === 'silver') {
    const gradient = ctx.createLinearGradient(0, 0, surface.width * .25, surface.height);
    const colors = layer.tone === 'gold' ? ['#90601a', '#ffedb0', '#d5a444', '#a97620', '#f4db8f'] : ['#737f8d', '#f6f9ff', '#a6b1bf', '#71808f', '#e5ecf4'];
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
    ctx.fillStyle = gradient;
  } else ctx.fillStyle = layer.tone === 'white' ? '#ffffff' : '#111111';
  ctx.fillRect(0, 0, surface.width, surface.height);
  finishCache.set(key, surface);
  return surface;
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
    ctx.drawImage(finishedImage(layer, makeCanvas), rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}
