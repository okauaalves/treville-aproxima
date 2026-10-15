import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AtSign,
  Calendar,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  IdCard,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  Nfc,
  Phone,
  RotateCcw,
  Share2,
  ShieldAlert,
  Smartphone,
  SmartphoneNfc,
  Type,
  User,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { NfcPulse } from '@/components/nfc/NfcPulse';
import { Config } from '@/constants/config';
import { SuspiciousLinkWarning } from '@/components/nfc/SuspiciousLinkWarning';
import { nfcManager } from '@/core/nfc/NfcManager';
import { getPendingRead, setPendingRead } from '@/core/nfc/pendingRead';
import { formatUid } from '@/core/nfc/TagAnalyzer';
import { CHIP_LABELS, describeRecord, identifyTechnologies } from '@/core/nfc/technical';
import { useDispatchState, useReadLock, useTagDispatch } from '@/hooks/useTagDispatch';
import { plaquinhaCodeFromLink } from '@/lib/editAccessLogic';
import { openNfcFlow } from '@/lib/nfcEntry';
import { getPlaquinha, plaquinhasAvailable } from '@/lib/plaquinhas';
import { persistReadOperation, summarizeRead, type ReadKind } from '@/lib/readResult';
import { useAuthStore } from '@/stores/authStore';
import { useNfcStore } from '@/stores/nfcStore';
import { useToastStore } from '@/stores/toastStore';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';
import type { NfcTag, ParsedRecord } from '@/types/nfc';

const NAVY = ['#0B1A3A', '#081128', '#050B1C'] as const;
const WHITE = '#F8FAFC';
const MUTED = 'rgba(203,213,225,0.75)';
const LIGHT_BLUE = '#93C5FD';
const BLUE = '#2563EB';
const BLUE_BORDER = '#3B82F6';
const GREEN = '#22C55E';
const AMBER = '#F59E0B';
const GLASS_BG = 'rgba(255,255,255,0.06)';
const GLASS_BORDER = 'rgba(147,197,253,0.22)';
const DIVIDER = 'rgba(148,163,184,0.18)';

const KIND_ICONS: Record<ReadKind, LucideIcon> = {
  instagram: AtSign,
  tiktok: Music2,
  whatsapp: MessageCircle,
  url: Globe,
  contact: User,
  phone: Phone,
  email: Mail,
  wifi: Wifi,
  location: MapPin,
  text: Type,
  app: Smartphone,
  event: Calendar,
  custom: IdCard,
  empty: Nfc,
  rfid: Nfc,
};

/** Reader mode só fica "segurando" a tag no Android nativo; nas outras plataformas a leitura é reaberta sob demanda. */
const HOLDS_READER = Platform.OS === 'android' && nfcManager.getMode() === 'native';

export default function TagResultScreen() {
  const { fs } = useTheme();
  const insets = useSafeAreaInsets();
  const pending = getPendingRead();
  const [tag, setTag] = useState<NfcTag | null>(pending?.tag ?? useNfcStore.getState().currentTag);
  const [records, setRecords] = useState<ParsedRecord[]>(pending?.records ?? []);
  const [armed, setArmed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const locked = useReadLock();
  const summary = useMemo(() => summarizeRead(tag, records), [tag, records]);
  const waiting = armed && !locked;
  const user = useAuthStore((state) => state.user);
  const plaquinhaCode = useMemo(() => plaquinhaCodeFromLink(summary.href, Config.shortLinkBase), [summary.href]);
  const [foreign, setForeign] = useState<string | null>(null);

  // Tag de plaquinha: se o link não é do usuário (RLS não devolve), oferece pedir acesso de edição.
  useEffect(() => {
    if (!plaquinhaCode || !user || !plaquinhasAvailable()) {
      return;
    }
    let alive = true;
    getPlaquinha(plaquinhaCode)
      .then((row) => {
        if (alive) {
          setForeign(row ? null : plaquinhaCode);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [plaquinhaCode, user]);

  useTagDispatch(
    (next, nextRecords) => {
      setTag(next);
      setRecords(nextRecords);
      setPendingRead(next, nextRecords);
      setArmed(false);
      setExpanded(false);
      void persistReadOperation(next, nextRecords).catch(() => undefined);
    },
    { once: true, passive: HOLDS_READER || !armed },
  );

  const dispatchActive = useDispatchState().active;
  const wasActive = useRef(false);
  useEffect(() => {
    if (HOLDS_READER || !armed) {
      wasActive.current = false;
      return;
    }
    if (dispatchActive) {
      wasActive.current = true;
    } else if (wasActive.current) {
      wasActive.current = false;
      setArmed(false);
    }
  }, [armed, dispatchActive]);

  function close() {
    if (router.canDismiss()) {
      router.dismissTo('/(tabs)');
    } else {
      router.replace('/(tabs)');
    }
  }

  function requestEdit() {
    if (!plaquinhaCode) {
      return;
    }
    const href = `/(tabs)/plaquinhas?solicitar=${plaquinhaCode}` as Href;
    if (router.canDismiss()) {
      router.dismissTo(href);
    } else {
      router.replace(href);
    }
  }

  function readAgain() {
    nfcManager.expectNewSimulatedTag();
    nfcManager.rearmReading();
    setArmed(true);
  }

  async function open() {
    if (!summary.href || summary.safety.suspicious) {
      return;
    }
    try {
      await Linking.openURL(summary.href);
    } catch {
      useToastStore.getState().show('Não foi possível abrir este link.', 'error');
    }
  }

  async function copy() {
    try {
      await Clipboard.setStringAsync(summary.copyValue);
      useToastStore.getState().show('Copiado', 'success');
    } catch {
      useToastStore.getState().show('Não foi possível copiar.', 'error');
    }
  }

  async function share() {
    try {
      await Share.share({ message: summary.shareText, title: summary.title });
    } catch {
      useToastStore.getState().show('Compartilhamento indisponível neste ambiente.', 'warning');
    }
  }

  const Icon = KIND_ICONS[summary.kind];
  const functional = Boolean(tag?.capabilities.canRead);
  const capacity = tag?.capacity ?? 0;
  const used = tag?.usedSpace ?? 0;
  const technologies = tag ? identifyTechnologies(tag.technologies) : [];
  const ndefRecords = tag?.ndefRecords ?? [];

  return (
    <LinearGradient colors={NAVY} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingTop: insets.top + 56, paddingBottom: Math.max(insets.bottom, 24) + 8, paddingHorizontal: 18 }}
      >
        <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', backgroundColor: GLASS_BG, borderColor: GLASS_BORDER, borderWidth: 1, borderRadius: 28, padding: 22 }}>
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 3, borderColor: BLUE_BORDER, backgroundColor: 'rgba(59,130,246,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon color={WHITE} size={36} strokeWidth={2} />
            </View>
            <Text accessibilityRole="header" style={[{ color: WHITE, fontSize: fs(24), marginTop: 14, textAlign: 'center' }, inter('extrabold')]}>
              {summary.title}
            </Text>
            {summary.safety.suspicious ? null : (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(34,197,94,0.14)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.4)' }}>
                <Text style={[{ color: GREEN, fontSize: fs(13) }, inter('bold')]}>✓ Tag verificada</Text>
              </View>
            )}
            <Text selectable numberOfLines={3} style={[{ color: LIGHT_BLUE, fontSize: fs(summary.highlight.length > 28 ? 20 : 26), marginTop: 18, textAlign: 'center' }, inter('extrabold')]}>
              {summary.highlight}
            </Text>
            {summary.detail && summary.detail !== summary.highlight ? (
              <Text selectable numberOfLines={2} ellipsizeMode="middle" style={[{ color: LIGHT_BLUE, opacity: 0.8, fontSize: fs(13), marginTop: 6, textAlign: 'center' }, inter('medium')]}>
                {summary.detail}
              </Text>
            ) : null}
          </View>

          <View style={{ marginTop: 22, gap: 10 }}>
            {summary.href && summary.safety.suspicious ? <SuspiciousLinkWarning url={summary.href} safety={summary.safety} textColor={WHITE} /> : null}
            {summary.href && !summary.safety.suspicious ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Abrir ${summary.title}`}
                onPress={() => void open()}
                style={({ pressed }) => ({ minHeight: 56, borderRadius: 16, backgroundColor: BLUE, opacity: pressed ? 0.85 : 1, alignItems: 'center', justifyContent: 'center' })}
              >
                <Text style={[{ color: '#FFFFFF', fontSize: fs(18) }, inter('extrabold')]}>Abrir →</Text>
              </Pressable>
            ) : null}
            {foreign && foreign === plaquinhaCode ? (
              <Pressable
                accessibilityRole="button"
                onPress={requestEdit}
                style={({ pressed }) => ({ minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: BLUE_BORDER, backgroundColor: pressed ? 'rgba(59,130,246,0.22)' : 'rgba(59,130,246,0.12)', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' })}
              >
                <KeyRound color={LIGHT_BLUE} size={20} />
                <Text style={[{ color: WHITE, fontSize: fs(16) }, inter('extrabold')]}>Solicitar acesso de edição</Text>
              </Pressable>
            ) : null}
            {summary.kind === 'empty' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void openNfcFlow('write')}
                style={({ pressed }) => ({ minHeight: 56, borderRadius: 16, backgroundColor: BLUE, opacity: pressed ? 0.85 : 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' })}
              >
                <SmartphoneNfc color="#FFFFFF" size={20} />
                <Text style={[{ color: '#FFFFFF', fontSize: fs(17) }, inter('extrabold')]}>Gravar tag</Text>
              </Pressable>
            ) : null}
            {summary.copyValue ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <GhostButton label="Copiar" icon={Copy} onPress={() => void copy()} />
                <GhostButton label="Compartilhar" icon={Share2} onPress={() => void share()} />
              </View>
            ) : null}
          </View>

          <View style={{ marginTop: 22, paddingTop: 16, borderTopWidth: 1, borderTopColor: DIVIDER, gap: 8 }}>
            <Text style={[{ color: functional ? GREEN : AMBER, fontSize: fs(15) }, inter('bold')]}>{functional ? '✓ Tag funcional' : '⚠ Tag com restrições'}</Text>
            <DiagRow label="Tipo" value={tag ? CHIP_LABELS[tag.type] ?? tag.type : '—'} />
            <DiagRow label="Capacidade" value={capacity > 0 ? `${capacity} bytes` : '—'} />
          </View>

          <View style={{ marginTop: 18, alignItems: 'center', gap: 10 }}>
            {waiting ? (
              <>
                <NfcPulse size={96} />
                <Text style={[{ color: WHITE, fontSize: fs(17) }, inter('extrabold')]}>Aproxime a tag</Text>
                {__DEV__ && nfcManager.isSimulation() ? (
                  <View style={{ alignSelf: 'stretch', gap: 8 }}>
                    <View style={{ flexDirection: 'row' }}>
                      <GhostButton label="Simular tag (modo de teste)" icon={Nfc} onPress={() => nfcManager.simulateTag('default')} />
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                      <GhostButton label="Simular link suspeito (modo de teste)" icon={ShieldAlert} onPress={() => nfcManager.simulateTag('suspicious')} />
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>
                <GhostButton label="Ler novamente" icon={RotateCcw} onPress={readAgain} />
              </View>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={() => setExpanded((value) => !value)}
            style={{ marginTop: 18, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderTopWidth: 1, borderTopColor: DIVIDER, paddingTop: 12 }}
          >
            <Text style={[{ color: MUTED, fontSize: fs(14) }, inter('semibold')]}>Ver mais detalhes</Text>
            {expanded ? <ChevronUp color={MUTED} size={18} /> : <ChevronDown color={MUTED} size={18} />}
          </Pressable>
          {expanded ? (
            <View style={{ marginTop: 8, padding: 14, borderRadius: 16, backgroundColor: '#0A1530', gap: 8 }}>
              <DiagRow label="UID" value={formatUid(tag?.uid) || '—'} />
              <DiagRow label="Tecnologias" value={technologies.map((tech) => tech.label).join(', ') || '—'} />
              <DiagRow label="Bytes usados" value={capacity > 0 ? `${used} bytes` : '—'} />
              <DiagRow label="Bytes livres" value={capacity > 0 ? `${Math.max(0, capacity - used)} bytes` : '—'} />
              <Text style={[{ color: WHITE, fontSize: fs(14), marginTop: 6 }, inter('bold')]}>Registros NDEF ({ndefRecords.length})</Text>
              {ndefRecords.length === 0 ? <Text style={[{ color: MUTED, fontSize: fs(13) }, inter('regular')]}>Nenhum registro.</Text> : null}
              {ndefRecords.map((record, index) => {
                const info = describeRecord(record, index);
                return (
                  <View key={index} style={{ paddingTop: 8, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: DIVIDER }}>
                    <Text style={[{ color: WHITE, fontSize: fs(13) }, inter('semibold')]}>
                      #{index + 1} · {info.tnfName}{info.type ? ` · ${info.type}` : ''} · {info.payloadSize} bytes
                    </Text>
                    <Text selectable numberOfLines={4} style={[{ color: MUTED, fontSize: fs(12), marginTop: 2 }, inter('regular')]}>
                      {info.decoded ?? info.payloadHex}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={close}
        hitSlop={8}
        style={({ pressed }) => ({ position: 'absolute', top: insets.top + 10, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : GLASS_BG, borderWidth: 1, borderColor: GLASS_BORDER, alignItems: 'center', justifyContent: 'center' })}
      >
        <X color={WHITE} size={22} />
      </Pressable>
    </LinearGradient>
  );
}

function GhostButton({ label, icon: Icon, onPress }: { label: string; icon: LucideIcon; onPress: () => void }) {
  const { fs } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: GLASS_BORDER, backgroundColor: pressed ? 'rgba(255,255,255,0.10)' : 'transparent', flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' })}
    >
      <Icon color={LIGHT_BLUE} size={18} />
      <Text style={[{ color: WHITE, fontSize: fs(15) }, inter('bold')]}>{label}</Text>
    </Pressable>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  const { fs } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[{ color: MUTED, fontSize: fs(14) }, inter('regular')]}>{label}</Text>
      <Text selectable style={[{ flexShrink: 1, textAlign: 'right', color: WHITE, fontSize: fs(14) }, inter('semibold')]}>{value}</Text>
    </View>
  );
}
