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
  pill: 999,
} as const;

export const shadows = {
  card: '0px 4px 10px rgba(15, 23, 42, 0.06)',
  none: 'none',
} as const;

export const sizes = {
  touch: 44,
  button: 56,
  icon: 22,
  column: 480,
  badge: 40,
} as const;

export const transitions = {
  fast: 160,
  base: 240,
} as const;
