import { create } from 'zustand';

import { getAllSettings, setSetting } from '@/core/offline/database';
import { DEFAULT_SETTINGS, parseSettings, type ReadMode, type SettingsSnapshot } from '@/core/offline/settingsParse';
import type { ThemePreference } from '@/theme/colors';
import type { TextScale } from '@/theme/typography';
import { useToastStore } from '@/stores/toastStore';

interface SettingsState extends SettingsSnapshot {
  hydrated: boolean;
  loadFromDatabase: (systemReduce?: boolean) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  setSoundEnabled: (value: boolean) => Promise<void>;
  setVibrationEnabled: (value: boolean) => Promise<void>;
  setReadMode: (mode: ReadMode) => Promise<void>;
  setReduceAnimations: (value: boolean) => Promise<void>;
  setHistoryRetentionDays: (days: number) => Promise<void>;
  setDetectionTimeoutSec: (seconds: number) => Promise<void>;
  setTextScale: (scale: TextScale) => Promise<void>;
}

async function persist<K extends keyof SettingsSnapshot>(key: K, value: SettingsSnapshot[K], previous: SettingsSnapshot[K]) {
  try {
    await setSetting(key, String(value));
  } catch (error) {
    useSettingsStore.setState({ [key]: previous });
    useToastStore.getState().show('Não foi possível salvar o ajuste.', 'error');
    throw error;
  }
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  loadFromDatabase: async (systemReduce = false) => {
    const raw = await getAllSettings();
    set({ ...parseSettings(raw, systemReduce), hydrated: true });
  },
  setTheme: async (theme) => {
    const previous = get().theme;
    set({ theme });
    await persist('theme', theme, previous);
  },
  setLanguage: async (language) => {
    const previous = get().language;
    set({ language });
    await persist('language', language, previous);
  },
  setSoundEnabled: async (soundEnabled) => {
    const previous = get().soundEnabled;
    set({ soundEnabled });
    await persist('soundEnabled', soundEnabled, previous);
  },
  setVibrationEnabled: async (vibrationEnabled) => {
    const previous = get().vibrationEnabled;
    set({ vibrationEnabled });
    await persist('vibrationEnabled', vibrationEnabled, previous);
  },
  setReadMode: async (readMode) => {
    const previous = get().readMode;
    set({ readMode });
    await persist('readMode', readMode, previous);
  },
  setReduceAnimations: async (reduceAnimations) => {
    const previous = get().reduceAnimations;
    set({ reduceAnimations });
    await persist('reduceAnimations', reduceAnimations, previous);
  },
  setHistoryRetentionDays: async (historyRetentionDays) => {
    const previous = get().historyRetentionDays;
    set({ historyRetentionDays });
    await persist('historyRetentionDays', historyRetentionDays, previous);
  },
  setDetectionTimeoutSec: async (detectionTimeoutSec) => {
    const previous = get().detectionTimeoutSec;
    set({ detectionTimeoutSec });
    await persist('detectionTimeoutSec', detectionTimeoutSec, previous);
  },
  setTextScale: async (textScale) => {
    const previous = get().textScale;
    set({ textScale });
    await persist('textScale', textScale, previous);
  },
}));
