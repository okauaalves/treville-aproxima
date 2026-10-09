import { useEffect, useRef } from 'react';

import { SPLASH_VIDEO_BACKGROUND, videoDeadline, VIDEO_LOAD_TIMEOUT_MS } from '@/lib/splash';

/**
 * No web usamos a tag <video> direto: autoplay + muted + playsInline é a combinação
 * que o Chrome e o Safari liberam sem gesto do usuário, e onEnded é nativo.
 * O arquivo vem de public/opening.webm, servido na raiz pelo Expo web.
 */
export function SplashVideo({ onReady, onEnd }: { onReady: () => void; onEnd: () => void }) {
  const ended = useRef(false);
  const ready = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  function finish() {
    if (ended.current) {
      return;
    }
    ended.current = true;
    onEnd();
  }

  function markReady(duration?: number) {
    if (ready.current) {
      return;
    }
    ready.current = true;
    onReady();
    timers.current.push(setTimeout(finish, videoDeadline(duration)));
  }

  useEffect(() => {
    const pending = timers.current;
    pending.push(
      setTimeout(() => {
        if (!ready.current) {
          markReady();
          finish();
        }
      }, VIDEO_LOAD_TIMEOUT_MS),
    );
    return () => pending.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timeout único de segurança ao montar
  }, []);

  return (
    <video
      src="/opening.webm"
      autoPlay
      muted
      playsInline
      preload="auto"
      aria-hidden
      data-testid="splash-video"
      onCanPlay={(event) => markReady(event.currentTarget.duration)}
      onEnded={finish}
      onError={() => {
        markReady();
        finish();
      }}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: SPLASH_VIDEO_BACKGROUND }}
    />
  );
}
