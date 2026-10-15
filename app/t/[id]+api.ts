import { createShortLinkHandler } from '@/lib/shortLink';

const handle = createShortLinkHandler({
  fetch: (input, init) => fetch(input, init),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  proxySecret: process.env.SHORT_LINK_PROXY_SECRET,
});

export function GET(request: Request, { id }: { id: string }) {
  return handle(request, id);
}

export function HEAD(request: Request, { id }: { id: string }) {
  return handle(request, id);
}
