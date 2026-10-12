import { isValidEmail } from '@/utils/validators';

export const MIN_PASSWORD = 6;
export const RESET_COOLDOWN_SECONDS = 60;

export function validateLogin(email: string, password: string): string | null {
  if (!isValidEmail(email)) {
    return 'Informe um e-mail válido.';
  }
  if (password.length < MIN_PASSWORD) {
    return 'A senha precisa ter ao menos 6 caracteres.';
  }
  return null;
}

export function validateRegister(name: string, email: string, password: string, confirm: string): string | null {
  if (!name.trim()) {
    return 'Informe seu nome.';
  }
  if (!isValidEmail(email)) {
    return 'Informe um e-mail válido.';
  }
  if (password.length < MIN_PASSWORD) {
    return 'A senha precisa ter ao menos 6 caracteres.';
  }
  if (password !== confirm) {
    return 'As senhas não coincidem.';
  }
  return null;
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD) {
    return 'A senha precisa ter ao menos 6 caracteres.';
  }
  if (password !== confirm) {
    return 'As senhas não coincidem.';
  }
  return null;
}

/** Segundos que faltam para liberar o reenvio do link de recuperação. */
export function resendCooldown(lastSentAt: number | null, now: number, seconds = RESET_COOLDOWN_SECONDS): number {
  if (lastSentAt === null) {
    return 0;
  }
  return Math.max(0, Math.ceil((lastSentAt + seconds * 1000 - now) / 1000));
}
