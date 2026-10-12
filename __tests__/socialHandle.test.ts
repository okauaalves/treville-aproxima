import { buildSocialUrl, detectSocialUrl, extractSocialUsername, validateSocialUsername } from '@/lib/socialHandle';

describe('usuário de Instagram/TikTok', () => {
  it('remove @, espaços e extrai o nome de uma URL colada', () => {
    expect(extractSocialUsername('instagram', ' @treville ')).toBe('treville');
    expect(extractSocialUsername('instagram', 'https://www.instagram.com/treville.br/?hl=pt')).toBe('treville.br');
    expect(extractSocialUsername('instagram', 'instagram.com/treville')).toBe('treville');
    expect(extractSocialUsername('tiktok', 'https://www.tiktok.com/@treville?lang=pt')).toBe('treville');
    expect(extractSocialUsername('tiktok', '@@treville')).toBe('treville');
  });

  it('gera a URL do perfil', () => {
    expect(buildSocialUrl('instagram', 'treville')).toBe('https://instagram.com/treville');
    expect(buildSocialUrl('tiktok', 'treville')).toBe('https://tiktok.com/@treville');
  });

  it('valida usuário vazio ou com caracteres inválidos', () => {
    expect(validateSocialUsername('instagram', ' @ ').ok).toBe(false);
    expect(validateSocialUsername('tiktok', 'tre-ville').ok).toBe(false);
    expect(validateSocialUsername('tiktok', 'tiktok.com/@treville')).toEqual({ ok: true, url: 'https://tiktok.com/@treville' });
  });

  it('reconhece uma URL de perfil salva', () => {
    expect(detectSocialUrl('https://instagram.com/treville')).toEqual({ network: 'instagram', username: 'treville' });
    expect(detectSocialUrl('https://tiktok.com/@treville')).toEqual({ network: 'tiktok', username: 'treville' });
    expect(detectSocialUrl('https://treville.com.br')).toBeNull();
  });
});
