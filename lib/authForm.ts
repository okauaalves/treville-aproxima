import { isValidEmail } from '@/utils/validators';

export function validateLogin(email: string, password: string): string | null {
  if (!isValidEmail(email)) {
    return 'Informe um e-mail válido.';
  }
  if (password.length < 6) {
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
  if (password.length < 6) {
    return 'A senha precisa ter ao menos 6 caracteres.';
  }
  if (password !== confirm) {
    return 'As senhas não coincidem.';
  }
  return null;
}
