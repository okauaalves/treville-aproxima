import { platformCapabilities } from '@/core/platform/capabilities';
import type { NfcTag } from '@/types/nfc';

export type CheckStatus = 'pass' | 'fail' | 'warning' | 'unavailable';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  section: 'identification' | 'technology' | 'memory' | 'capabilities' | 'validation';
}

export interface DiagnosticReportData {
  tag: NfcTag;
  checks: DiagnosticCheck[];
  summary: string;
  timestamp: string;
  canBeUsed: boolean;
  technologies: string[];
}

export class DiagnosticEngine {
  runDiagnostic(tag: NfcTag): DiagnosticReportData {
    const checks = [
      this.checkDetection(tag),
      this.checkIdentification(tag),
      this.checkReadCapability(tag),
      this.checkNdefSupport(tag),
      this.checkWriteCapability(tag),
      this.checkMemory(tag),
      this.checkLockStatus(tag),
    ];
    const summary = this.generateSummary(checks);
    return {
      tag,
      checks,
      summary,
      timestamp: new Date().toISOString(),
      canBeUsed: summary === 'TAG FUNCIONAL',
      technologies: tag.technologies,
    };
  }

  private checkDetection(tag: NfcTag): DiagnosticCheck {
    const ok = Boolean(tag.uid);
    return {
      id: 'detection',
      label: 'Tag detectada',
      status: ok ? 'pass' : 'fail',
      detail: ok ? 'A tag respondeu à leitura.' : 'Nenhuma tag identificada.',
      section: 'identification',
    };
  }

  private checkIdentification(tag: NfcTag): DiagnosticCheck {
    const known = tag.type !== 'UNKNOWN';
    return {
      id: 'identification',
      label: 'Modelo',
      status: known ? 'pass' : 'warning',
      detail: known ? tag.type : 'Modelo não identificado.',
      section: 'identification',
    };
  }

  private checkReadCapability(tag: NfcTag): DiagnosticCheck {
    return {
      id: 'read',
      label: 'Leitura',
      status: tag.capabilities.canRead ? 'pass' : 'fail',
      detail: tag.capabilities.canRead ? 'Leitura NDEF disponível.' : 'Leitura indisponível.',
      section: 'capabilities',
    };
  }

  private checkNdefSupport(tag: NfcTag): DiagnosticCheck {
    return {
      id: 'ndef',
      label: 'NDEF',
      status: tag.capabilities.supportsNdef ? 'pass' : 'fail',
      detail: tag.capabilities.supportsNdef ? 'A tag suporta NDEF.' : 'NDEF não suportado.',
      section: 'validation',
    };
  }

  private checkWriteCapability(tag: NfcTag): DiagnosticCheck {
    return {
      id: 'write',
      label: 'Gravação',
      status: 'unavailable',
      detail: tag.capabilities.canWrite
        ? 'Capacidade de escrita detectada. Teste de escrita não executado para preservar os dados da tag.'
        : 'A tag não informa permissão de escrita. Teste de escrita não executado para preservar os dados da tag.',
      section: 'capabilities',
    };
  }

  private checkMemory(tag: NfcTag): DiagnosticCheck {
    const free = Math.max(0, tag.capacity - tag.usedSpace);
    return {
      id: 'memory',
      label: 'Memória',
      status: tag.capacity > 0 ? 'pass' : 'warning',
      detail: `${tag.capacity} bytes totais, ${tag.usedSpace} em uso, ${free} livres.`,
      section: 'memory',
    };
  }

  private checkLockStatus(tag: NfcTag): DiagnosticCheck {
    const lockAvailable = platformCapabilities.canLockTag && tag.capabilities.canLock;
    return {
      id: 'lock',
      label: 'Bloqueio',
      status: lockAvailable ? 'pass' : 'unavailable',
      detail: lockAvailable
        ? 'Proteção contra gravação disponível neste Android.'
        : 'Formatação, senha ou lock não estão disponíveis nesta plataforma.',
      section: 'capabilities',
    };
  }

  private generateSummary(checks: DiagnosticCheck[]): string {
    const failed = checks.filter((check) => check.status === 'fail');
    if (failed.length === 0) {
      return 'TAG FUNCIONAL';
    }
    return `PROBLEMA ENCONTRADO: ${failed.map((check) => check.detail).join(' ')}`;
  }
}

export const diagnosticEngine = new DiagnosticEngine();
