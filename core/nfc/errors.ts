export type NfcErrorCode =
  | 'TAG_MOVED'
  | 'TAG_LOCKED'
  | 'INSUFFICIENT_SPACE'
  | 'CONNECTION_LOST'
  | 'FORMAT_MISMATCH'
  | 'NDEF_NOT_SUPPORTED'
  | 'NFC_DISABLED'
  | 'NFC_NOT_SUPPORTED'
  | 'VERIFICATION_FAILED'
  | 'WRITE_FAILED'
  | 'READ_FAILED'
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'USER_CANCELLED';

export const errorMessages: Record<NfcErrorCode, string> = {
  TAG_MOVED: 'A tag foi afastada durante a gravação. Mantenha o celular próximo e tente novamente.',
  TAG_LOCKED: 'Esta tag está protegida contra gravação.',
  INSUFFICIENT_SPACE: 'Memória insuficiente. Use uma tag com maior capacidade ou reduza o conteúdo.',
  CONNECTION_LOST: 'O dispositivo perdeu comunicação com a tag. Tente novamente.',
  FORMAT_MISMATCH: 'Este formato não é compatível com a tag detectada.',
  NDEF_NOT_SUPPORTED: 'Esta tag não suporta o formato NDEF.',
  NFC_DISABLED: 'O NFC está desligado. Ative nas configurações do dispositivo.',
  NFC_NOT_SUPPORTED: 'Este dispositivo não possui NFC.',
  VERIFICATION_FAILED: 'O conteúdo gravado não pôde ser verificado. Tente novamente.',
  WRITE_FAILED: 'Não foi possível gravar na tag. Tente novamente.',
  READ_FAILED: 'Não foi possível ler a tag. Tente novamente.',
  VALIDATION_ERROR: 'Verifique os dados informados antes de continuar.',
  TIMEOUT: 'Tempo esgotado. Aproxime a tag e tente novamente.',
  USER_CANCELLED: 'Operação cancelada.',
};

export const shortErrorCauses: Record<NfcErrorCode, string> = {
  TAG_MOVED: 'A tag foi afastada durante a gravação',
  TAG_LOCKED: 'A tag está protegida contra gravação',
  INSUFFICIENT_SPACE: 'Memória insuficiente para o conteúdo',
  CONNECTION_LOST: 'O dispositivo perdeu comunicação com a tag',
  FORMAT_MISMATCH: 'Formato não compatível com esta tag',
  NDEF_NOT_SUPPORTED: 'Esta tag não suporta NDEF',
  NFC_DISABLED: 'O NFC está desligado',
  NFC_NOT_SUPPORTED: 'Este dispositivo não possui NFC',
  VERIFICATION_FAILED: 'A verificação do conteúdo falhou',
  WRITE_FAILED: 'Não foi possível gravar',
  READ_FAILED: 'Não foi possível ler a tag',
  VALIDATION_ERROR: 'Verifique os dados informados',
  TIMEOUT: 'Tempo esgotado',
  USER_CANCELLED: 'Operação cancelada',
};

export class NfcError extends Error {
  code: NfcErrorCode;

  constructor(code: NfcErrorCode, message?: string) {
    super(message ?? errorMessages[code]);
    this.name = 'NfcError';
    this.code = code;
  }
}

export class ValidationError extends NfcError {
  field?: string;

  constructor(message?: string, field?: string) {
    super('VALIDATION_ERROR', message ?? errorMessages.VALIDATION_ERROR);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export class VerificationFailedError extends NfcError {
  expected: string;
  found: string;

  constructor(message?: string, expected = '', found = '') {
    super('VERIFICATION_FAILED', message ?? errorMessages.VERIFICATION_FAILED);
    this.name = 'VerificationFailedError';
    this.expected = expected;
    this.found = found;
  }
}

export class TagReadOnlyError extends NfcError {
  constructor() {
    super('TAG_LOCKED');
    this.name = 'TagReadOnlyError';
  }
}

export class InsufficientSpaceError extends NfcError {
  constructor() {
    super('INSUFFICIENT_SPACE');
    this.name = 'InsufficientSpaceError';
  }
}

export class NdefNotSupportedError extends NfcError {
  constructor() {
    super('NDEF_NOT_SUPPORTED');
    this.name = 'NdefNotSupportedError';
  }
}

function readMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}

function readName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  return '';
}

export function toNfcError(error: unknown): NfcError {
  if (error instanceof NfcError) {
    return error;
  }
  const message = readMessage(error).toLowerCase();
  const name = readName(error);
  if (name === 'UserCancel' || message.includes('cancel')) {
    return new NfcError('USER_CANCELLED');
  }
  if (name === 'Timeout' || message.includes('timeout') || message.includes('timed out')) {
    return new NfcError('TIMEOUT');
  }
  if (
    name === 'TagConnectionLost' ||
    message.includes('tag was lost') ||
    message.includes('tag lost') ||
    message.includes('ioexception')
  ) {
    return new NfcError('TAG_MOVED');
  }
  if (message.includes('connection') || message.includes('transceive')) {
    return new NfcError('CONNECTION_LOST');
  }
  if (name === 'TagNotWritable' || message.includes('read only') || message.includes('not writable')) {
    return new NfcError('TAG_LOCKED');
  }
  if (name === 'TagSizeTooSmall' || message.includes('size') || message.includes('capacity')) {
    return new NfcError('INSUFFICIENT_SPACE');
  }
  if (message.includes('not supported') || message.includes('ndef')) {
    return new NfcError('NDEF_NOT_SUPPORTED');
  }
  if (message.includes('disabled') || message.includes('radio')) {
    return new NfcError('NFC_DISABLED');
  }
  return new NfcError('WRITE_FAILED', readMessage(error) || errorMessages.WRITE_FAILED);
}

export function isNfcErrorCode(value: string): value is NfcErrorCode {
  return value in errorMessages;
}
