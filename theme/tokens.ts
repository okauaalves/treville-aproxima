/** Tokens tirados do mockup claro. O escuro reusa raio, espaço e sombra com superfícies sólidas. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radius = {
  sm: 12,
  md: 14,
  lg: 16,
  button: 14,
  card: 16,
  pill: 999,
} as const;

export const shadows = {
  card: '0px 2px 8px rgba(30, 58, 138, 0.08)',
  none: 'none',
} as const;

export const sizes = {
  touch: 44,
  button: 56,
  icon: 22,
  badge: 40,
} as const;

export const transitions = {
  fast: 160,
  base: 240,
} as const;
