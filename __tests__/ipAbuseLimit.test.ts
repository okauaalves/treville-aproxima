import {
  ABUSE_LIMIT_PER_MINUTE,
  ABUSE_WINDOW_MS,
  hitAbuseLimit,
  pruneAbuseBuckets,
  type AbuseBucket,
} from '@/supabase/functions/_shared/ipAbuseLimit';
import { renderSeoMetaTags } from '@/supabase/functions/_shared/seoMeta';

describe('hitAbuseLimit', () => {
  it(`permite até ${ABUSE_LIMIT_PER_MINUTE} hits na janela e bloqueia o seguinte`, () => {
    const buckets = new Map<string, AbuseBucket>();
    const start = 1_700_000_000_000;
    for (let i = 0; i < ABUSE_LIMIT_PER_MINUTE; i += 1) {
      const result = hitAbuseLimit(buckets, 'ip-a', start + i, ABUSE_LIMIT_PER_MINUTE, ABUSE_WINDOW_MS);
      expect(result.allowed).toBe(true);
    }
    const blocked = hitAbuseLimit(buckets, 'ip-a', start + ABUSE_LIMIT_PER_MINUTE, ABUSE_LIMIT_PER_MINUTE, ABUSE_WINDOW_MS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it('isola IPs e reinicia após a janela', () => {
    const buckets = new Map<string, AbuseBucket>();
    const start = 1_700_000_000_000;
    expect(hitAbuseLimit(buckets, 'ip-a', start, 2, 1000).allowed).toBe(true);
    expect(hitAbuseLimit(buckets, 'ip-a', start + 1, 2, 1000).allowed).toBe(true);
    expect(hitAbuseLimit(buckets, 'ip-a', start + 2, 2, 1000).allowed).toBe(false);
    expect(hitAbuseLimit(buckets, 'ip-b', start + 2, 2, 1000).allowed).toBe(true);
    expect(hitAbuseLimit(buckets, 'ip-a', start + 1001, 2, 1000).allowed).toBe(true);
  });

  it('pruneAbuseBuckets remove janelas expiradas', () => {
    const now = 10_000 + ABUSE_WINDOW_MS;
    const buckets = new Map<string, AbuseBucket>([
      ['old', { windowStart: 1000, hits: 3 }],
      ['fresh', { windowStart: now - 1_000, hits: 1 }],
    ]);
    pruneAbuseBuckets(buckets, now, ABUSE_WINDOW_MS);
    expect(buckets.has('old')).toBe(false);
    expect(buckets.has('fresh')).toBe(true);
  });
});

describe('renderSeoMetaTags', () => {
  it('emite og:title, description e robots indexáveis', () => {
    const html = renderSeoMetaTags({
      title: 'Café Aurora',
      description: 'Links do café',
      pageUrl: 'https://nfc-manager.expo.app/b/ABC123',
      imageUrl: 'https://example.com/logo.png',
    });
    expect(html).toContain('property="og:title" content="Café Aurora"');
    expect(html).toContain('name="description" content="Links do café"');
    expect(html).toContain('name="robots" content="index, follow"');
    expect(html).toContain('property="og:image" content="https://example.com/logo.png"');
    expect(html).toContain('rel="canonical" href="https://nfc-manager.expo.app/b/ABC123"');
  });

  it('escapa HTML e marca noindex quando pedido', () => {
    const html = renderSeoMetaTags({
      title: 'A <b>B</b>',
      description: 'x"y',
      indexable: false,
    });
    expect(html).toContain('content="A &lt;b&gt;B&lt;/b&gt;"');
    expect(html).toContain('content="x&quot;y"');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
  });
});
