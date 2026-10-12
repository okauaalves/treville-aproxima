// AsyncStorage em memória para o bundle de servidor (API routes / manifesto do Expo Router).
// No Node não há `window.localStorage`; nada aqui é persistido nem compartilhado com o cliente.
const store = new Map();

const AsyncStorage = {
  getItem: async (key) => (store.has(key) ? store.get(key) : null),
  setItem: async (key, value) => {
    store.set(key, String(value));
  },
  removeItem: async (key) => {
    store.delete(key);
  },
  mergeItem: async (key, value) => {
    store.set(key, value);
  },
  clear: async () => {
    store.clear();
  },
  getAllKeys: async () => [...store.keys()],
  multiGet: async (keys) => keys.map((key) => [key, store.has(key) ? store.get(key) : null]),
  multiSet: async (pairs) => {
    for (const [key, value] of pairs) {
      store.set(key, String(value));
    }
  },
  multiRemove: async (keys) => {
    for (const key of keys) {
      store.delete(key);
    }
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
