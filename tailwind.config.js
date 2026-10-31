/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        metro: {
          yellow: '#FFCC00',
          red: '#E21F26',
          blue: '#0066B3',
          violet: '#7E3F98',
          green: '#00A650',
        },
      },
    },
  },
  plugins: [],
};
