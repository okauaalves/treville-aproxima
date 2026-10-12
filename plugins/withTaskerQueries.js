const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Android 11+ esconde outros apps por padrão (package visibility). Sem este <queries> o app não
 * consegue saber se o Tasker está instalado nem abri-lo pelo pacote (lib/tasker.ts).
 */
const PACKAGES = ['net.dinglisch.android.taskerm'];

module.exports = function withTaskerQueries(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const queries = manifest.queries ?? [];
    if (queries.length === 0) {
      queries.push({});
    }
    const block = queries[0];
    const existing = new Set((block.package ?? []).map((item) => item.$?.['android:name']));
    block.package = [
      ...(block.package ?? []),
      ...PACKAGES.filter((name) => !existing.has(name)).map((name) => ({ $: { 'android:name': name } })),
    ];
    manifest.queries = queries;
    return mod;
  });
};
