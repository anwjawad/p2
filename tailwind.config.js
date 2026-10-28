// Tailwind is compiled at build time (scripts/build.mjs) instead of running the
// Play CDN in the browser. Every colour family maps onto the generated design
// tokens in web/css/tokens.css, so light/dark themes come from CSS variables.
const ramp = (name) => Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(s => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`])
);
const neutral = ramp('neutral');
const accent = ramp('accent');
const plum = ramp('plum');
const critical = ramp('critical');
const warning = ramp('warning');
const positive = ramp('positive');

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./web/index.html', './web/js/**/*.js'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      black: '#000',
      white: 'rgb(var(--white) / <alpha-value>)',
      slate: neutral, gray: neutral, zinc: neutral, neutral, stone: neutral,
      medical: accent, teal: accent, cyan: accent, sky: accent, blue: accent, indigo: accent, accent,
      violet: plum, purple: plum, fuchsia: plum, pink: plum, plum,
      red: critical, rose: critical, critical,
      orange: warning, amber: warning, yellow: warning, warning,
      green: positive, emerald: positive, lime: positive, positive,
      danger: 'rgb(var(--critical-600) / <alpha-value>)',
      success: 'rgb(var(--positive-600) / <alpha-value>)',
    },
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"IBM Plex Sans Arabic"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
