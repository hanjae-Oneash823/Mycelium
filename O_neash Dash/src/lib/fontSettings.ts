export type MainFont = 'VT323' | 'Tamzen';
export type KoreanFont = 'HBIOS-SYS' | 'Gulim';

interface FontOption<T extends string> {
  value: T;
  label: string;
  /** CSS font-family value, quoted where the name contains spaces/hyphens. */
  family: string;
}

export const MAIN_FONT_OPTIONS: FontOption<MainFont>[] = [
  { value: 'VT323',  label: 'VT323',           family: "'VT323'" },
  { value: 'Tamzen', label: 'Tamzen (10x20r)', family: "'Tamzen'" },
];

export const KOREAN_FONT_OPTIONS: FontOption<KoreanFont>[] = [
  { value: 'HBIOS-SYS', label: 'HBIOS-SYS', family: "'HBIOS-SYS'" },
  { value: 'Gulim',     label: 'Gulim',     family: "'Gulim'" },
];

/** Every physical @font-face this app renders with, keyed to the setting it belongs to. `baseSizeAdjust` compensates for that specific font's natural size relative to the others (e.g. HBIOS-SYS already runs large); the user's scale slider then multiplies on top of this. */
interface FontFaceSpec {
  role: 'main' | 'kr';
  match: MainFont | KoreanFont;
  family: string;
  src: string;
  weight: 'normal' | 'bold';
  baseSizeAdjust: number;
}

const FONT_FACE_SPECS: FontFaceSpec[] = [
  { role: 'main', match: 'VT323',     family: 'VT323',     src: "local('VT323')",                                     weight: 'normal', baseSizeAdjust: 100 },
  { role: 'main', match: 'Tamzen',    family: 'Tamzen',     src: "url('/fonts/Tamzen10x20r.ttf') format('truetype')", weight: 'normal', baseSizeAdjust: 100 },
  { role: 'main', match: 'Tamzen',    family: 'Tamzen',     src: "url('/fonts/Tamzen10x20b.ttf') format('truetype')", weight: 'bold',   baseSizeAdjust: 100 },
  { role: 'kr',   match: 'HBIOS-SYS', family: 'HBIOS-SYS',  src: "url('/fonts/HBIOS-SYS.woff2') format('woff2')",     weight: 'normal', baseSizeAdjust: 78 },
  { role: 'kr',   match: 'Gulim',     family: 'Gulim',      src: "url('/fonts/Baekmuk-Gulim.ttf') format('truetype')",weight: 'normal', baseSizeAdjust: 100 },
];

const MAIN_FONT_KEY = 'oneash-font-main';
const KOREAN_FONT_KEY = 'oneash-font-kr';
const MAIN_SCALE_KEY = 'oneash-font-main-scale';
const KOREAN_SCALE_KEY = 'oneash-font-kr-scale';
const DEFAULT_MAIN_FONT: MainFont = 'VT323';
const DEFAULT_KOREAN_FONT: KoreanFont = 'HBIOS-SYS';
const DEFAULT_SCALE = 100;

/** Bounds for the manual size-scale sliders in Settings > Appearance. */
export const SCALE_MIN = 50;
export const SCALE_MAX = 150;

/** Fired on `window` whenever a font preference changes, for consumers that can't rely on the CSS variables (e.g. Canvas 2D `ctx.font`). */
export const FONT_CHANGE_EVENT = 'oneash:font-change';

const FONT_FACE_STYLE_ID = 'oneash-font-faces';

function familyFor<T extends string>(value: string, options: FontOption<T>[]): string {
  return options.find(o => o.value === value)?.family ?? options[0].family;
}

function getScale(key: string): number {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored >= SCALE_MIN && stored <= SCALE_MAX ? stored : DEFAULT_SCALE;
}

function setScale(key: string, value: number): void {
  const clamped = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(value)));
  localStorage.setItem(key, String(clamped));
  applyFonts();
  window.dispatchEvent(new Event(FONT_CHANGE_EVENT));
}

export function getMainFont(): MainFont {
  const stored = localStorage.getItem(MAIN_FONT_KEY);
  return MAIN_FONT_OPTIONS.some(o => o.value === stored) ? (stored as MainFont) : DEFAULT_MAIN_FONT;
}

export function getKoreanFont(): KoreanFont {
  const stored = localStorage.getItem(KOREAN_FONT_KEY);
  return KOREAN_FONT_OPTIONS.some(o => o.value === stored) ? (stored as KoreanFont) : DEFAULT_KOREAN_FONT;
}

/** User's manual size multiplier for the main font, as a percentage (100 = no adjustment beyond the font's own baseline). */
export function getMainScale(): number {
  return getScale(MAIN_SCALE_KEY);
}

/** User's manual size multiplier for the Korean fallback font, as a percentage. */
export function getKoreanScale(): number {
  return getScale(KOREAN_SCALE_KEY);
}

export function setMainScale(percent: number): void {
  setScale(MAIN_SCALE_KEY, percent);
}

export function setKoreanScale(percent: number): void {
  setScale(KOREAN_SCALE_KEY, percent);
}

/** The resolved `font-family` stack (raw font names, not CSS `var()` refs) — for contexts like Canvas 2D that can't read CSS custom properties. */
export function getFontStackRaw(): string {
  const main = familyFor(getMainFont(), MAIN_FONT_OPTIONS);
  const kr   = familyFor(getKoreanFont(), KOREAN_FONT_OPTIONS);
  return `${main}, ${kr}, monospace`;
}

function buildFontFaceCss(): string {
  const mainScale = getMainScale();
  const krScale   = getKoreanScale();
  return FONT_FACE_SPECS.map(spec => {
    const scale = spec.role === 'main' ? mainScale : krScale;
    const sizeAdjust = Math.round(spec.baseSizeAdjust * scale / 100);
    return `@font-face { font-family: '${spec.family}'; src: ${spec.src}; font-weight: ${spec.weight}; font-style: normal; font-display: swap; size-adjust: ${sizeAdjust}%; }`;
  }).join('\n');
}

function applyFontFaceStyle(): void {
  let styleEl = document.getElementById(FONT_FACE_STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = FONT_FACE_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = buildFontFaceCss();
}

function applyFonts(): void {
  const root = document.documentElement.style;
  root.setProperty('--font-main', familyFor(getMainFont(), MAIN_FONT_OPTIONS));
  root.setProperty('--font-kr', familyFor(getKoreanFont(), KOREAN_FONT_OPTIONS));
  applyFontFaceStyle();
}

/** Applies the persisted (or default) font choices to the document root. Call once, as early as possible. */
export function initFontSettings(): void {
  applyFonts();
}

export function setMainFont(font: MainFont): void {
  localStorage.setItem(MAIN_FONT_KEY, font);
  applyFonts();
  window.dispatchEvent(new Event(FONT_CHANGE_EVENT));
}

export function setKoreanFont(font: KoreanFont): void {
  localStorage.setItem(KOREAN_FONT_KEY, font);
  applyFonts();
  window.dispatchEvent(new Event(FONT_CHANGE_EVENT));
}
