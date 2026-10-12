import { ADMIN_EMAIL } from '@/constants/config';
import { isAdminEmail, isAdminUser } from '@/lib/adminAccess';
import { classifyAuthCallback, isExpiredLinkMessage, isProviderDisabledMessage, parseAuthCallback } from '@/lib/authCallback';
import { resendCooldown, validateLogin, validateNewPassword, validateRegister } from '@/lib/authForm';
import { ALREADY_REGISTERED_MESSAGE, GOOGLE_DISABLED_MESSAGE, translateAuthError } from '@/lib/supabase';
import { clearUserMemory } from '@/lib/authActions';
import { toAppUser } from '@/stores/authStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useNfcStore } from '@/stores/nfcStore';
import { useTemplateStore } from '@/stores/templateStore';
import { adminToCsv, aggregateAdmin } from '../supabase/functions/_shared/aggregate';

describe('validação de login e cadastro', () => {
  it('exige e-mail válido e senha com 6 caracteres', () => {
    expect(validateLogin('nao-email', '123456')).toBe('Informe um e-mail válido.');
    expect(validateLogin('a@b.co', '12345')).toBe('A senha precisa ter ao menos 6 caracteres.');
    expect(validateLogin('a@b.co', '123456')).toBeNull();
  });

  it('aceita e-mail com espaços nas pontas e recusa formatos incompletos', () => {
    expect(validateLogin('  a@b.co ', '123456')).toBeNull();
    expect(validateLogin('a@b', '123456')).toBe('Informe um e-mail válido.');
    expect(validateLogin('', '')).toBe('Informe um e-mail válido.');
  });

  it('exige nome, senhas iguais e confirmação', () => {
    expect(validateRegister('   ', 'a@b.co', '123456', '123456')).toBe('Informe seu nome.');
    expect(validateRegister('Ana', 'ana', '123456', '123456')).toBe('Informe um e-mail válido.');
    expect(validateRegister('Ana', 'a@b.co', '12345', '12345')).toBe('A senha precisa ter ao menos 6 caracteres.');
    expect(validateRegister('', 'a@b.co', '123456', '123456')).toBe('Informe seu nome.');
    expect(validateRegister('Ana', 'a@b.co', '123456', '123457')).toBe('As senhas não coincidem.');
    expect(validateRegister('Ana', 'a@b.co', '123456', '123456')).toBeNull();
  });
});

describe('erros de autenticação', () => {
  it('traduz credenciais, duplicidade e rede', () => {
    expect(translateAuthError(new Error('Invalid login credentials'))).toBe('E-mail ou senha inválidos.');
    expect(translateAuthError(new Error('User already registered'))).toBe(ALREADY_REGISTERED_MESSAGE);
    expect(translateAuthError(new Error('Failed to fetch'))).toBe('Sem conexão. Tente novamente.');
    expect(translateAuthError(new Error('Network request failed'))).toBe('Sem conexão. Tente novamente.');
  });

  it('não confunde e-mail não confirmado nem e-mail inválido com senha fraca', () => {
    expect(translateAuthError(new Error('Email not confirmed'))).toBe('Confirme seu e-mail antes de entrar. O link está na sua caixa de entrada.');
    expect(translateAuthError(new Error('Email address "x@y" is invalid'))).toBe('Informe um e-mail válido.');
    expect(translateAuthError(new Error('Password should be at least 6 characters.'))).toBe('A senha é fraca. Use ao menos 6 caracteres.');
    expect(translateAuthError(new Error('Signups not allowed for this instance'))).toBe('O cadastro de novas contas está desativado no servidor.');
    expect(translateAuthError(new Error('For security purposes, you can only request this after 42 seconds.'))).toBe('Muitas tentativas. Aguarde um minuto e tente de novo.');
    expect(translateAuthError('texto solto')).toBe('Não foi possível concluir. Tente novamente.');
  });

  it('a mensagem de duplicidade não afirma que a conta existe', () => {
    expect(ALREADY_REGISTERED_MESSAGE).not.toMatch(/já está cadastrado/);
    expect(ALREADY_REGISTERED_MESSAGE).toContain('recupere a senha');
  });
});

describe('callback OAuth', () => {
  it('lê code na query e tokens no fragmento', () => {
    expect(parseAuthCallback('treville://auth/callback?code=abc')).toEqual({
      code: 'abc',
      accessToken: undefined,
      refreshToken: undefined,
      type: undefined,
      error: undefined,
      errorCode: undefined,
    });
    const tokens = parseAuthCallback('https://app.exemplo/auth/callback#access_token=aaa&refresh_token=bbb&type=recovery');
    expect(tokens.accessToken).toBe('aaa');
    expect(tokens.refreshToken).toBe('bbb');
    expect(tokens.type).toBe('recovery');
    expect(tokens.code).toBeUndefined();
  });

  it('classifica code PKCE, tokens no fragmento, erro e vazio', () => {
    expect(classifyAuthCallback(parseAuthCallback('treville://auth/callback?code=abc'))).toBe('code');
    expect(classifyAuthCallback(parseAuthCallback('http://localhost:8096/auth/callback?code=abc#'))).toBe('code');
    expect(classifyAuthCallback(parseAuthCallback('treville://auth/callback#access_token=a&refresh_token=b&type=recovery'))).toBe('tokens');
    expect(classifyAuthCallback(parseAuthCallback('treville://auth/callback#access_token=a'))).toBe('empty');
    expect(classifyAuthCallback(parseAuthCallback('treville://auth/callback'))).toBe('empty');
    expect(classifyAuthCallback(parseAuthCallback('exp://192.168.0.2:8081/--/auth/callback?code=xyz'))).toBe('code');
  });

  it('erro tem prioridade e vem decodificado da query ou do fragmento', () => {
    const query = parseAuthCallback('treville://auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(classifyAuthCallback(query)).toBe('error');
    expect(query.error).toBe('Email link is invalid or has expired');
    expect(query.errorCode).toBe('otp_expired');
    const hash = parseAuthCallback('treville://auth/callback?code=abc#error=server_error&error_description=Unsupported%20provider%3A%20provider%20is%20not%20enabled');
    expect(classifyAuthCallback(hash)).toBe('error');
    expect(isProviderDisabledMessage(hash.error ?? '')).toBe(true);
  });

  it('não quebra com percent-encoding inválido', () => {
    expect(parseAuthCallback('treville://auth/callback?code=%E0%A4%A').code).toBe('%E0%A4%A');
  });

  it('traduz provider desligado e link expirado', () => {
    expect(translateAuthError(new Error('Unsupported provider: provider is not enabled'))).toBe(GOOGLE_DISABLED_MESSAGE);
    expect(GOOGLE_DISABLED_MESSAGE).toBe('Login com Google ainda não está ativado no servidor.');
    expect(isExpiredLinkMessage('invalid flow state, no valid flow state found')).toBe(true);
    expect(translateAuthError(new Error('Email link is invalid or has expired'))).toBe('Este link expirou ou já foi usado. Peça um novo.');
  });
});

describe('logout', () => {
  it('limpa histórico, templates e NFC só da memória', () => {
    useHistoryStore.setState({ operations: [{ id: 'op1' } as never], hasMore: false, filter: 'write' as never });
    useTemplateStore.setState({ templates: [{ id: 't1' } as never] });
    useNfcStore.getState().setLastQrValue('https://exemplo.com');
    useNfcStore.getState().setScanning(true);
    clearUserMemory();
    expect(useHistoryStore.getState().operations).toEqual([]);
    expect(useHistoryStore.getState().hasMore).toBe(true);
    expect(useHistoryStore.getState().filter).toBe('all');
    expect(useTemplateStore.getState().templates).toEqual([]);
    expect(useNfcStore.getState().lastQrValue).toBeNull();
    expect(useNfcStore.getState().isScanning).toBe(false);
    expect(useNfcStore.getState().pendingPayload).toBeNull();
  });
});

describe('recuperação de senha', () => {
  it('valida a nova senha e a confirmação', () => {
    expect(validateNewPassword('123', '123')).toBe('A senha precisa ter ao menos 6 caracteres.');
    expect(validateNewPassword('123456', '654321')).toBe('As senhas não coincidem.');
    expect(validateNewPassword('123456', '123456')).toBeNull();
  });

  it('libera o reenvio só depois de 60 segundos', () => {
    expect(resendCooldown(null, 1000)).toBe(0);
    expect(resendCooldown(0, 0)).toBe(60);
    expect(resendCooldown(0, 59_001)).toBe(1);
    expect(resendCooldown(0, 60_000)).toBe(0);
  });
});

describe('admin', () => {
  it('reconhece o e-mail configurado e o papel admin', () => {
    expect(ADMIN_EMAIL.toLowerCase()).toBe('previaemailofc@gmail.com');
    expect(isAdminEmail('previaemailofc@gmail.com')).toBe(true);
    expect(isAdminEmail('outro@exemplo.com')).toBe(false);
    expect(isAdminUser({ email: 'outro@exemplo.com', app_metadata: { role: 'admin' } })).toBe(true);
    expect(isAdminUser({ email: 'outro@exemplo.com' })).toBe(false);
  });

  it('mantém app_metadata ao guardar o usuário da sessão', () => {
    const stored = toAppUser({ id: 'u1', email: 'outro@exemplo.com', user_metadata: {}, app_metadata: { role: 'admin' } });
    expect(isAdminUser(stored)).toBe(true);
  });

  it('agrega usuários ativos, tipos e csv', () => {
    const now = Date.parse('2026-10-08T12:00:00.000Z');
    const overview = aggregateAdmin({
      now,
      users: [
        { id: '1', name: 'Ana', email: 'ana@exemplo.com', createdAt: null, lastSignInAt: '2026-10-07T12:00:00.000Z' },
        { id: '2', name: 'Bia', email: 'bia@exemplo.com', createdAt: null, lastSignInAt: '2026-09-01T12:00:00.000Z' },
      ],
      operations: [
        { id: 'o1', userId: '1', email: 'ana@exemplo.com', contentType: 'URL', operation: 'write', status: 'ok', createdAt: '2026-10-08T10:00:00.000Z' },
        { id: 'o2', userId: '1', email: 'ana@exemplo.com', contentType: 'URL', operation: 'read', status: 'ok', createdAt: '2026-10-01T10:00:00.000Z' },
        { id: 'o3', userId: '2', email: 'bia@exemplo.com', contentType: 'TEXT', operation: 'write', status: 'ok', createdAt: '2026-10-02T10:00:00.000Z' },
      ],
      templates: [
        { id: 't1', name: 'Cartão', type: 'CUSTOM', useCount: 4 },
        { id: 't2', name: 'Link', type: 'URL', useCount: 1 },
      ],
      totalOperations: 9,
    });
    expect(overview.totalUsers).toBe(2);
    expect(overview.activeUsers7d).toBe(1);
    expect(overview.totalOperations).toBe(9);
    expect(overview.operationsByType[0]).toEqual({ contentType: 'URL', count: 2 });
    expect(overview.recentOperations[0]?.id).toBe('o1');
    expect(overview.topTemplates[0]?.name).toBe('Cartão');
    expect(adminToCsv(overview)).toContain('resumo,usuarios,2');
    expect(adminToCsv(overview)).toContain('ana@exemplo.com');
  });
});
