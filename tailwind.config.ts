import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#1A1A1A',
        card: '#252525',
        surface: '#2E2E2E',
        surface2: '#383838',
        red: '#E50914',
        gold: '#F5C518',
        pink: '#F050C2',
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] },
    },
  },
  plugins: [],
};
export default config;
