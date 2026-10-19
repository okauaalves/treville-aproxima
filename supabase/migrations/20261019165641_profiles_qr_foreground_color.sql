-- Cor dos módulos do QR Code por usuário (fundo permanece #FFFFFF no app).
-- Só aceita #RRGGBB com contraste WCAG ≥ 4.5:1 vs branco (validado no cliente; CHECK defensivo).

alter table public.profiles
  add column if not exists qr_foreground_color text not null default '#000000';

alter table public.profiles drop constraint if exists profiles_qr_foreground_color_hex;
alter table public.profiles
  add constraint profiles_qr_foreground_color_hex
  check (qr_foreground_color ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.profiles.qr_foreground_color is
  'Cor dos módulos do QR (#RRGGBB). Fundo fixo #FFFFFF. Default #000000.';
