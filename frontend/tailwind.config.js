/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        polar: {
          50: '#eef5f7',
          100: '#d5e6ea',
          200: '#a8c6cf',
          300: '#7ba6b5',
          400: '#4a869a',
          500: '#23627a',
          600: '#154a5e',
          700: '#0d3545',
          800: '#0a2935',
          900: '#071f28',
          950: '#041218',
        },
        ice: {
          low: '#22c55e',
          moderate: '#f59e0b',
          high: '#f97316',
          'very-high': '#ef4444',
        },
      },
    },
  },
  plugins: [],
};
