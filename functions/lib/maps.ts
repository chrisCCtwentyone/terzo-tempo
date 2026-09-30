/**
 * Dal link "Condividi" di Google Maps al nome e alla posizione di un campo.
 *
 * L'admin incolla https://maps.app.goo.gl/XXXX: quel link NON contiene il nome, quindi il SERVER lo apre e
 * segue i redirect. E' l'unico punto del progetto in cui il server fa una richiesta verso un indirizzo scelto
 * da un utente: la difesa anti-SSRF qui sotto e' obbligatoria, e provata in test/maps.test.ts.
 *
 * DIFESE (tutte, ad ogni passaggio, compreso il primo):
 *  - solo https, senza utente/password e senza porta;
 *  - host in una lista ESATTA (HOST_AMMESSI): niente suffissi, niente sottodomini, niente indirizzi IP;
 *    goo.gl vale solo per il percorso /maps...;
 *  - redirect seguiti A MANO (redirect: 'manual'), al massimo MAX_REDIRECT_MAPS: il Location di ogni
 *    risposta e' ri-validato come un link nuovo prima di essere richiesto;
 *  - tempo totale TIMEOUT_MAPS_MS; nessun cookie ne' intestazione dell'utente inoltrati (si manda solo un
 *    User-Agent e la lingua: Workers non porta cookie da se');
 *  - il CORPO delle risposte non si legge MAI (serve solo l'intestazione Location): viene subito scartato.
 *    Le risposte vere di Google ai link corti sono 302 con corpo vuoto (verificato dalla rete, 30/09/2026);
 *  - consent.google.com non si apre: si usa il suo parametro `continue`, validato come ogni altro indirizzo;
 *  - la pagina "/sorry/" di Google (controllo anti-robot) non si apre ne' si segue: ci si ferma prima.
 */

import { MAX_NOME_CAMPO, MAX_REDIRECT_MAPS, TIMEOUT_MAPS_MS } from './costanti';
import { bypassAmmesso, type Ambiente } from './access';
import { ErroreApi } from './risposta';
import { VIETATI } from './valida';
import { indicazioni } from '../../shared/indicazioni';

// L'indirizzo delle indicazioni sta in shared/: lo stesso codice lo usa il browser dell'admin per l'anteprima.
export { indicazioni };

/** Gli unici host che il server accetta e richiede. Lista esatta: niente www.google.* generico. */
export const HOST_AMMESSI: ReadonlySet<string> = new Set([
  'maps.app.goo.gl',
  'goo.gl', // solo il percorso /maps...
  'www.google.com',
  'google.com',
  'maps.google.com',
  'www.google.it',
  'google.it',
  'consent.google.com',
]);

/** Host che servono solo a rimandare altrove: si aprono sempre. Gli altri, se l'indirizzo dice gia' tutto, non si aprono. */
const ACCORCIATORI: ReadonlySet<string> = new Set(['maps.app.goo.gl', 'goo.gl']);

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const USER_AGENT = 'Mozilla/5.0 (compatible; TerzoTempo/1.0)';
const MSG_NON_GOOGLE = 'link: non è un link di Google Maps (incolla quello di "Condividi", tipo https://maps.app.goo.gl/...)';

/** Il primo indirizzo http(s) del testo incollato ("Guarda questo posto: https://... ciao"), senza la punteggiatura finale. */
export function primoUrl(testo: string): string | null {
  const m = /https?:\/\/[^\s<>"'`]+/i.exec(testo);
  if (!m) return null;
  return m[0].replace(/[.,;:!?)\]}>]+$/, '');
}

const eIndirizzoIp = (host: string) => /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[');

/**
 * Valida UN indirizzo (il primo, o il Location di un redirect, relativo o assoluto) e lo restituisce come URL.
 * Lancia un 400 col nome del campo ("link: ...") se non e' ammesso.
 */
export function urlAmmesso(grezzo: string, base?: URL): URL {
  let u: URL;
  try {
    u = new URL(grezzo, base);
  } catch {
    throw new ErroreApi(400, 'link: indirizzo non valido');
  }
  if (u.protocol !== 'https:') throw new ErroreApi(400, 'link: serve un indirizzo https');
  if (u.username || u.password || u.port) throw new ErroreApi(400, MSG_NON_GOOGLE);
  if (eIndirizzoIp(u.hostname)) throw new ErroreApi(400, 'link: gli indirizzi IP non sono ammessi');
  if (!HOST_AMMESSI.has(u.hostname)) throw new ErroreApi(400, MSG_NON_GOOGLE);
  if (u.hostname === 'goo.gl' && !/^\/maps(\/|$)/.test(u.pathname)) throw new ErroreApi(400, MSG_NON_GOOGLE);
  return u;
}

// ─── Lettura di nome e coordinate da un indirizzo di Google Maps ───

const NUM = String.raw`(-?\d{1,3}(?:\.\d{1,20})?)`;
const RE_POSTO = new RegExp(`!3d${NUM}!4d${NUM}`);
const RE_VISTA = new RegExp(`@${NUM},${NUM}`);
const RE_COPPIA = new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`);

export type Dati = { nome?: string; lat?: number; lng?: number };

function coppia(a: string, b: string): { lat: number; lng: number } | null {
  const lat = Number(a);
  const lng = Number(b);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function decodifica(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

/** Un testo da proporre come nome: spazi puliti; niente se e' vuoto, troppo lungo, con caratteri strani o se e' una coppia di coordinate. */
function pulisciNome(d: string): string | null {
  const t = d.replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX_NOME_CAMPO || VIETATI.test(t) || /\d°/.test(t) || RE_COPPIA.test(t)) return null;
  return t;
}

/** "Centro+Sportivo%20Esempio" -> "Centro Sportivo Esempio" (+ diventa spazio PRIMA di decodificare i %xx). */
function nomeDaSegmento(segmento: string): string | null {
  const d = decodifica(segmento.replace(/\+/g, ' '));
  return d === null ? null : pulisciNome(d);
}

/**
 * Nome e coordinate dall'indirizzo:
 *  - nome: /maps/place/<Nome+Del+Campo>/...; se manca, il testo di ?q=<Nome, indirizzo> fino alla prima virgola
 *    (e' quello che Google mette nei link "Condividi" dell'app: maps.google.com?q=Nome+Via...&ftid=...);
 *  - coordinate: !3d<lat>!4d<lng> (il posto, da preferire), poi @lat,lng (il centro della mappa),
 *    poi ?q=lat,lng. Mai un valore fuori dai limiti della Terra.
 */
export function estraiDati(u: URL): Dati {
  const dati: Dati = {};
  const percorso = decodifica(u.pathname) ?? u.pathname;
  const cerca = `${percorso}${u.search}`;

  const posto = RE_POSTO.exec(cerca);
  const vista = RE_VISTA.exec(percorso);
  let c = posto ? coppia(posto[1], posto[2]) : null;
  if (!c && vista) c = coppia(vista[1], vista[2]);

  const inPercorso = /^\/maps\/place\/([^/]+)/.exec(u.pathname);
  if (inPercorso) {
    const n = nomeDaSegmento(inPercorso[1]);
    if (n) dati.nome = n;
    else {
      const latlng = decodifica(inPercorso[1].replace(/\+/g, ' '));
      const m = latlng ? RE_COPPIA.exec(latlng) : null; // /maps/place/41.9,12.4: un posto senza nome, solo la posizione
      if (m && !c) c = coppia(m[1], m[2]);
    }
  }

  // ?q= ha senso solo sulle pagine di mappe (non su google.com/search?q=...)
  const pagineMappe = u.pathname === '/' || /^\/maps(\/|$)/.test(u.pathname);
  for (const chiave of pagineMappe ? ['q', 'query', 'll'] : []) {
    const v = u.searchParams.get(chiave);
    if (!v) continue;
    const m = RE_COPPIA.exec(v);
    if (m) {
      if (!c) c = coppia(m[1], m[2]);
    } else if (chiave !== 'll' && !dati.nome && !inPercorso) {
      const n = pulisciNome(v.split(',')[0]);
      if (n) dati.nome = n;
    }
  }
  if (c) {
    dati.lat = c.lat;
    dati.lng = c.lng;
  }
  return dati;
}

// ─── Il giro dei redirect ───

export type Risolto = { nome?: string; lat?: number; lng?: number; url_indicazioni: string; link_finale: string };

/** consent.google.com/...?continue=<url>: si torna all'indirizzo originale, validato come ogni altro. */
function daConsenso(u: URL): URL {
  const c = u.searchParams.get('continue');
  if (!c) throw new ErroreApi(400, MSG_NON_GOOGLE);
  return urlAmmesso(c);
}

/** La pagina anti-robot di Google: non si segue. */
const eControlloRobot = (u: URL) => /^\/sorry(\/|$)/.test(u.pathname);

function nonRaggiungibile(): ErroreApi {
  return new ErroreApi(502, 'link: Google non ha risposto in tempo. Riprova fra poco, o scrivi il nome a mano');
}

/**
 * Risolve il testo incollato. `fetchFn` e' `fetch` (in produzione) o un finto (test). Errori: 400 "link: ..." se il link
 * non e' valido o esce dalla lista; 502 se Google non risponde.
 */
export async function risolviLink(testo: string, fetchFn: FetchFn, opzioni: { maxRedirect?: number; timeoutMs?: number } = {}): Promise<Risolto> {
  const maxRedirect = opzioni.maxRedirect ?? MAX_REDIRECT_MAPS;
  const grezzo = primoUrl(testo);
  if (!grezzo) throw new ErroreApi(400, 'link: incolla il link di Google Maps (tipo https://maps.app.goo.gl/...)');

  let corrente = urlAmmesso(grezzo);
  let seguiti = 0;
  const passa = (prossimo: URL) => {
    if (seguiti >= maxRedirect) throw new ErroreApi(400, 'link: troppi reindirizzamenti, il link non sembra quello di un posto');
    seguiti++;
    corrente = prossimo;
  };

  const controllo = new AbortController();
  const scadenza = setTimeout(() => controllo.abort(), opzioni.timeoutMs ?? TIMEOUT_MAPS_MS);
  try {
    for (;;) {
      if (corrente.hostname === 'consent.google.com') {
        passa(daConsenso(corrente));
        continue;
      }
      if (eControlloRobot(corrente)) break;
      // Un indirizzo di Google che dice gia' tutto non si apre (meno richieste, e niente giri con la pagina del consenso).
      const dati = estraiDati(corrente);
      if (!ACCORCIATORI.has(corrente.hostname) && (dati.nome !== undefined || dati.lat !== undefined)) break;

      let r: Response;
      try {
        r = await fetchFn(corrente.href, {
          method: 'GET',
          redirect: 'manual',
          signal: controllo.signal,
          headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'it-IT,it;q=0.9' },
        });
      } catch {
        throw nonRaggiungibile();
      }
      void r.body?.cancel().catch(() => undefined); // il corpo non si legge: si scarta

      if (r.status >= 300 && r.status < 400) {
        const dove = r.headers.get('Location');
        if (!dove) throw new ErroreApi(502, 'link: Google ha risposto senza dire dove andare');
        const prossimo = urlAmmesso(dove, corrente);
        if (eControlloRobot(prossimo)) break; // Google ha bloccato la richiesta: ci si ferma con quello che c'e'
        passa(prossimo);
        continue;
      }
      if (r.status === 404 || r.status === 400) throw new ErroreApi(400, 'link: Google non riconosce questo link');
      if (r.status < 200 || r.status >= 300) throw new ErroreApi(502, `link: Google ha risposto con un errore (${r.status}). Riprova, o scrivi il nome a mano`);
      break;
    }
  } finally {
    clearTimeout(scadenza);
  }

  const dati = estraiDati(corrente);
  return { ...dati, url_indicazioni: indicazioni(dati) ?? corrente.href, link_finale: corrente.href };
}

/**
 * SOLO PROVE. In `npm run e2e:admin` il server gira con GOOGLE_MAPS_PROVA=http://localhost:<porta> e le richieste "verso Google"
 * vanno a un finto Google locale (la lista degli host e i redirect restano validati sugli indirizzi VERI di Google: cambia solo
 * dove si spedisce la richiesta). Si apre alle stesse condizioni del bypass di sviluppo: variabile esplicita, richiesta da localhost,
 * Access NON configurato, nessun Cf-Ray. In produzione e' sempre null, anche se la variabile ci finisse per errore.
 */
export function fetchDiProva(request: Request, env: Ambiente): FetchFn | null {
  const grezzo = (env.GOOGLE_MAPS_PROVA ?? '').trim();
  if (!grezzo || !bypassAmmesso(request, new URL(request.url), env)) return null;
  let base: URL;
  try {
    base = new URL(grezzo);
  } catch {
    return null;
  }
  if (base.protocol !== 'http:' || (base.hostname !== 'localhost' && base.hostname !== '127.0.0.1')) return null;
  return (url, init) => {
    const u = new URL(url);
    return fetch(`${base.origin}${u.pathname}${u.search}`, { ...init, headers: { ...(init.headers as Record<string, string>), 'X-Host-Simulato': u.hostname } });
  };
}
