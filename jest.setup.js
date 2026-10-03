jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-nfc-manager', () => {
  const ndef = jest.requireActual('react-native-nfc-manager/ndef-lib');
  return {
  __esModule: true,
  default: {
    start: jest.fn(async () => undefined),
    isSupported: jest.fn(async () => false),
    isEnabled: jest.fn(async () => false),
    setEventListener: jest.fn(),
    registerTagEvent: jest.fn(async () => undefined),
    unregisterTagEvent: jest.fn(async () => undefined),
    requestTechnology: jest.fn(async () => 'Ndef'),
    cancelTechnologyRequest: jest.fn(async () => undefined),
    getTag: jest.fn(async () => null),
    goToNfcSetting: jest.fn(async () => false),
    ndefHandler: {
      writeNdefMessage: jest.fn(async () => undefined),
      getNdefMessage: jest.fn(async () => null),
      makeReadOnly: jest.fn(async () => undefined),
      getNdefStatus: jest.fn(async () => ({ status: 2, capacity: 144 })),
    },
  },
  NfcTech: { Ndef: 'Ndef' },
  NfcEvents: { DiscoverTag: 'DiscoverTag', SessionClosed: 'SessionClosed' },
  NdefStatus: { ReadWrite: 2, ReadOnly: 1 },
  Ndef: ndef,
  };
});
