import {
  BookOpen,
  Briefcase,
  Building2,
  Camera,
  Coffee,
  Gift,
  Heart,
  House,
  IdCard,
  Music,
  Phone,
  Star,
  User,
  type LucideIcon,
} from 'lucide-react-native';

export const CARD_ICONS: { name: string; label: string; icon: LucideIcon }[] = [
  { name: 'IdCard', label: 'Crachá', icon: IdCard },
  { name: 'User', label: 'Pessoa', icon: User },
  { name: 'Briefcase', label: 'Trabalho', icon: Briefcase },
  { name: 'Building2', label: 'Empresa', icon: Building2 },
  { name: 'Heart', label: 'Coração', icon: Heart },
  { name: 'Star', label: 'Estrela', icon: Star },
  { name: 'House', label: 'Casa', icon: House },
  { name: 'Coffee', label: 'Café', icon: Coffee },
  { name: 'Camera', label: 'Câmera', icon: Camera },
  { name: 'Gift', label: 'Presente', icon: Gift },
  { name: 'BookOpen', label: 'Livro', icon: BookOpen },
  { name: 'Music', label: 'Música', icon: Music },
  { name: 'Phone', label: 'Telefone', icon: Phone },
];

export const CARD_COLORS = ['#3B82F6', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#475569'] as const;

export function cardIconByName(name: string | null | undefined): LucideIcon | null {
  if (!name) {
    return null;
  }
  return CARD_ICONS.find((item) => item.name === name)?.icon ?? null;
}
