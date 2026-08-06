import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          // Primary blue + green tuned to match the AF logo:
          // - blue: bright royal blue from the A letter
          // - green: bright lime green from the F letter
          blue: '#1E50B5',
          'blue-dark': '#0F2E6E',
          'blue-light': '#4A7DD9',
          green: '#5CB82C',
          'green-dark': '#3D8B0F',
          'green-light': '#8FD65E',
          navy: '#0A1628',
          bg: '#F5F7FA',
        },
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};

export default config;
