export type BaseColor = {
  bg: string;
  fg: string;
  primary: string;
};

export type ThemeMode = 'auto' | 'light' | 'dark';

export type Palette = {
  'base-100': string;
  'base-200': string;
  'base-300': string;
  'base-content': string;
  neutral: string;
  'neutral-content': string;
  primary: string;
  secondary: string;
  accent: string;
};

export type Theme = {
  name: string;
  label: string;
  colors: {
    light: Palette;
    dark: Palette;
  };
  isCustomizable?: boolean;
};

export type CustomTheme = {
  name: string;
  label: string;
  colors: {
    light: BaseColor;
    dark: BaseColor;
  };
};

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };
type ColorTransform = { lightness?: number; saturation?: number; hue?: number };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// Match tinycolor2's HSL object conversion precisely. Its percentage parser
// truncates to four decimal places (including ordinary floating-point edge
// cases), so preserving that behavior avoids changing existing theme colors.
const normalizeHslRatio = (value: number) => {
  const percentage = Number.parseFloat(`${value * 100}%`);
  const bounded = Math.min(100, Math.max(0, percentage));
  const truncated = Number.parseInt(String(bounded * 100), 10) / 100;
  if (Math.abs(truncated - 100) < 0.000001) return 1;
  return (truncated % 100) / 100;
};

const parseHexColor = (hexColor: string): Rgb => {
  const raw = hexColor.trim().replace(/^#/, '');
  const normalized =
    raw.length === 3
      ? raw
          .split('')
          .map((digit) => `${digit}${digit}`)
          .join('')
      : raw.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error(`Invalid hex color: ${hexColor}`);
  }
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHsl = ({ r, g, b }: Rgb): Hsl => {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l: lightness };

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }
  return { h: (hue / 6) * 360, s: saturation, l: lightness };
};

const hueToRgb = (p: number, q: number, hue: number) => {
  let value = hue;
  if (value < 0) value += 1;
  if (value > 1) value -= 1;
  if (value < 1 / 6) return p + (q - p) * 6 * value;
  if (value < 1 / 2) return q;
  if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
  return p;
};

const hslToRgb = ({ h, s, l }: Hsl): Rgb => {
  const saturation = normalizeHslRatio(s);
  const lightness = normalizeHslRatio(l);
  if (saturation === 0) {
    const value = lightness * 255;
    return { r: value, g: value, b: value };
  }
  const hue = (((h % 360) + 360) % 360) / 360;
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    r: hueToRgb(p, q, hue + 1 / 3) * 255,
    g: hueToRgb(p, q, hue) * 255,
    b: hueToRgb(p, q, hue - 1 / 3) * 255,
  };
};

const rgbToHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b]
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const transformHexColor = (
  hexColor: string,
  { lightness = 0, saturation = 0, hue = 0 }: ColorTransform,
) => {
  let rgb = parseHexColor(hexColor);

  // tinycolor applies chained modifications one at a time, converting back to
  // RGB between operations. Keep that order for byte-for-byte palette parity.
  if (lightness !== 0) {
    const hsl = rgbToHsl(rgb);
    rgb = hslToRgb({ ...hsl, l: clamp01(hsl.l + lightness) });
  }
  if (saturation !== 0) {
    const hsl = rgbToHsl(rgb);
    rgb = hslToRgb({ ...hsl, s: clamp01(hsl.s + saturation) });
  }
  if (hue !== 0) {
    const hsl = rgbToHsl(rgb);
    rgb = hslToRgb({ ...hsl, h: (hsl.h + hue + 360) % 360 });
  }

  return rgbToHex(rgb);
};

const isDarkHex = (hexColor: string) => {
  const { r, g, b } = parseHexColor(hexColor);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
};

function srgbToLinear(v: number): number {
  // Standard formula for gamma decoding of sRGB
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function hexToOklch(hexColor: string): string {
  // 1) Convert from hex → sRGB (0..255) → [0..1]
  const { r, g, b } = parseHexColor(hexColor);
  const R = srgbToLinear(r / 255);
  const G = srgbToLinear(g / 255);
  const B = srgbToLinear(b / 255);

  // 2) Convert linear sRGB → L'M'S'  (the Oklab-specific "LMS" space)
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);

  // 3) Convert L'M'S' → Oklab
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  // 4) Convert Oklab → Oklch
  const C = Math.sqrt(a * a + b_ * b_);
  let h = Math.atan2(b_, a) * (180 / Math.PI);
  if (h < 0) h += 360;

  // 5) Format as l% c h, with a bit of rounding
  const lPercent = (L * 100).toFixed(4);
  const cValue = Number(C.toFixed(6));
  const hValue = Number(h.toFixed(3));

  if (cValue === 0) {
    return `${lPercent}% 0 0deg`;
  }

  return `${lPercent}% ${cValue} ${hValue}deg`;
}

export const getContrastOklch = (hexColor: string): string => {
  return isDarkHex(hexColor) ? '100% 0 0deg' : '0% 0 0deg';
};

export const getContrastHex = (hexColor: string): string => {
  return isDarkHex(hexColor) ? '#FFFFFF' : '#000000';
};

export const generateLightPalette = ({ bg, fg, primary }: BaseColor) => {
  return {
    'base-100': bg, // Main background
    'base-200': transformHexColor(bg, { lightness: -0.05 }), // Slightly darker
    'base-300': transformHexColor(bg, { lightness: -0.12 }), // More darker
    'base-content': fg, // Main text color
    neutral: transformHexColor(bg, { lightness: -0.15, saturation: -0.2 }), // Muted neutral
    'neutral-content': transformHexColor(fg, { lightness: 0.2, saturation: -0.2 }), // Slightly lighter text
    primary: primary,
    secondary: transformHexColor(primary, { lightness: 0.2 }), // Lighter secondary
    accent: transformHexColor(primary, { hue: -24 }), // Analogous accent
  } as Palette;
};

export const generateDarkPalette = ({ bg, fg, primary }: BaseColor) => {
  return {
    'base-100': bg, // Main background
    'base-200': transformHexColor(bg, { lightness: 0.05 }), // Slightly lighter
    'base-300': transformHexColor(bg, { lightness: 0.12 }), // More lighter
    'base-content': fg, // Main text color
    neutral: transformHexColor(bg, { lightness: 0.15, saturation: -0.2 }), // Muted neutral
    'neutral-content': transformHexColor(fg, { lightness: -0.2, saturation: -0.2 }), // Darkened text
    primary: primary,
    secondary: transformHexColor(primary, { lightness: -0.2 }), // Darker secondary
    accent: transformHexColor(primary, { hue: 120 }), // Triad accent
  } as Palette;
};

const _ = (stubKey: string) => stubKey;

export const themes = [
  {
    name: 'default',
    label: _('Default'),
    colors: {
      light: generateLightPalette({ fg: '#171717', bg: '#ffffff', primary: '#0066cc' }),
      dark: generateDarkPalette({ fg: '#e0e0e0', bg: '#222222', primary: '#77bbee' }),
    },
  },
  {
    name: 'gray',
    label: _('Gray'),
    colors: {
      light: generateLightPalette({ fg: '#222222', bg: '#e0e0e0', primary: '#4488cc' }),
      dark: generateDarkPalette({ fg: '#c6c6c6', bg: '#444444', primary: '#88ccee' }),
    },
  },
  {
    name: 'sepia',
    label: _('Sepia'),
    colors: {
      light: generateLightPalette({ fg: '#5b4636', bg: '#f1e8d0', primary: '#008b8b' }),
      dark: generateDarkPalette({ fg: '#ffd595', bg: '#342e25', primary: '#48d1cc' }),
    },
  },
  {
    name: 'grass',
    label: _('Grass'),
    colors: {
      light: generateLightPalette({ fg: '#232c16', bg: '#d7dbbd', primary: '#177b4d' }),
      dark: generateDarkPalette({ fg: '#d8deba', bg: '#333627', primary: '#a6d608' }),
    },
  },
  {
    name: 'cherry',
    label: _('Cherry'),
    colors: {
      light: generateLightPalette({ fg: '#4e1609', bg: '#f0d1d5', primary: '#de3838' }),
      dark: generateDarkPalette({ fg: '#e5c4c8', bg: '#462f32', primary: '#ff646e' }),
    },
  },
  {
    name: 'sky',
    label: _('Sky'),
    colors: {
      light: generateLightPalette({ fg: '#262d48', bg: '#cedef5', primary: '#2d53e5' }),
      dark: generateDarkPalette({ fg: '#babee1', bg: '#282e47', primary: '#ff646e' }),
    },
  },
  {
    name: 'solarized',
    label: _('Solarized'),
    colors: {
      light: generateLightPalette({ fg: '#586e75', bg: '#fdf6e3', primary: '#268bd2' }),
      dark: generateDarkPalette({ fg: '#93a1a1', bg: '#002b36', primary: '#268bd2' }),
    },
  },
  {
    name: 'gruvbox',
    label: _('Gruvbox'),
    colors: {
      light: generateLightPalette({ fg: '#3c3836', bg: '#fbf1c7', primary: '#076678' }),
      dark: generateDarkPalette({ fg: '#ebdbb2', bg: '#282828', primary: '#83a598' }),
    },
  },
  {
    name: 'nord',
    label: _('Nord'),
    colors: {
      light: generateLightPalette({ fg: '#2e3440', bg: '#eceff4', primary: '#5e81ac' }),
      dark: generateDarkPalette({ fg: '#d8dee9', bg: '#2e3440', primary: '#88c0d0' }),
    },
  },
  {
    name: 'contrast',
    label: _('Contrast'),
    colors: {
      light: generateLightPalette({ fg: '#000000', bg: '#ffffff', primary: '#4488cc' }),
      dark: generateDarkPalette({ fg: '#ffffff', bg: '#000000', primary: '#88ccee' }),
    },
  },
  {
    name: 'sunset',
    label: _('Sunset'),
    colors: {
      light: generateLightPalette({ fg: '#423126', bg: '#fff7f0', primary: '#fe6b64' }),
      dark: generateDarkPalette({ fg: '#f6e1d7', bg: '#3c2b25', primary: '#ff9c94' }),
    },
  },
] as Theme[];

const generateCustomThemeVariables = (palette: Palette, fallbackIncluded = false): string => {
  const colors = `
    --b1: ${hexToOklch(palette['base-100'])};
    --b2: ${hexToOklch(palette['base-200'])};
    --b3: ${hexToOklch(palette['base-300'])};
    --bc: ${hexToOklch(palette['base-content'])};
    
    --p: ${hexToOklch(palette.primary)};
    --pc: ${getContrastOklch(palette.primary)};
    
    --s: ${hexToOklch(palette.secondary)};
    --sc: ${getContrastOklch(palette.secondary)};
    
    --a: ${hexToOklch(palette.accent)};
    --ac: ${getContrastOklch(palette.accent)};
    
    --n: ${hexToOklch(palette.neutral)};
    --nc: ${hexToOklch(palette['neutral-content'])};
    
    --in: 69.37% 0.047 231deg;
    --inc: 100% 0 0deg;
    --su: 78.15% 0.12 160deg;
    --suc: 100% 0 0deg;
    --wa: 90.69% 0.123 84deg;
    --wac: 0% 0 0deg;
    --er: 70.9% 0.184 22deg;
    --erc: 100% 0 0deg;
  `;

  const fallbackColors = `
    --fallback-b1: ${palette['base-100']};
    --fallback-b2: ${palette['base-200']};
    --fallback-b3: ${palette['base-300']};
    --fallback-bc: ${palette['base-content']};

    --fallback-p: ${palette.primary};
    --fallback-pc: ${getContrastHex(palette.primary)};

    --fallback-s: ${palette.secondary};
    --fallback-sc: ${getContrastHex(palette.secondary)};

    --fallback-a: ${palette.accent};
    --fallback-ac: ${getContrastHex(palette.accent)};

    --fallback-n: ${palette.neutral};
    --fallback-nc: ${palette['neutral-content']};

    --fallback-in: #ff0000;
    --fallback-inc: #ffffff;
    --fallback-su: #00ff00;
    --fallback-suc: #000000;
    --fallback-wa: #ffff00;
    --fallback-wac: #000000;
    --fallback-er: #ff8000;
    --fallback-erc: #000000;
  `;

  return colors + (fallbackIncluded ? fallbackColors : '');
};

export const applyCustomTheme = (
  customTheme?: CustomTheme,
  themeName?: string,
  fallbackIncluded = false,
) => {
  if (!customTheme && !themeName) return;

  const lightThemeName = customTheme ? `${customTheme.name}-light` : `${themeName}-light`;
  const darkThemeName = customTheme ? `${customTheme.name}-dark` : `${themeName}-dark`;

  const lightPalette = customTheme
    ? generateLightPalette(customTheme.colors.light)
    : (themes.find((t) => t.name === themeName) || themes[0]!).colors.light;

  const darkPalette = customTheme
    ? generateDarkPalette(customTheme.colors.dark)
    : (themes.find((t) => t.name === themeName) || themes[0]!).colors.dark;

  const css = `
    [data-theme="${lightThemeName}"] {
      ${generateCustomThemeVariables(lightPalette, fallbackIncluded)}
    }
    
    [data-theme="${darkThemeName}"] {
      ${generateCustomThemeVariables(darkPalette, fallbackIncluded)}
    }
    
    :root {
      --${lightThemeName}: 1;
      --${darkThemeName}: 1;
    }
  `;

  const styleElement = document.createElement('style');
  styleElement.id = `theme-${customTheme ? customTheme.name : themeName}-styles`;
  styleElement.textContent = css;

  const existingStyle = document.getElementById(styleElement.id);
  if (existingStyle) {
    existingStyle.remove();
  }

  document.head.appendChild(styleElement);

  return {
    light: lightThemeName,
    dark: darkThemeName,
  };
};
