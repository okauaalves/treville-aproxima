import { ADMIN_EMAIL } from '@/constants/config';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }
  return email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase();
}

export function isAdminUser(user: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (isAdminEmail(user.email)) {
    return true;
  }
  return user.app_metadata?.role === 'admin';
}
