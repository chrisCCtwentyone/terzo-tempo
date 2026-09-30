/**
 * Identita' anonima del dispositivo per il voto MVP: un cookie con un token
 * casuale assegnato dal server. Nel DB si salva SOLO l'hash SHA-256: nessuno,
 * database compreso, puo' risalire al cookie di un telefono.
 * Limite noto e accettato dall'utente: incognito o un altro browser danno un
 * nuovo dispositivo.
 */

import { COOKIE_DISPOSITIVO, COOKIE_DISPOSITIVO_DURATA_S } from './costanti';

const FORMA_TOKEN = /^[0-9a-f]{64}$/;

/** Il token del cookie, se c'e' ed e' della forma attesa. */
export function leggiToken(request: Request): string | null {
  for (const pezzo of (request.headers.get('Cookie') ?? '').split(';')) {
    const [nome, ...resto] = pezzo.split('=');
    if (nome.trim() === COOKIE_DISPOSITIVO) {
      const v = resto.join('=').trim();
      return FORMA_TOKEN.test(v) ? v : null;
    }
  }
  return null;
}

export function nuovoToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cookieDispositivo(token: string): string {
  return `${COOKIE_DISPOSITIVO}=${token}; Max-Age=${COOKIE_DISPOSITIVO_DURATA_S}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

/** Hash del dispositivo che fa la richiesta, o null se non ha ancora il cookie. */
export async function hashDelDispositivo(request: Request): Promise<string | null> {
  const t = leggiToken(request);
  return t ? hashToken(t) : null;
}
