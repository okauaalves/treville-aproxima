// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  { ignores: ["dist/*", ".expo/**", ".chrome-capture/**", "screenshots/**"] },
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    files: ["jest.setup.js", "__tests__/**/*.{js,ts,tsx}"],
    languageOptions: {
      globals: {
        jest: "readonly",
      },
    },
  },
]);
