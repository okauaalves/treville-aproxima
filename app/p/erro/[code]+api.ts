import { statusResponse } from '@/lib/profileHost';
import { statusKindFromCode } from '@/supabase/functions/_shared/statusPage';

export function GET(_request: Request, { code }: { code: string }) {
  return statusResponse(statusKindFromCode(code));
}
