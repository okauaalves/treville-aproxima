import type { TextStyle } from 'react-native';

export const typography = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
  },
  headline: {
    fontSize: 18,
    lineHeight: 26,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  Display: { fontSize: 32, lineHeight: 40, fontWeight: '800' },
  H1: { fontSize: 28, lineHeight: 34, fontWeight: '800' },
  H2: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  H3: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  Body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  BodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  Caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  Button: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  Label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;

export type TextScale = 'A' | 'A+' | 'A++';

export const TEXT_SCALES: Record<TextScale, number> = {
  A: 1,
  'A+': 1.15,
  'A++': 1.3,
};
