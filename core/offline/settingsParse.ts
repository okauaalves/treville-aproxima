import type { ThemePreference } from '@/theme/colors';
import type { TextScale } from '@/theme/typography';

export type ReadMode = 'standard' | 'advanced' | 'technical';

export interface SettingsSnapshot {
  theme: ThemePreference;
  language: string;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  readMode: ReadMode;
  reduceAnimations: boolean;
  historyRetentionDays: number;
  detectionTimeoutSec: number;
  textScale: TextScale;
}

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  theme: 'light',
  language: 'pt-BR',
  soundEnabled: true,
  vibrationEnabled: true,
  readMode: 'standard',
  reduceAnimations: false,
  historyRetentionDays: 90,
  detectionTimeoutSec: 30,
  textScale: 'A',
};

export function parseTheme(value: string | undefined): ThemePreference {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return DEFAULT_SETTINGS.theme;
}

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }
  return fallback;
}

export function parseReadMode(value: string | undefined): ReadMode {
  if (value === 'standard' || value === 'advanced' || value === 'technical') {
    return value;
  }
  return DEFAULT_SETTINGS.readMode;
}

export function parseTextScale(value: string | undefined): TextScale {
  if (value === 'A' || value === 'A+' || value === 'A++') {
    return value;
  }
  return DEFAULT_SETTINGS.textScale;
}

export function parseIntSetting(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function parseSettings(raw: Record<string, string>, systemReduce = false): SettingsSnapshot {
  return {
    theme: parseTheme(raw.theme),
    language: raw.language || DEFAULT_SETTINGS.language,
    soundEnabled: parseBoolean(raw.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
    vibrationEnabled: parseBoolean(raw.vibrationEnabled, DEFAULT_SETTINGS.vibrationEnabled),
    readMode: parseReadMode(raw.readMode),
    reduceAnimations: raw.reduceAnimations == null
      ? systemReduce
      : parseBoolean(raw.reduceAnimations, systemReduce),
    historyRetentionDays: parseIntSetting(raw.historyRetentionDays, DEFAULT_SETTINGS.historyRetentionDays),
    detectionTimeoutSec: parseIntSetting(raw.detectionTimeoutSec, DEFAULT_SETTINGS.detectionTimeoutSec),
    textScale: parseTextScale(raw.textScale),
  };
}
