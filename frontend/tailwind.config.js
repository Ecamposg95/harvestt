/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        'bg-2': token('bg-2'),
        surface: token('surface'),
        raised: token('raised'),
        border: token('border'),
        fg: token('fg'),
        muted: token('muted'),
        accent: token('accent'),
        'accent-fg': token('accent-fg'),
        lime: token('lime'),
        ink: token('ink'),
        'ink-fg': token('ink-fg'),
        danger: token('danger'),
        warning: token('warning'),
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        glass: '0 8px 30px rgb(40 60 30 / 0.08)',
      },
    },
  },
  plugins: [],
}
