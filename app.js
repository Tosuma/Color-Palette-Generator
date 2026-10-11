'use strict';

const STORAGE_KEY = 'palette-generator-state';
const DEFAULT_COUNT = 5;
const MAX_COLORS = 20;
const MIN_GRID_COLS = 1;
const MAX_GRID_COLS = 8;

const ICONS = {
  drag: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  locked: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlocked: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  picker: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2"/><circle cx="12" cy="7.5" r="1.2"/><circle cx="16" cy="10" r="1.2"/><path d="M12 21a2.5 2.5 0 0 1 0-5h2"/>',
  delete: '<path d="M18 6L6 18M6 6l12 12"/>',
};

// ---------- Color helpers ----------

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
}

function wrapHue(h) {
  return ((h % 360) + 360) % 360;
}

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function hexToHue(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return wrapHue(h * 60);
}

// sRGB -> CIELAB (D65), used to measure how different two colors look.
function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function colorDistance(hexA, hexB) {
  const [l1, a1, b1] = hexToLab(hexA);
  const [l2, a2, b2] = hexToLab(hexB);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------- Generation ----------

// Hue offsets (degrees) from the base hue. `null` means each hue is picked freely.
const HARMONIES = {
  random: null,
  analogous: [0, 30, -30, 60, -60],
  complementary: [0, 180],
  'split-complementary': [0, 150, 210],
  triadic: [0, 120, 240],
  tetradic: [0, 90, 180, 270],
  monochrome: [0],
};

const MIN_DISTANCE = 18; // CIELAB ΔE: below this, two colors look nearly the same
const MAX_ATTEMPTS = 40;

// Saturation/lightness are kept in a range that avoids muddy or neon colors.
function candidateHex(hue, harmony) {
  if (harmony === 'monochrome') {
    return hslToHex(wrapHue(hue + randomBetween(-6, 6)), randomBetween(35, 80), randomBetween(20, 85));
  }
  const h = hue === null ? randomBetween(0, 360) : hue + randomBetween(-12, 12);
  return hslToHex(wrapHue(h), randomBetween(45, 85), randomBetween(35, 75));
}

// Tries candidates until one is far enough from every existing color; otherwise keeps the most distinct one.
function pickDistinct(makeCandidate, existing) {
  let best = null;
  let bestDistance = -1;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const hex = makeCandidate();
    const distance = Math.min(Infinity, ...existing.map((e) => colorDistance(hex, e)));
    if (distance >= MIN_DISTANCE) return hex;
    if (distance > bestDistance) {
      best = hex;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Generates `count` new hex colors.
 * - fixed: colors that stay in the palette; new colors avoid looking like them.
 * - baseHue: hue the harmony is built from.
 * - firstStep: which harmony offset the first new color uses (an anchor color occupies step 0).
 * - anchored: whether baseHue comes from an existing color. In "random" mode this spreads
 *   hues evenly around the wheel from the anchor instead of picking them freely.
 * - total: palette size, used for the even spread.
 */
function generateColors({ count, harmony, fixed = [], baseHue = randomBetween(0, 360), firstStep = 0, anchored = false, total = count }) {
  const offsets = HARMONIES[harmony] ?? (anchored ? Array.from({ length: total }, (_, j) => (j * 360) / total) : null);
  const existing = [...fixed];
  const result = [];
  for (let i = 0; i < count; i++) {
    const step = firstStep + i;
    const hue = offsets ? baseHue + offsets[step % offsets.length] : null;
    const hex = pickDistinct(() => candidateHex(hue, harmony), existing);
    existing.push(hex);
    result.push(hex);
  }
  return result;
}

// Accepts "#abc", "abc", "#aabbcc", "aabbcc"; returns "#AABBCC" or null.
function normalizeHex(value) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits.split('').map((c) => c + c).join('');
  }
  return `#${digits.toUpperCase()}`;
}

// Black or white text depending on the perceived brightness of the background.
function getContrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

// ---------- State ----------

let nextId = 1;

function createColor(hex) {
  return { id: nextId++, hex, locked: false };
}

function defaultState() {
  return {
    colors: generateColors({ count: DEFAULT_COUNT, harmony: 'random' }).map(createColor),
    view: 'columns',
    gridCols: 3,
    harmony: 'random',
    matchLocked: false,
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.colors) || saved.colors.length === 0) return defaultState();
    const colors = saved.colors
      .map((c) => ({ hex: normalizeHex(String(c.hex || '')), locked: Boolean(c.locked) }))
      .filter((c) => c.hex)
      .slice(0, MAX_COLORS)
      .map((c) => ({ id: nextId++, ...c }));
    if (colors.length === 0) return defaultState();
    return {
      colors,
      view: saved.view === 'grid' ? 'grid' : 'columns',
      gridCols: clamp(Number(saved.gridCols) || 3, MIN_GRID_COLS, MAX_GRID_COLS),
      harmony: Object.hasOwn(HARMONIES, saved.harmony) ? saved.harmony : 'random',
      matchLocked: Boolean(saved.matchLocked),
    };
  } catch {
    return defaultState();
  }
}

function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        colors: state.colors.map(({ hex, locked }) => ({ hex, locked })),
        view: state.view,
        gridCols: state.gridCols,
        harmony: state.harmony,
        matchLocked: state.matchLocked,
      })
    );
  } catch {
    // Storage unavailable (private mode etc.) — the app still works without it.
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

const state = load();

// ---------- Actions ----------

// The first locked color (in palette order) is the anchor when "Match locked colors" is on.
function anchorColor() {
  return state.matchLocked ? state.colors.find((c) => c.locked) ?? null : null;
}

function generate() {
  const unlocked = state.colors.filter((c) => !c.locked);
  const anchor = anchorColor();
  const hexes = generateColors({
    count: unlocked.length,
    harmony: state.harmony,
    fixed: state.colors.filter((c) => c.locked).map((c) => c.hex),
    baseHue: anchor ? hexToHue(anchor.hex) : undefined,
    firstStep: anchor ? 1 : 0,
    anchored: Boolean(anchor),
    total: state.colors.length,
  });
  unlocked.forEach((c, i) => {
    c.hex = hexes[i];
  });
  render();
}

// A new color continues the current harmony, built from the anchor or else the first color.
function addColor() {
  if (state.colors.length >= MAX_COLORS) return;
  const anchor = anchorColor();
  const [hex] = generateColors({
    count: 1,
    harmony: state.harmony,
    fixed: state.colors.map((c) => c.hex),
    baseHue: hexToHue((anchor ?? state.colors[0]).hex),
    firstStep: state.colors.length,
    anchored: Boolean(anchor),
    total: state.colors.length + 1,
  });
  state.colors.push(createColor(hex));
  render();
}

function setHarmony(harmony) {
  state.harmony = harmony;
  render();
}

function setMatchLocked(on) {
  state.matchLocked = on;
  render();
}

function deleteColor(id) {
  if (state.colors.length <= 1) return;
  state.colors = state.colors.filter((c) => c.id !== id);
  render();
}

function toggleLock(id) {
  const color = findColor(id);
  if (color) color.locked = !color.locked;
  render();
}

function setHex(id, hex) {
  const color = findColor(id);
  if (color) color.hex = hex;
  render();
}

function moveColor(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= state.colors.length || fromIndex === toIndex) return;
  const [moved] = state.colors.splice(fromIndex, 1);
  state.colors.splice(toIndex, 0, moved);
  render();
}

function setView(view) {
  state.view = view;
  render();
}

function setGridCols(n) {
  state.gridCols = clamp(n, MIN_GRID_COLS, MAX_GRID_COLS);
  render();
}

async function copyHex(hex) {
  try {
    await navigator.clipboard.writeText(hex);
    showToast(`Copied ${hex}`);
  } catch {
    showToast('Could not copy to clipboard');
  }
}

function findColor(id) {
  return state.colors.find((c) => c.id === id);
}

function indexOfColor(id) {
  return state.colors.findIndex((c) => c.id === id);
}

// ---------- Rendering ----------

const paletteEl = document.getElementById('palette');
const addBtn = document.getElementById('add');
const generateBtn = document.getElementById('generate');
const gridSizeWrap = document.getElementById('grid-size-wrap');
const gridSizeInput = document.getElementById('grid-size');
const gridSizeValue = document.getElementById('grid-size-value');
const toastEl = document.getElementById('toast');
const harmonySelect = document.getElementById('harmony');
const matchLockedInput = document.getElementById('match-locked');

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function swatchHtml(color, index) {
  const count = state.colors.length;
  return `
    <div class="swatch${color.locked ? ' is-locked' : ''}" data-id="${color.id}"
         style="background-color:${color.hex};--fg:${getContrastText(color.hex)}">
      <div class="swatch-actions">
        <button class="icon-btn" data-action="delete" title="Remove color" ${count <= 1 ? 'disabled' : ''}>${icon('delete')}</button>
        <button class="icon-btn" data-action="copy" title="Copy hex">${icon('copy')}</button>
        <span class="icon-btn picker-btn" title="Pick color">
          ${icon('picker')}
          <input type="color" value="${color.hex.toLowerCase()}" aria-label="Pick color" />
        </span>
        <button class="icon-btn" data-action="lock" title="${color.locked ? 'Unlock' : 'Lock'} color" aria-pressed="${color.locked}">
          ${icon(color.locked ? 'locked' : 'unlocked')}
        </button>
      </div>
      <div class="swatch-actions">
        <button class="icon-btn" data-action="left" title="Move left" ${index === 0 ? 'disabled' : ''}>${icon('left')}</button>
        <span class="icon-btn" data-action="drag" title="Drag to reorder">${icon('drag')}</span>
        <button class="icon-btn" data-action="right" title="Move right" ${index === count - 1 ? 'disabled' : ''}>${icon('right')}</button>
      </div>
      <input class="hex-input" type="text" value="${color.hex}" maxlength="7" spellcheck="false" aria-label="Hex color" />
    </div>`;
}

function render() {
  paletteEl.className = `palette view-${state.view}`;
  paletteEl.style.setProperty('--cols', state.gridCols);
  paletteEl.innerHTML = state.colors.map(swatchHtml).join('');

  document.querySelectorAll('.seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === state.view);
  });
  gridSizeWrap.hidden = state.view !== 'grid';
  gridSizeInput.value = state.gridCols;
  gridSizeValue.textContent = state.gridCols;
  harmonySelect.value = state.harmony;
  matchLockedInput.checked = state.matchLocked;
  addBtn.disabled = state.colors.length >= MAX_COLORS;
  generateBtn.disabled = state.colors.every((c) => c.locked);

  save();
}

let toastTimer;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
}

// ---------- Events ----------

function swatchIdFrom(el) {
  const swatch = el.closest('.swatch');
  return swatch ? Number(swatch.dataset.id) : null;
}

generateBtn.addEventListener('click', generate);
addBtn.addEventListener('click', addColor);

document.querySelectorAll('.seg-btn').forEach((btn) => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

gridSizeInput.addEventListener('input', () => setGridCols(Number(gridSizeInput.value)));
harmonySelect.addEventListener('change', () => setHarmony(harmonySelect.value));
matchLockedInput.addEventListener('change', () => setMatchLocked(matchLockedInput.checked));

document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  const tag = e.target.tagName;
  if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(tag) || e.target.isContentEditable) return;
  e.preventDefault();
  generate();
});

paletteEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = swatchIdFrom(btn);
  const index = indexOfColor(id);
  switch (btn.dataset.action) {
    case 'delete': deleteColor(id); break;
    case 'copy': copyHex(findColor(id).hex); break;
    case 'lock': toggleLock(id); break;
    case 'left': moveColor(index, index - 1); break;
    case 'right': moveColor(index, index + 1); break;
  }
});

// Hex text input: commit on Enter or blur, revert if invalid.
function commitHexInput(input) {
  const id = swatchIdFrom(input);
  const color = findColor(id);
  if (!color) return;
  const hex = normalizeHex(input.value);
  if (hex) {
    if (hex !== color.hex) setHex(id, hex);
    else input.value = hex;
  } else {
    input.value = color.hex;
    input.classList.remove('invalid');
    void input.offsetWidth; // restart the shake animation
    input.classList.add('invalid');
  }
}

paletteEl.addEventListener('keydown', (e) => {
  if (!e.target.classList.contains('hex-input')) return;
  if (e.key === 'Enter') e.target.blur();
  if (e.key === 'Escape') {
    e.target.value = findColor(swatchIdFrom(e.target)).hex;
    e.target.blur();
  }
});

paletteEl.addEventListener('focusout', (e) => {
  if (e.target.classList.contains('hex-input')) commitHexInput(e.target);
});

// Native color picker: live-preview while dragging, commit on change.
paletteEl.addEventListener('input', (e) => {
  if (e.target.type !== 'color') return;
  const swatch = e.target.closest('.swatch');
  const hex = e.target.value.toUpperCase();
  swatch.style.backgroundColor = hex;
  swatch.style.setProperty('--fg', getContrastText(hex));
  swatch.querySelector('.hex-input').value = hex;
});

paletteEl.addEventListener('change', (e) => {
  if (e.target.type !== 'color') return;
  setHex(swatchIdFrom(e.target), e.target.value.toUpperCase());
});

// ---------- Drag & drop reordering ----------
// Only the drag handle makes a swatch draggable, so text selection in the hex input still works.

let dragId = null;

paletteEl.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('[data-action="drag"]');
  if (handle) handle.closest('.swatch').draggable = true;
});

// If the handle is pressed but never dragged, dragend won't fire — reset here instead.
document.addEventListener('pointerup', () => {
  if (dragId === null) paletteEl.querySelectorAll('.swatch[draggable="true"]').forEach((el) => { el.draggable = false; });
});

paletteEl.addEventListener('dragstart', (e) => {
  const swatch = e.target.closest('.swatch');
  if (!swatch) return;
  dragId = Number(swatch.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', findColor(dragId).hex);
  requestAnimationFrame(() => swatch.classList.add('dragging'));
});

paletteEl.addEventListener('dragover', (e) => {
  if (dragId === null) return;
  const target = e.target.closest('.swatch');
  if (!target) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  paletteEl.querySelectorAll('.drop-target').forEach((el) => {
    if (el !== target) el.classList.remove('drop-target');
  });
  if (Number(target.dataset.id) !== dragId) target.classList.add('drop-target');
});

paletteEl.addEventListener('drop', (e) => {
  const target = e.target.closest('.swatch');
  if (dragId === null || !target) return;
  e.preventDefault();
  const from = indexOfColor(dragId);
  const to = indexOfColor(Number(target.dataset.id));
  dragId = null;
  moveColor(from, to);
});

paletteEl.addEventListener('dragend', () => {
  dragId = null;
  paletteEl.querySelectorAll('.swatch').forEach((el) => {
    el.draggable = false;
    el.classList.remove('dragging', 'drop-target');
  });
});

render();
