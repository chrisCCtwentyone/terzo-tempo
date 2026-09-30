/**
 * Identita' anonima del dispositivo per il voto MVP: un cookie con un token
 * casuale assegnato dal server. Nel DB si salva SOLO l'hash SHA-256: nessuno,
 * database compreso, puo' risalire al cookie di un telefono.
 * Limite noto e accettato dall'utente: incognito o un altro browser danno un
 * nuovo dispositivo.
 */

import { CIFRE_HASH_RETE, COOKIE_DISPOSITIVO, COOKIE_DISPOSITIVO_DURATA_S } from './costanti';

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

/** IPv4 cosi' com'e'; IPv6 ridotto al prefisso /64 (le "estensioni privacy" cambiano il resto a ogni ora). */
export function reteDi(ip: string): string {
  if (!ip.includes(':')) return ip;
  const doppio = ip.split('::');
  const testa = doppio[0] ? doppio[0].split(':') : [];
  const coda = doppio.length > 1 && doppio[1] ? doppio[1].split(':') : [];
  const gruppi = doppio.length > 1 ? [...testa, ...Array<string>(Math.max(0, 8 - testa.length - coda.length)).fill('0'), ...coda] : testa;
  return gruppi.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':');
}

/**
 * Impronta grossolana della rete di chi vota, per partita: i primi CIFRE_HASH_RETE caratteri di
 * SHA-256(partita|rete). NON e' un identificativo (vedi migrations/0003): serve solo a contare i voti
 * arrivati dalla stessa rete. null = intestazione assente (sviluppo locale): nessun limite.
 */
export async function hashRete(request: Request, partitaId: number): Promise<string | null> {
  const ip = (request.headers.get('CF-Connecting-IP') ?? '').trim();
  if (!ip || ip.length > 64) return null;
  return (await hashToken(`${partitaId}|${reteDi(ip)}`)).slice(0, CIFRE_HASH_RETE);
}
