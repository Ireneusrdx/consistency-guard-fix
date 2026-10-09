/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f3f3f5',
        border: '#E2E2E8',
        // Stone accent ramp — monochrome dark (#25252a family). Primary
        // actions are dark stone with white text (Astryx Stone --color-accent).
        primary: {
          50: '#f3f3f5',
          100: '#e9e9ed',
          200: '#d8d8de',
          300: '#bdbdc4',
          400: '#96969e',
          500: '#6e6e76',
          600: '#25252a',
          700: '#1b1b1f',
          800: '#141417',
          900: '#0f0f12',
        },
        // Legacy teal accent names now resolve to the Stone dark ramp so
        // existing pages render in the Stone language without logic changes.
        brand: {
          50: '#f3f3f5',
          100: '#e9e9ed',
          200: '#d8d8de',
          300: '#bdbdc4',
          400: '#96969e',
          500: '#6e6e76',
          600: '#25252a',
          700: '#1b1b1f',
          800: '#141417',
          900: '#0f0f12',
        },
        secondary: {
          50: '#f3f3f5',
          100: '#e9e9ed',
          200: '#d8d8de',
          300: '#bdbdc4',
          400: '#96969e',
          500: '#6e6e76',
          600: '#25252a',
          700: '#1b1b1f',
          800: '#141417',
          900: '#0f0f12',
        },
        // Stone categorical sentiment (pastel bg + deep text).
        moss: { 100: '#d0e9ce', 200: '#c2dbc0', 700: '#374c36' },
        sand: { 100: '#f4e1b7', 200: '#e5d3a9', 700: '#524622' },
        clay: { 100: '#f9dcd7', 200: '#ebcec9', 700: '#58413e' },
        glacier: { 100: '#d7e4f5', 200: '#c9d6e7', 700: '#3c4856' },
        pebble: { 100: '#e2e2e8', 200: '#d4d4da', 700: '#46464b' },
      },
      fontFamily: {
        // Stone: Figtree body, Montserrat headings, JetBrains Mono code.
        sans: [
          'Figtree',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
        display: [
          'Montserrat',
          'Figtree',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"SF Mono"',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 2px 4px #28282A0D, 0 4px 8px #28282A1A',
        'card-hover': '0 2px 4px #28282A0D, 0 12px 24px -8px #28282A26',
        pop: '0 4px 6px #28282A1A, 0 16px 32px -12px #28282A26',
      },
    },
  },
  plugins: [],
};
