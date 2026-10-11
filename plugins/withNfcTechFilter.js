const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * Filtros NFC da MainActivity. Ficam aqui (e não em android.intentFilters do app.json) porque o
 * Expo prefixa toda action com "android.intent.action.", o que não serve para android.nfc.action.*.
 * - NDEF_DISCOVERED com scheme https (sem autoVerify): oferece o app no seletor para tags com link.
 * - TECH_DISCOVERED + meta-data @xml/nfc_tech_filter: cada tech-list casa sozinha.
 * - TAG_DISCOVERED: prioridade mais baixa, só quando nenhum outro app trata a tag.
 * Com o app aberto quem garante a prioridade é o reader mode (core/nfc/NfcManager.ts).
 */
const NFC_ACTIONS = ['android.nfc.action.NDEF_DISCOVERED', 'android.nfc.action.TECH_DISCOVERED', 'android.nfc.action.TAG_DISCOVERED'];
const TECHS = ['android.nfc.tech.Ndef', 'android.nfc.tech.NdefFormatable', 'android.nfc.tech.NfcA', 'android.nfc.tech.MifareUltralight'];

const TECH_FILTER_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources xmlns:xliff="urn:oasis:names:tc:xliff:document:1.2">',
  ...TECHS.map((tech) => `    <tech-list>\n        <tech>${tech}</tech>\n    </tech-list>`),
  '</resources>',
  '',
].join('\n');

function isNfcFilter(filter) {
  return (filter.action ?? []).some((action) => NFC_ACTIONS.includes(action.$?.['android:name']));
}

function withNfcManifest(config) {
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const filters = (activity['intent-filter'] ?? []).filter((filter) => !isNfcFilter(filter));
    filters.push(
      {
        action: [{ $: { 'android:name': 'android.nfc.action.NDEF_DISCOVERED' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
        data: [{ $: { 'android:scheme': 'https' } }],
      },
      {
        action: [{ $: { 'android:name': 'android.nfc.action.TECH_DISCOVERED' } }],
      },
      {
        action: [{ $: { 'android:name': 'android.nfc.action.TAG_DISCOVERED' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      },
    );
    activity['intent-filter'] = filters;
    const meta = (activity['meta-data'] ?? []).filter((item) => item.$?.['android:name'] !== 'android.nfc.action.TECH_DISCOVERED');
    meta.push({ $: { 'android:name': 'android.nfc.action.TECH_DISCOVERED', 'android:resource': '@xml/nfc_tech_filter' } });
    activity['meta-data'] = meta;
    return mod;
  });
}

function withNfcTechXml(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'nfc_tech_filter.xml'), TECH_FILTER_XML);
      return mod;
    },
  ]);
}

module.exports = function withNfcTechFilter(config) {
  return withNfcTechXml(withNfcManifest(config));
};
