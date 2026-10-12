import { Text, View } from 'react-native';
import { Check, Radio } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { identifyTechnologies, rfidGuidance } from '@/core/nfc/technical';
import { inter } from '@/theme/fonts';
import { useTheme } from '@/theme/ThemeContext';

/** Tag sem NDEF legível: mostra o que dá para saber (UID e tecnologias) sem fingir suporte. */
export function RfidNotice({ uid, technologies }: { uid: string; technologies: string[] }) {
  const { colors, fs } = useTheme();
  const guidance = rfidGuidance(technologies);
  const techs = identifyTechnologies(technologies);
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
        <Radio color={colors.warning} size={22} />
        <Text style={[{ flex: 1, color: colors.textPrimary, fontSize: fs(15) }, inter('bold')]}>{guidance.title}</Text>
      </View>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(13), marginBottom: 10 }, inter('regular')]}>{guidance.message}</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('medium')]}>UID</Text>
      <Text selectable style={[{ color: colors.textPrimary, fontSize: fs(14), marginBottom: 8 }, inter('bold')]}>{uid || 'Não informado pela tag'}</Text>
      <Text style={[{ color: colors.textSecondary, fontSize: fs(12) }, inter('medium')]}>Tecnologias</Text>
      {techs.length > 0 ? (
        techs.map((tech) => (
          <Text key={tech.key} style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('regular')]}>
            {tech.label} — {tech.standard}
          </Text>
        ))
      ) : (
        <Text style={[{ color: colors.textPrimary, fontSize: fs(13) }, inter('regular')]}>Não informadas</Text>
      )}
      <Text style={[{ color: colors.textPrimary, fontSize: fs(13), marginTop: 10, marginBottom: 4 }, inter('bold')]}>O que é possível fazer</Text>
      {guidance.possible.map((item) => (
        <View key={item} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Check color={colors.success} size={14} />
          <Text style={[{ flex: 1, color: colors.textSecondary, fontSize: fs(13) }, inter('regular')]}>{item}</Text>
        </View>
      ))}
    </Card>
  );
}
