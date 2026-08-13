import type { Config } from 'tailwindcss';
import { themes } from './src/styles/themes.ts';
import daisyui from 'daisyui';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
      },
    },
  },
  plugins: [
    daisyui,
    plugin(function ({ addVariant }) {
      addVariant('eink', 'html[data-eink="true"] &');
      addVariant('not-eink', 'html:not([data-eink="true"]) &');
    }),
  ],
  daisyui: {
    logs: false,
    themes: [
      {
        'default-light': themes[0]!.colors.light,
      },
      {
        'default-dark': themes[0]!.colors.dark,
      },
    ],
  },
};
export default config;
