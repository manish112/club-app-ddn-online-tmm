import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Modernized primary — vibrant crimson (evolved from TM maroon)
        maroon: {
          DEFAULT: '#C41E3A',
          50:  '#fff0f2',
          100: '#ffe0e5',
          200: '#ffb8c5',
          300: '#ff7a95',
          400: '#ff3d6b',
          500: '#f50041',
          600: '#db0035',
          700: '#C41E3A',
          800: '#9d1530',
          900: '#7a122a',
          950: '#430010',
        },
        // Modernized secondary — rich deep cobalt (evolved from TM navy)
        navy: {
          DEFAULT: '#0E2D6A',
          50:  '#eef4ff',
          100: '#dce9ff',
          200: '#b8d3ff',
          300: '#82aaff',
          400: '#4d7dff',
          500: '#2355f5',
          600: '#163ce8',
          700: '#0E2D6A',
          800: '#071b50',
          900: '#040e30',
          950: '#020920',
        },
        cream: {
          DEFAULT: '#F5EDD9',
          50:  '#fefcf7',
          100: '#fdf7ec',
          200: '#F5EDD9',
          300: '#eadbb8',
          400: '#dcc490',
          500: '#ceac69',
        },
        gold: {
          DEFAULT: '#F5BD41',
          50:  '#fffaeb',
          100: '#fff3c4',
          200: '#ffe88a',
          300: '#F5BD41',
          400: '#e09b17',
          500: '#c47d0d',
          800: '#7a4508',
          950: '#3c1f02',
        },
      },
      fontFamily: {
        serif: ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
        sans:  ['var(--font-source-sans)', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'brand-gradient':      'linear-gradient(135deg, #C41E3A 0%, #0E2D6A 100%)',
        'brand-gradient-soft': 'linear-gradient(135deg, rgba(196,30,58,0.15) 0%, rgba(14,45,106,0.15) 100%)',
        'header-gradient':     'linear-gradient(135deg, #9d1530 0%, #0E2D6A 100%)',
      },
      boxShadow: {
        'glow-crimson': '0 0 24px -4px rgba(196,30,58,0.35)',
        'glow-navy':    '0 0 24px -4px rgba(14,45,106,0.35)',
        'card-dark':    '0 4px 32px rgba(0,0,0,0.45)',
        'card-light':   '0 2px 16px rgba(0,0,0,0.07)',
        'modal-dark':   '0 8px 48px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};

export default config;
