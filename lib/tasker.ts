import { Linking, Platform } from 'react-native';
import { getApplicationIconAsync, openApplication } from 'expo-intent-launcher';

export const TASKER_PACKAGE = 'net.dinglisch.android.taskerm';
export const TASKER_PLAY_URL = `https://play.google.com/store/apps/details?id=${TASKER_PACKAGE}`;

/** Depende do <queries> do plugins/withTaskerQueries.js (visibilidade de pacotes no Android 11+). */
export async function isTaskerInstalled(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  try {
    await getApplicationIconAsync(TASKER_PACKAGE);
    return true;
  } catch {
    return false;
  }
}

export async function openTaskerOrStore(): Promise<'opened' | 'store'> {
  if (Platform.OS === 'android') {
    try {
      openApplication(TASKER_PACKAGE);
      return 'opened';
    } catch {
      await Linking.openURL(`market://details?id=${TASKER_PACKAGE}`).catch(() => Linking.openURL(TASKER_PLAY_URL));
      return 'store';
    }
  }
  await Linking.openURL(TASKER_PLAY_URL);
  return 'store';
}

export async function openShortcuts(): Promise<void> {
  await Linking.openURL('shortcuts://').catch(() => Linking.openURL('https://apps.apple.com/app/id915249334'));
}
