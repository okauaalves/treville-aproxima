import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Expo Go não inclui react-native-nfc-manager.
 * `appOwnership === 'expo'` está deprecado; o sinal atual é executionEnvironment.
 */
export function isExpoGo(): boolean {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return true;
  }
  return Constants.appOwnership === 'expo';
}
