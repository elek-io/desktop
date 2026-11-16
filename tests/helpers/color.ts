/**
 * Color math for the branding spec: parse what the renderer reports, and
 * measure contrast from it.
 *
 * Chromium serializes a computed color in the color space it was written in, so
 * the brand tokens come back as `oklch()` or `oklab()` and the rest as `rgb()`.
 * Everything is converted to sRGB once, here, so a spec compares numbers rather
 * than strings.
 */

/** A color in sRGB, each channel from 0 to 1, with its alpha. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

function gammaEncode(channel: number): number {
  const sign = channel < 0 ? -1 : 1;
  const value = Math.abs(channel);
  return value <= 0.0031308
    ? 12.92 * channel
    : sign * (1.055 * Math.pow(value, 1 / 2.4) - 0.055);
}

/** OKLab to sRGB, as CSS Color 4 defines it. */
function oklabToRgb(l: number, a: number, b: number): [number, number, number] {
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    gammaEncode(
      4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube
    ),
    gammaEncode(
      -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube
    ),
    gammaEncode(
      -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube
    ),
  ];
}

function numbers(value: string): number[] {
  return (value.match(/-?(?:\d+\.?\d*|\.\d+)%?/g) ?? []).map((part) =>
    part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part)
  );
}

/**
 * Parse one computed color string into sRGB. Throws on a notation no spec
 * reads, so a silent zero never passes for a color.
 */
export function parseColor(value: string): Rgb {
  const text = value.trim();
  const parts = numbers(text);

  if (text.startsWith('oklch(')) {
    const [lightness, chroma, hue, alpha] = parts;
    if (lightness === undefined || chroma === undefined || hue === undefined) {
      throw new Error(`Incomplete oklch color: ${value}`);
    }
    const radians = (hue * Math.PI) / 180;
    const [r, g, b] = oklabToRgb(
      lightness,
      chroma * Math.cos(radians),
      chroma * Math.sin(radians)
    );
    return { r, g, b, a: alpha ?? 1 };
  }

  if (text.startsWith('oklab(')) {
    const [lightness, a, b, alpha] = parts;
    if (lightness === undefined || a === undefined || b === undefined) {
      throw new Error(`Incomplete oklab color: ${value}`);
    }
    const [red, green, blue] = oklabToRgb(lightness, a, b);
    return { r: red, g: green, b: blue, a: alpha ?? 1 };
  }

  if (text.startsWith('rgb')) {
    const [r, g, b, alpha] = parts;
    if (r === undefined || g === undefined || b === undefined) {
      throw new Error(`Incomplete rgb color: ${value}`);
    }
    return { r: r / 255, g: g / 255, b: b / 255, a: alpha ?? 1 };
  }

  if (text.startsWith('color(srgb')) {
    const [r, g, b, alpha] = parts;
    if (r === undefined || g === undefined || b === undefined) {
      throw new Error(`Incomplete srgb color: ${value}`);
    }
    return { r, g, b, a: alpha ?? 1 };
  }

  throw new Error(`Unsupported color notation: ${value}`);
}

function clamp(channel: number): number {
  return Math.min(1, Math.max(0, channel));
}

/** Lay a color over an opaque one, so a translucent fill has a real color. */
export function over(color: Rgb, backdrop: Rgb): Rgb {
  return {
    r: color.r * color.a + backdrop.r * (1 - color.a),
    g: color.g * color.a + backdrop.g * (1 - color.a),
    b: color.b * color.a + backdrop.b * (1 - color.a),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number): number => {
    const value = clamp(channel);
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * The WCAG 2.2 contrast ratio of two opaque colors, cut to two digits.
 *
 * Cut rather than rounded, so the number never reads higher than the ratio is.
 * A rounded 4.496 would report 4.5 and pass a threshold WCAG says it misses.
 */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Math.floor(ratio * 100) / 100;
}

/** The 0 to 255 channels a pixel comparison works in. */
export function toBytes(color: Rgb): [number, number, number] {
  return [
    Math.round(clamp(color.r) * 255),
    Math.round(clamp(color.g) * 255),
    Math.round(clamp(color.b) * 255),
  ];
}
