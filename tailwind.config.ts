import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          blue: '#0B4F8B',
          green: '#2E9D5C',
          navy: '#0A1628',
          bg: '#F5F7FA',
        },
        cgb: {
          orange: '#FF5A1F',
          amber: '#FFB020',
          ink: '#15141F',
          bg: '#FBF7F2',
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
