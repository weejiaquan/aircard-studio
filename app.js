import { WIDTH, HEIGHT, LAYOUTS, clamp, coverRect, layerRect, unlockLayer, moveLayer, hitTest, reorderLayer } from './model.js';
import { renderCard, releaseFinishCache } from './renderer.js';

const $ = id => document.getElementById(id);
const canvas = $('card-canvas');
const stage = $('card-stage');
const state = { layers: [], layout: 'classic', background: 'aurora', wallpaper: null, crop: { zoom: 1, x: .5, y: .5 }, selected: null, mode: 'layers' };
let catalog = [], category = 'all', search = '', drag = null, toastTimer, wallpaperVersion = 0, frame = 0;
const imageCache = new Map(), loadingAssets = new Set();
const makeCanvas = () => document.createElement('canvas');
const current = () => state.layers.find(layer => layer.id === state.selected);

function status(message, error = false) {
  clearTimeout(toastTimer);
  $('status').textContent = message; $('status').classList.toggle('error', error); $('status').hidden = false;
  toastTimer = setTimeout(() => { $('status').hidden = true; }, error ? 8000 : 4500);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth ? resolve(image) : reject(new Error('This image has no dimensions.'));
    image.onerror = () => reject(new Error('This image could not be opened. Try PNG, JPG, or WebP.'));
    image.src = src;
  });
}

async function readLocalImage(file, overlay = false) {
  const types = overlay ? ['image/png', 'image/webp'] : ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];
  if (!types.includes(file.type)) throw new Error(overlay ? 'Use a transparent PNG or WebP for overlays.' : 'Use a PNG, JPG, WebP, or AVIF wallpaper.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Choose an image with fewer than 40 million pixels.');
    return { image, url, iw: image.naturalWidth, ih: image.naturalHeight, name: file.name };
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

function paint() {
  frame = 0;
  renderCard(canvas.getContext('2d'), state, makeCanvas);
  const layer = current(), box = $('selection-box');
  box.hidden = !layer || !layer.visible || state.mode !== 'layers';
  if (layer) {
    const rect = layerRect(layer, state.layers, state.layout);
    Object.assign(box.style, { left: `${rect.x / WIDTH * 100}%`, top: `${rect.y / HEIGHT * 100}%`, width: `${rect.w / WIDTH * 100}%`, height: `${rect.h / HEIGHT * 100}%` });
    box.classList.toggle('locked', layer.fixed);
    $('selection-label').textContent = `${layer.name} · ${layer.fixed ? 'Fixed' : 'Drag to move'}`;
  }
  stage.style.cursor = state.mode === 'wallpaper' ? (state.wallpaper ? 'grab' : 'default') : (layer && !layer.fixed ? 'move' : 'default');
}
function requestPaint() { if (!frame) frame = requestAnimationFrame(paint); }

function updateHint() {
  const layer = current();
  $('canvas-hint').textContent = state.mode === 'wallpaper'
    ? (state.wallpaper ? 'Drag the wallpaper to frame your image. Use Zoom to move closer.' : 'Upload a wallpaper to crop and reposition it.')
    : layer ? (layer.fixed ? `${layer.name} is fixed. Uncheck Fixed position to move it.` : 'Drag the selected layer, or use arrow keys. Shift + arrow moves faster.')
      : 'Select a logo below or add your own transparent artwork.';
}

function updateInspector() {
  const layer = current();
  $('inspector').hidden = !layer;
  if (!layer) { updateHint(); return; }
  const rect = layerRect(layer, state.layers, state.layout);
  $('inspector-title').textContent = layer.name;
  $('layer-fixed').checked = layer.fixed;
  $('fixed-help').textContent = layer.fixed ? 'Aligned to the selected layout' : 'Drag the layer or use the position fields';
  $('layer-x').value = Math.round(rect.x); $('layer-y').value = Math.round(rect.y);
  $('layer-x').disabled = layer.fixed; $('layer-y').disabled = layer.fixed;
  $('layer-x').max = Math.floor(WIDTH - rect.w); $('layer-y').max = Math.floor(HEIGHT - rect.h);
  $('layer-size').disabled = layer.fixed;
  $('layer-size').value = layer.fixed ? 1 : layer.scale;
  $('size-value').value = `${Math.round((layer.fixed ? 1 : layer.scale) * 100)}%`;
  $('layer-opacity').value = layer.opacity; $('opacity-value').value = `${Math.round(layer.opacity * 100)}%`;
  $('layer-tone').value = layer.tone;
  const index = state.layers.indexOf(layer);
  $('layer-up').disabled = index === state.layers.length - 1;
  $('layer-down').disabled = index === 0;
  updateHint();
}

function element(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderLayers() {
  const list = $('layer-list'); list.replaceChildren();
  $('layer-count').textContent = state.layers.length;
  if (!state.layers.length) list.append(element('p', 'empty-layers', 'Your layers will appear here. Choose a logo or upload an overlay to begin.'));
  for (const layer of [...state.layers].reverse()) {
    const row = element('div', `layer-row${layer.id === state.selected ? ' selected' : ''}`);
    const select = element('button', 'layer-select'); select.type = 'button';
    select.setAttribute('aria-pressed', String(layer.id === state.selected));
    const thumb = element('img', 'layer-thumb'); thumb.src = layer.url; thumb.alt = '';
    const name = element('span', '', layer.name); name.append(element('small', '', layer.fixed ? 'Fixed position' : 'Free position'));
    select.append(thumb, name); select.addEventListener('click', () => selectLayer(layer.id));
    const visibility = element('button', `icon-button${layer.visible ? '' : ' off'}`, layer.visible ? '◉' : '○');
    visibility.setAttribute('aria-label', `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`);
    visibility.setAttribute('aria-pressed', String(layer.visible));
    visibility.addEventListener('click', () => { layer.visible = !layer.visible; refresh(); });
    row.append(select, visibility); list.append(row);
  }
}

function renderLibrary() {
  const grid = $('logo-grid'); grid.replaceChildren();
  const results = catalog.filter(asset => (category === 'all' || asset.category === category) && `${asset.name} ${asset.keywords ?? ''}`.toLowerCase().includes(search));
  $('library-count').textContent = `${catalog.length} logos`;
  for (const asset of results) {
    const selected = state.layers.some(layer => layer.assetId === asset.id);
    const button = element('button', `logo-tile${selected ? ' selected' : ''}`);
    button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-label', `${selected ? 'Remove' : 'Add'} ${asset.name}`);
    button.disabled = loadingAssets.has(asset.id);
    const image = element('img'); image.src = asset.src; image.alt = ''; image.loading = 'lazy';
    const title = element('span', '', asset.name); button.append(image, title);
    if (selected) button.append(element('b', '', '✓'));
    button.addEventListener('click', async () => {
      const existing = state.layers.find(layer => layer.assetId === asset.id);
      if (existing) removeLayer(existing.id);
      else { try { await addAsset(asset.id); } catch (error) { status(error.message, true); } }
    });
    grid.append(button);
  }
  if (!results.length) grid.append(element('p', 'helper', 'No matching logos. You can upload a custom PNG.'));
}

function refresh() { renderLayers(); renderLibrary(); updateInspector(); requestPaint(); }
function selectLayer(id) { state.selected = id; setMode('layers'); renderLayers(); updateInspector(); requestPaint(); }

async function addAsset(id) {
  const asset = catalog.find(asset => asset.id === id);
  if (!asset) throw new Error('Unknown logo.');
  if (loadingAssets.has(id) || state.layers.some(layer => layer.assetId === id)) return;
  if (state.layers.length + loadingAssets.size >= 32) throw new Error('This design has reached the 32-layer limit. Remove a layer to add another.');
  loadingAssets.add(id); renderLibrary();
  try {
    const image = imageCache.get(id) ?? await loadImage(asset.src);
    imageCache.set(id, image);
    const layer = { id, assetId: id, name: asset.name, category: asset.category, url: asset.src, image, iw: image.naturalWidth, ih: image.naturalHeight, fixed: true, visible: true, scale: 1, opacity: 1, tone: asset.defaultTone ?? 'original' };
    state.layers.push(layer); state.selected = id;
  } finally { loadingAssets.delete(id); refresh(); }
}

function removeLayer(id) {
  const index = state.layers.findIndex(layer => layer.id === id);
  if (index < 0) return;
  const [removed] = state.layers.splice(index, 1);
  if (removed.custom) URL.revokeObjectURL(removed.url);
  releaseFinishCache(id);
  if (state.selected === id) state.selected = state.layers.at(-1)?.id ?? null;
  refresh();
}

function setMode(mode) {
  state.mode = mode;
  for (const value of ['layers', 'wallpaper']) { $('mode-' + value).classList.toggle('active', mode === value); $('mode-' + value).setAttribute('aria-pressed', String(mode === value)); }
  updateHint(); requestPaint();
}

function syncCrop() {
  $('wallpaper-zoom').value = state.crop.zoom; $('zoom-value').value = `${Math.round(state.crop.zoom * 100)}%`;
  $('wallpaper-x').value = state.crop.x; $('wallpaper-y').value = state.crop.y;
}

function syncBackground() {
  $('crop-controls').hidden = !state.wallpaper; $('wallpaper-info').hidden = !state.wallpaper;
  $('wallpaper-name').textContent = state.wallpaper?.name ?? '';
  for (const button of document.querySelectorAll('[data-background]')) {
    const selected = !state.wallpaper && state.background === button.dataset.background;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  }
  syncCrop(); updateHint(); requestPaint();
}

async function setWallpaper(file) {
  const version = ++wallpaperVersion;
  try {
    const wallpaper = await readLocalImage(file);
    if (version !== wallpaperVersion) { URL.revokeObjectURL(wallpaper.url); return; }
    if (state.wallpaper) URL.revokeObjectURL(state.wallpaper.url);
    state.wallpaper = wallpaper; state.crop = { zoom: 1, x: .5, y: .5 };
    setMode('wallpaper'); syncBackground(); status('Wallpaper added. Drag to frame it.');
  } catch (error) { if (version === wallpaperVersion) status(error.message, true); }
}

function removeWallpaper() {
  wallpaperVersion++;
  if (state.wallpaper) URL.revokeObjectURL(state.wallpaper.url);
  state.wallpaper = null; syncBackground();
}

async function addOverlays(files, fullCard) {
  for (const file of files) {
    if (state.layers.length >= 32) { status('This design has reached the 32-layer limit.', true); break; }
    try {
      const data = await readLocalImage(file, true);
      const layer = { ...data, id: `custom-${crypto.randomUUID()}`, name: file.name.replace(/\.[^.]+$/, ''), category: 'custom', custom: true, fullCard, fixed: true, visible: true, scale: 1, opacity: 1, tone: 'original' };
      // Full-card overlays sit above wallpaper and behind separate logo layers.
      if (fullCard) state.layers.unshift(layer); else state.layers.push(layer);
      selectLayer(layer.id); refresh();
      status(fullCard && Math.abs(data.iw / data.ih - WIDTH / HEIGHT) > .02 ? 'Overlay added. Its aspect ratio is preserved; use 1536 × 969 for edge-to-edge alignment.' : 'Overlay added in its fixed position.');
    } catch (error) { status(`${file.name}: ${error.message}`, true); }
  }
}

function point(event) {
  const rect = stage.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width * WIDTH, y: (event.clientY - rect.top) / rect.height * HEIGHT };
}

stage.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const p = point(event);
  if (state.mode === 'wallpaper') {
    if (!state.wallpaper) return;
    drag = { type: 'wallpaper', start: p, crop: { ...state.crop } };
  } else {
    const selected = current();
    const selectedRect = selected?.visible && !selected.fixed ? layerRect(selected, state.layers, state.layout) : null;
    const insideSelected = selectedRect && p.x >= selectedRect.x && p.x <= selectedRect.x + selectedRect.w && p.y >= selectedRect.y && p.y <= selectedRect.y + selectedRect.h;
    const layer = insideSelected ? selected : hitTest(state.layers, state.layout, p.x, p.y);
    if (!layer) { state.selected = null; refresh(); return; }
    selectLayer(layer.id);
    if (layer.fixed) return;
    const rect = layerRect(layer, state.layers, state.layout);
    drag = { type: 'layer', id: layer.id, start: p, x: rect.x, y: rect.y };
  }
  stage.setPointerCapture(event.pointerId); stage.focus({ preventScroll: true }); event.preventDefault();
});

stage.addEventListener('pointermove', event => {
  if (!drag) return;
  const p = point(event), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  if (drag.type === 'wallpaper' && state.wallpaper) {
    const rect = coverRect(state.wallpaper.iw, state.wallpaper.ih, state.crop.zoom);
    state.crop.x = rect.w > WIDTH ? clamp(drag.crop.x - dx / (rect.w - WIDTH), 0, 1) : .5;
    state.crop.y = rect.h > HEIGHT ? clamp(drag.crop.y - dy / (rect.h - HEIGHT), 0, 1) : .5;
    syncCrop();
  } else if (drag.type === 'layer') {
    const layer = state.layers.find(layer => layer.id === drag.id);
    if (layer) { moveLayer(layer, state.layers, state.layout, drag.x + dx, drag.y + dy); updateInspector(); }
  }
  requestPaint();
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) stage.addEventListener(name, () => { drag = null; });

stage.addEventListener('keydown', event => {
  if (event.key === 'Escape') { state.selected = null; refresh(); return; }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  const layer = current();
  if (state.mode !== 'layers' || !layer || layer.fixed) return;
  event.preventDefault(); const rect = layerRect(layer, state.layers, state.layout), step = event.shiftKey ? 10 : 1;
  moveLayer(layer, state.layers, state.layout, rect.x + delta[0] * step, rect.y + delta[1] * step); updateInspector(); requestPaint();
});

$('wallpaper-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) void setWallpaper(file); event.target.value = ''; });
$('overlay-file').addEventListener('change', event => { void addOverlays([...event.target.files], $('overlay-mode').value === 'full'); event.target.value = ''; });
for (const label of document.querySelectorAll('label[role=button]')) label.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); label.querySelector('input[type=file]').click(); } });
for (const name of ['dragenter', 'dragover']) $('wallpaper-drop').addEventListener(name, event => { event.preventDefault(); $('wallpaper-drop').classList.add('drag-over'); });
for (const name of ['dragleave', 'drop']) $('wallpaper-drop').addEventListener(name, event => { event.preventDefault(); $('wallpaper-drop').classList.remove('drag-over'); });
$('wallpaper-drop').addEventListener('drop', event => { const file = event.dataTransfer.files[0]; if (file) void setWallpaper(file); });
// Do not let an accidental image drop navigate away from an unfinished design.
window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
window.addEventListener('drop', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
$('remove-wallpaper').addEventListener('click', removeWallpaper);
$('reset-crop').addEventListener('click', () => { state.crop = { zoom: 1, x: .5, y: .5 }; syncCrop(); requestPaint(); });
for (const [id, property] of [['wallpaper-zoom', 'zoom'], ['wallpaper-x', 'x'], ['wallpaper-y', 'y']]) $(id).addEventListener('input', event => { state.crop[property] = Number(event.target.value); syncCrop(); requestPaint(); });
for (const button of document.querySelectorAll('[data-background]')) button.addEventListener('click', () => { state.background = button.dataset.background; removeWallpaper(); });
$('background-color').addEventListener('input', event => { state.background = event.target.value; removeWallpaper(); });
$('layout').addEventListener('change', event => { state.layout = event.target.value; updateInspector(); requestPaint(); });
$('rounded-preview').addEventListener('change', event => { stage.classList.toggle('square', !event.target.checked); });
for (const mode of ['layers', 'wallpaper']) $('mode-' + mode).addEventListener('click', () => setMode(mode));
for (const button of document.querySelectorAll('[data-category]')) button.addEventListener('click', () => { category = button.dataset.category; for (const item of document.querySelectorAll('[data-category]')) { const active = item === button; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); } renderLibrary(); });
$('logo-search').addEventListener('input', event => { search = event.target.value.trim().toLowerCase(); renderLibrary(); });
$('layer-fixed').addEventListener('change', event => { const layer = current(); if (!layer) return; if (event.target.checked) { layer.fixed = true; layer.scale = 1; } else unlockLayer(layer, state.layers, state.layout); refresh(); });
for (const axis of ['x', 'y']) $('layer-' + axis).addEventListener('change', event => { const layer = current(); const value = event.target.valueAsNumber; if (!layer || !Number.isFinite(value)) { updateInspector(); return; } const rect = layerRect(layer, state.layers, state.layout); moveLayer(layer, state.layers, state.layout, axis === 'x' ? value : rect.x, axis === 'y' ? value : rect.y); updateInspector(); requestPaint(); });
for (const property of ['size', 'opacity']) $('layer-' + property).addEventListener('input', event => { const layer = current(); if (!layer) return; if (property === 'size') { if (layer.fixed) return; layer.scale = Number(event.target.value); } else layer.opacity = Number(event.target.value); updateInspector(); requestPaint(); });
$('layer-tone').addEventListener('change', event => { const layer = current(); if (layer) { layer.tone = event.target.value; requestPaint(); } });
for (const [id, direction] of [['layer-up', 1], ['layer-down', -1]]) $(id).addEventListener('click', () => { reorderLayer(state.layers, state.selected, direction); refresh(); });
$('reset-layer').addEventListener('click', () => { const layer = current(); if (!layer) return; Object.assign(layer, { fixed: true, scale: 1, opacity: 1, tone: catalog.find(asset => asset.id === layer.assetId)?.defaultTone ?? 'original', visible: true }); refresh(); });
$('delete-layer').addEventListener('click', () => removeLayer(state.selected));

async function exportPng() {
  const button = $('export'); button.disabled = true;
  try {
    const output = makeCanvas(); output.width = WIDTH; output.height = HEIGHT;
    renderCard(output.getContext('2d'), state, makeCanvas);
    const blob = await new Promise(resolve => output.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The PNG could not be created. Try a smaller wallpaper.');
    const url = URL.createObjectURL(blob), anchor = element('a');
    anchor.href = url; anchor.download = 'aircard-studio.png'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    status('PNG exported at 1536 × 969. Import it into AirCard.');
  } catch (error) { status(error.message || 'Export failed. Please try again.', true); }
  finally { button.disabled = false; }
}
$('export').addEventListener('click', exportPng);

function registerTools() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  const tools = [
    { name: 'read_card_design', description: 'Read the active card layout, layers and available bundled logos. Does not expose uploaded image data.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute() { return { layout: state.layout, logos: catalog.map(({ id, name, category }) => ({ id, name, category })), layers: state.layers.map(layer => ({ id: layer.id, name: layer.name, fixed: layer.fixed, visible: layer.visible, tone: layer.tone, ...layerRect(layer, state.layers, state.layout) })) }; } },
    { name: 'configure_card_logos', description: 'Add bundled logos and set the fixed-position layout in the visible editor. Does not export or upload images.', inputSchema: { type: 'object', properties: { logoIds: { type: 'array', items: { type: 'string' }, maxItems: 32 }, layout: { type: 'string', enum: LAYOUTS } }, required: ['logoIds'], additionalProperties: false }, annotations: { readOnlyHint: false }, async execute(input) { if (!input || !Array.isArray(input.logoIds) || input.logoIds.length > 32 || input.logoIds.some(id => !catalog.some(asset => asset.id === id)) || (input.layout !== undefined && !LAYOUTS.includes(input.layout))) throw new Error('Supply known logo IDs and a supported layout.'); for (const id of input.logoIds) await addAsset(id); if (input.layout) { state.layout = input.layout; $('layout').value = input.layout; } refresh(); paint(); return { logoCount: state.layers.length, layout: state.layout }; } },
  ];
  for (const tool of tools) { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional API; the editor works without it. */ } }
}

async function init() {
  refresh();
  try {
    const response = await fetch('./assets/logos/catalog.json');
    if (!response.ok) throw new Error('The logo library could not load. Custom uploads still work.');
    catalog = await response.json(); renderLibrary();
    // A real, editable example with independently selectable marks.
    for (const id of ['visa', 'contactless']) if (catalog.some(asset => asset.id === id)) await addAsset(id);
    state.selected = null; refresh(); registerTools();
  } catch (error) { $('logo-grid').replaceChildren(element('p', 'helper', error.message)); status(error.message, true); }
}
void init();
