/**
 * Strumenti per provare il cancello di Cloudflare Access senza Cloudflare:
 * si genera una coppia di chiavi RSA, si firma un JWT con la forma di quelli di
 * Access e si sostituisce `fetch` perche' l'indirizzo delle chiavi risponda con
 * la chiave di prova. Tutto inventato; le email usano `.invalid` (RFC 2606).
 */

import { vi } from 'vitest';
import { dimenticaChiavi } from '../functions/lib/access';

export const DOMINIO = 'team-di-prova.cloudflareaccess.com';
export const AUD = 'aud-di-prova-0123456789';
export const EMAIL = 'admin@prova.invalid';

export type Chiave = { privata: CryptoKey; jwk: JsonWebKey & { kid: string } };

export async function nuovaChiave(kid = 'chiave-di-prova'): Promise<Chiave> {
  const coppia = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', coppia.publicKey)) as JsonWebKey;
  return { privata: coppia.privateKey, jwk: { ...jwk, kid, alg: 'RS256', use: 'sig' } };
}

export function b64url(dati: Uint8Array | string): string {
  const byte = typeof dati === 'string' ? new TextEncoder().encode(dati) : dati;
  let bin = '';
  for (const b of byte) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ora = () => Math.floor(Date.now() / 1000);

/** Il corpo di un token valido: ogni test ne cambia UN solo campo. */
export function corpoValido(): Record<string, unknown> {
  return { aud: [AUD], email: EMAIL, exp: ora() + 3600, iat: ora() - 10, nbf: ora() - 10, iss: `https://${DOMINIO}`, sub: 'x' };
}

export async function firma(
  chiave: Chiave,
  corpo: Record<string, unknown> = corpoValido(),
  intestazione: Record<string, unknown> = { alg: 'RS256', kid: chiave.jwk.kid, typ: 'JWT' },
): Promise<string> {
  const testa = `${b64url(JSON.stringify(intestazione))}.${b64url(JSON.stringify(corpo))}`;
  const f = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chiave.privata, new TextEncoder().encode(testa));
  return `${testa}.${b64url(new Uint8Array(f))}`;
}

/** fetch finto: l'indirizzo delle chiavi risponde con `chiavi`, ogni altro indirizzo fa fallire il test. */
export function pubblicaChiavi(chiavi: JsonWebKey[]) {
  dimenticaChiavi();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request) => {
      const u = String(url instanceof Request ? url.url : url);
      if (u === `https://${DOMINIO}/cdn-cgi/access/certs`) return new Response(JSON.stringify({ keys: chiavi }), { status: 200 });
      throw new Error(`fetch inatteso verso ${u}`);
    }),
  );
}

export function chiaviIrraggiungibili() {
  dimenticaChiavi();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('guasto', { status: 502 })));
}
