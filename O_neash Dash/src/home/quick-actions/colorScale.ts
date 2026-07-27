function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * Sequential single-hue ramp for a value on a dark surface: dim/desaturated
 * near-black at t=0 (present but negligible), full accent color at t=1.
 */
export function orbColor(baseHex: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const dim = mix(baseHex, "#0a0a0a", 0.82);
  return mix(dim, baseHex, clamped);
}
