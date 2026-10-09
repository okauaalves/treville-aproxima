export type SplashMode = 'video' | 'logo';

/** iOS (AVPlayer) não toca WebM; até existir um MP4 H.264 o iOS usa a animação da logo. */
export function decideSplashMode(input: { platform: string; reduceMotion: boolean }): SplashMode {
  if (input.reduceMotion || input.platform === 'ios') {
    return 'logo';
  }
  return 'video';
}

export function canLeaveSplash(input: { introDone: boolean; bootReady: boolean }): boolean {
  return input.introDone && input.bootReady;
}

/** Cor de fundo dos quadros do vídeo de abertura; a splash nativa do Android usa a mesma cor (app.json) para não piscar. */
export const SPLASH_VIDEO_BACKGROUND = '#F3F3F3';

export const VIDEO_LOAD_TIMEOUT_MS = 8000;
export const VIDEO_END_GRACE_MS = 2000;

/** Limite total do vídeo: duração conhecida + folga, ou o teto de carregamento. */
export function videoDeadline(durationSeconds: number | null | undefined): number {
  if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return VIDEO_LOAD_TIMEOUT_MS;
  }
  return Math.round(durationSeconds * 1000) + VIDEO_END_GRACE_MS;
}
