import { useEffect, useRef } from 'react';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

import { SPLASH_VIDEO_BACKGROUND, videoDeadline, VIDEO_LOAD_TIMEOUT_MS } from '@/lib/splash';

const SOURCE = require('@/assets/video/opening.webm');

/**
 * Android toca o WebM (VP9). surfaceType "textureView" porque SurfaceView ignora a
 * opacidade do pai, e o fade out da splash é feito no container.
 */
export function SplashVideo({ onReady, onEnd }: { onReady: () => void; onEnd: () => void }) {
  const ended = useRef(false);
  const ready = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const player = useVideoPlayer(SOURCE, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });

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

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') {
      markReady(player.duration);
      player.play();
    }
    if (status === 'error') {
      markReady();
      finish();
    }
  });
  useEventListener(player, 'playToEnd', finish);

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
    <VideoView
      player={player}
      contentFit="cover"
      nativeControls={false}
      surfaceType="textureView"
      style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: SPLASH_VIDEO_BACKGROUND }}
    />
  );
}
