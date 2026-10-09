/**
 * Stone design tokens — plain data module consumed by the build.
 *
 * Provenance: generated via `npx @astryxdesign/cli theme add stone`
 * (@astryxdesign/cli v0.6.3) on 2026-10-01. The CLI's verbatim output
 * (stoneTheme.ts, which imports from '@astryxdesign/core/theme') is not
 * bundled — this app renders its own components, so the theme's token
 * *values* are extracted here as plain data and wired into Tailwind
 * (tailwind.config.js) and CSS (index.css). This is our copy to own.
 *
 * Stone is a warm, earthy neutral: monochrome accent (#28282A family),
 * pastel categorical badges, pill buttons, Montserrat headings.
 */

export const stone = {
  color: {
    // Core surfaces (light mode)
    bgBody: '#f3f3f5',
    bgSurface: '#ffffff',
    bgCard: '#ffffff',
    bgMuted: '#e2e2e8',
    bgInverted: '#25252a',

    // Text
    textPrimary: '#25252a',
    textSecondary: '#5e5e63',
    textDisabled: '#d7d7da',

    // Borders
    border: '#e2e2e8',
    borderEmphasized: '#83838a',

    // Accent — monochrome. Primary actions are dark stone.
    accent: '#25252a',
    accentHover: '#1b1b1f',
    onAccent: '#ffffff',

    // Interaction overlays
    overlayHover: '#25252a0d',
    overlayPressed: '#25252a1a',

    // Skeleton / shadow base
    skeleton: '#d4d4da',

    // Sentiment — pastel surface + deep text (Stone categorical)
    successBg: '#d0e9ce',
    successText: '#374c36',
    successBorder: '#c2dbc0',
    warningBg: '#f4e1b7',
    warningText: '#524622',
    warningBorder: '#e5d3a9',
    errorBg: '#f9dcd7',
    errorText: '#58413e',
    errorBorder: '#ebcec9',
    infoBg: '#d7e4f5',
    infoText: '#3c4856',
    infoBorder: '#c9d6e7',
    neutralBg: '#e2e2e8',
    neutralText: '#46464b',
    neutralBorder: '#d4d4da',
  },

  radius: {
    element: '0.5rem', // 8px — inputs, small controls
    container: '0.75rem', // 12px — cards
    page: '1.5rem', // page-level rounding
    full: '9999px', // pills — Stone buttons are fully rounded
  },

  shadow: {
    low: '0 2px 4px #28282A0D, 0 4px 8px #28282A1A',
    med: '0 2px 4px #28282A0D, 0 4px 12px #28282A1A',
    high: '0 4px 6px #28282A1A, 0 12px 24px #28282A26',
  },

  font: {
    heading: 'Montserrat',
    body: 'Figtree',
    code: '"JetBrains Mono"',
  },

  motion: {
    fast: 125,
    medium: 300,
    slow: 700,
  },
} as const;

export type StoneTokens = typeof stone;
