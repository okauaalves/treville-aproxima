export function canLeaveSplash(input: { introDone: boolean; bootReady: boolean }): boolean {
  return input.introDone && input.bootReady;
}

/** Duração total da abertura: pontos, formação das colunas, flash e logo. */
export const SPLASH_DURATION_MS = 1500;
export const SPLASH_REDUCED_DURATION_MS = 300;
