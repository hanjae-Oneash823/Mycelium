import { useEffect, useRef, useState, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AsepriteFrame {
  frame: { x: number; y: number; w: number; h: number };
  duration: number;
}

interface SpriteData {
  frames: AsepriteFrame[];
  img: HTMLImageElement;
}

// ── Module-level cache ────────────────────────────────────────────────────────

const cache = new Map<string, SpriteData | 'loading' | 'error'>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach(fn => fn());
}

async function loadSprite(pngUrl: string, jsonUrl: string): Promise<void> {
  const key = pngUrl;
  if (cache.has(key)) return;
  cache.set(key, 'loading');
  try {
    const [jsonRes] = await Promise.all([fetch(jsonUrl)]);
    const raw = await jsonRes.json();

    // Normalise both Aseprite hash-format and array-format
    const rawFrames: AsepriteFrame[] = Array.isArray(raw.frames)
      ? raw.frames
      : Object.values(raw.frames as Record<string, AsepriteFrame>);

    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload  = () => res();
      img.onerror = () => rej();
      img.src = pngUrl;
    });

    cache.set(key, { frames: rawFrames, img });
  } catch {
    cache.set(key, 'error');
  }
  notify(key);
}

function useSprite(pngUrl: string, jsonUrl: string): SpriteData | null {
  const [, tick] = useState(0);
  const key = pngUrl;

  useEffect(() => {
    const set = listeners.get(key) ?? new Set();
    const fn = () => tick(n => n + 1);
    set.add(fn);
    listeners.set(key, set);
    loadSprite(pngUrl, jsonUrl);
    return () => { set.delete(fn); };
  }, [key, pngUrl, jsonUrl]);

  const entry = cache.get(key);
  return (entry && entry !== 'loading' && entry !== 'error') ? entry : null;
}

// ── PixelIcon ─────────────────────────────────────────────────────────────────

export type IconType = 'arc' | 'folder' | 'paper';

interface PixelIconProps {
  type: IconType;
  size?: number;        // rendered px (square)
  hovered?: boolean;
  tintColor?: string;   // CSS color to overlay — falsy = no tint
}

const SPRITE_MAP: Record<IconType, { default: string; hover: string }> = {
  arc:    { default: 'box_closed',    hover: 'box_open'     },
  folder: { default: 'folder_closed', hover: 'folder_open'  },
  paper:  { default: 'document',      hover: 'document'     }, // same sprite; hover = CSS rotation
};

function spriteUrls(type: IconType, state: 'default' | 'hover') {
  const name = SPRITE_MAP[type][state];
  return { png: `/icons/notes/${name}.png`, json: `/icons/notes/${name}.json` };
}

export default function PixelIcon({ type, size = 72, hovered = false, tintColor }: PixelIconProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const frameRef   = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const state  = hovered ? 'hover' : 'default';
  const urls   = spriteUrls(type, state);
  const sprite = useSprite(urls.png, urls.json);

  // Fallback: also preload the other state
  const altUrls = spriteUrls(type, hovered ? 'default' : 'hover');
  useSprite(altUrls.png, altUrls.json);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext('2d');
    if (!canvas || !ctx || !sprite) return;

    const { frames, img } = sprite;
    if (!frames.length) return;

    const fi = frameRef.current % frames.length;
    const f  = frames[fi];

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, f.frame.x, f.frame.y, f.frame.w, f.frame.h, 0, 0, size, size);

    // Tint: paint the color over non-transparent pixels only
    if (tintColor) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tintColor;
      ctx.fillRect(0, 0, size, size);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    if (frames.length > 1) {
      timerRef.current = setTimeout(() => {
        frameRef.current = (frameRef.current + 1) % frames.length;
        draw();
      }, f.duration);
    }
  }, [sprite, size, tintColor]);

  // Reset frame and redraw when sprite or hover changes
  useEffect(() => {
    frameRef.current = 0;
    if (timerRef.current) clearTimeout(timerRef.current);
    draw();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [draw]);

  // Placeholder while loading
  const PLACEHOLDER: Record<IconType, string> = { arc: '#3a3a5c', folder: '#3a5c3a', paper: '#5c4a3a' };

  return sprite ? (
    <canvas ref={canvasRef} width={size} height={size} style={{ imageRendering: 'pixelated', display: 'block' }} />
  ) : (
    <div style={{ width: size, height: size, background: PLACEHOLDER[type], opacity: 0.4 }} />
  );
}
