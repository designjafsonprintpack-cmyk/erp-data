import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    // ─────────────────────────────────────────────────────────────────────
    // BREAKPOINT CONTRACT
    //
    // These are Tailwind's stock values, declared explicitly so the device
    // meaning of each prefix lives in the codebase instead of in someone's
    // head. Values are UNCHANGED — declaring them cannot alter any existing
    // class. Mirrored in src/app/globals.css.
    //
    //   (none)  < 768px       Mobile   single column, sheets, card lists
    //   md:     768–1023px    Tablet   2-col forms, condensed tables
    //   lg:     1024–1279px   Desktop  persistent sidebar, full tables
    //   xl:     >= 1280px     Wide     current desktop layout, unchanged
    //
    // `sm:` (640px) is retained for compatibility but should NOT be used for
    // new layout decisions — it splits the mobile tier in half and is the
    // main reason breakpoint usage has been inconsistent so far.
    // ─────────────────────────────────────────────────────────────────────
    /* ── Control height contract (R8) ──────────────────────────────────────
       Three tiers, applied as responsive pairs — not five ad-hoc sizes:

         TOUCH    h-11 (44px)  every interactive control below md
         DESKTOP  h-9 / h-8 / h-7 (36/32/28px) the existing compact sizes at md+
         OPERATOR h-14 (56px)  primary actions on factory-floor screens
                               (department queue Start/Complete, scan actions)

       The pattern everywhere is `h-11 md:h-9` (or md:h-8 / md:h-7 to match
       whatever the desktop design already used — desktop is never resized).
       New controls must pick from these tiers; do not introduce new heights. */
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        erp: {
          'bg-primary': 'var(--color-bg-primary)',
          'bg-secondary': 'var(--color-bg-secondary)',
          'bg-elevated': 'var(--color-bg-elevated)',
          'border': 'var(--color-border)',
          'border-subtle': 'var(--color-border-subtle)',
          'text-primary': 'var(--color-text-primary)',
          'text-secondary': 'var(--color-text-secondary)',
          'text-muted': 'var(--color-text-muted)',
          'accent': 'var(--color-accent)',
          'accent-hover': 'var(--color-accent-hover)',
          'success': 'var(--color-success)',
          'warning': 'var(--color-warning)',
          'danger': 'var(--color-danger)',
          'info': 'var(--color-info)',
          'muted': 'var(--color-muted)',
        }
      },
      fontFamily: {
        sans: ['-apple-system', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"SF Mono"', 'Consolas', '"Liberation Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['13px', { lineHeight: '1.5' }],
        'base': ['14px', { lineHeight: '1.5' }],
        'md': ['16px', { lineHeight: '1.5' }],
        'lg': ['18px', { lineHeight: '1.4' }],
        'xl': ['20px', { lineHeight: '1.3' }],
        '2xl': ['24px', { lineHeight: '1.2' }],
        '3xl': ['28px', { lineHeight: '1.2' }],
      },
      spacing: {
        '4.5': '18px',
        '18': '72px',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-in': 'slideIn 0.2s ease-out',
        'pulse-once': 'pulse 0.6s ease-in-out 1',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideIn: { '0%': { opacity: '0', transform: 'translateY(-8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}

export default config
