import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Trading dashboard color palette
        dashboard: {
          bg: '#0f1117',
          surface: '#1a1d27',
          border: '#2a2d3e',
          accent: '#3b82f6',
        },
        signal: {
          bullish: '#22c55e',
          bearish: '#ef4444',
          neutral: '#f59e0b',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
