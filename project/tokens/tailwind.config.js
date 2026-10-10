// Sono Studio Tailwind config. Colours resolve to the CSS variables in sono-tokens.css,
// so light/dark switch by toggling data-theme on <html>.
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx,js,jsx,html}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      ink: '#16140F',
      paper: '#F7F5F1',
      terracotta: { DEFAULT: '#B4502E', hover: '#A24627', light: '#DB7C58' },
      bg: 'var(--color-bg)',
      surface: { DEFAULT: 'var(--color-surface)', raised: 'var(--color-surface-raised)' },
      border: 'var(--color-border)',
      text: { DEFAULT: 'var(--color-text)', muted: 'var(--color-text-muted)' },
      accent: { DEFAULT: 'var(--color-accent)', text: 'var(--color-accent-text)', on: 'var(--color-on-accent)' },
      success: 'var(--color-success)',
      warning: { DEFAULT: 'var(--color-warning)', text: 'var(--color-warning-text)' },
      danger: 'var(--color-danger)',
      stage: 'var(--color-stage)',
      hover: 'var(--color-hover)',
      selected: 'var(--color-selected)',
      white: '#FFFFFF',
    },
    fontFamily: {
      sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
    },
    fontSize: {
      12: ['12px', { lineHeight: '16px' }],
      14: ['14px', { lineHeight: '20px' }],
      16: ['16px', { lineHeight: '24px' }],
      20: ['20px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
      28: ['28px', { lineHeight: '34px', letterSpacing: '-0.015em' }],
      40: ['40px', { lineHeight: '44px', letterSpacing: '-0.02em' }],
    },
    spacing: { 0: '0', px: '1px', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px' },
    borderRadius: { none: '0', sm: '8px', md: '10px', card: '14px', dialog: '16px', full: '999px' },
    extend: {
      boxShadow: { raised: 'var(--shadow-raised)', focus: 'var(--focus-ring)' },
      transitionTimingFunction: { out: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      transitionDuration: { panel: '180ms', press: '90ms' },
      keyframes: {
        'ring-orbit': { to: { transform: 'rotate(360deg)' } },
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
        'edit-flash': { '0%': { outlineColor: '#B4502E' }, '100%': { outlineColor: 'transparent' } },
      },
      animation: {
        'ring-orbit': 'ring-orbit 1.6s linear infinite',
        'fade-up': 'fade-up 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        'edit-flash': 'edit-flash 1.2s ease-out',
      },
    },
  },
};
