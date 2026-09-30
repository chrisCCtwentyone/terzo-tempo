/**
 * Verifica del token di Cloudflare Access per le rotte /api/admin/*.
 *
 * Access e' il cancello davanti all'admin; questo file e' il SECONDO cancello
 * e regge da solo se la policy fosse scritta male o non coprisse un indirizzo
 * di anteprima. Access aggiunge `Cf-Access-Jwt-Assertion` (JWT RS256); le
 * chiavi pubbliche stanno su https://<team>/cdn-cgi/access/certs (cache di un'ora).
 *
 * FAIL-CLOSED, in tutti i punti:
 *  - ACCESS_TEAM_DOMAIN, ACCESS_AUD o EMAIL_AUTORIZZATE mancanti, vuote o
 *    "DA_COMPILARE" -> 403. Un elenco email vuoto non vuol dire "tutti";
 *  - nessun token -> 401; qualunque anomalia del token -> 403;
 *  - chiavi pubbliche irraggiungibili -> 503, mai "lascio passare".
 *
 * Unica scorciatoia: DEV_ADMIN_BYPASS=1 (solo .dev.vars) E richiesta da
 * localhost. Le due condizioni sono in `&&`: nessuna basta da sola.
 *
 * Non scrive MAI nei log il token, ne' l'email.
 */

export type Ambiente = {
  /** es. "nome.cloudflareaccess.com", senza https:// */
  ACCESS_TEAM_DOMAIN?: string;
  /** "Application Audience (AUD) Tag" dell'applicazione Access */
  ACCESS_AUD?: string;
  /** elenco di email separate da virgola. OBBLIGATORIO. */
  EMAIL_AUTORIZZATE?: string;
  /** "1" salta il controllo, ma SOLO per richieste da localhost (.dev.vars) */
  DEV_ADMIN_BYPASS?: string;
};

export type EsitoAccesso =
  | { ok: true; email: string }
  | { ok: false; stato: 401 | 403 | 503; motivo: string };

/** Valore segnaposto di wrangler.toml: conta come "non configurato". */
export const SEGNAPOSTO = 'DA_COMPILARE';

type Jwk = JsonWebKey & { kid?: string };

const DURATA_CACHE_MS = 60 * 60 * 1000;
/**
 * Una chiave sconosciuta fa rileggere l'elenco, ma non piu' di una volta al
 * minuto: altrimenti chiunque, inventando un `kid`, potrebbe farci chiamare
 * Cloudflare a ogni richiesta.
 */
const INTERVALLO_MINIMO_RILETTURA_MS = 60 * 1000;

let cacheChiavi: { quando: number; dominio: string; chiavi: Jwk[] } | null = null;

/** Solo per i test: dimentica le chiavi lette. */
export function dimenticaChiavi(): void {
  cacheChiavi = null;
}

function base64UrlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('base64url non valido');
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodificaJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(base64UrlDecode(s)));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

async function leggiChiavi(dominio: string): Promise<Jwk[]> {
  const r = await fetch(`https://${dominio}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error('certs non raggiungibili');
  const body = (await r.json()) as { keys?: Jwk[] };
  const chiavi = Array.isArray(body.keys) ? body.keys : [];
  if (chiavi.length === 0) throw new Error('nessuna chiave pubblica');
  cacheChiavi = { quando: Date.now(), dominio, chiavi };
  return chiavi;
}

async function chiaviDiFirma(dominio: string, kid: string | null): Promise<Jwk[]> {
  const ora = Date.now();
  const valida =
    cacheChiavi && cacheChiavi.dominio === dominio && ora - cacheChiavi.quando < DURATA_CACHE_MS;
  if (!valida) return leggiChiavi(dominio);

  const chiavi = cacheChiavi!.chiavi;
  // Chiave appena ruotata da Cloudflare e non ancora vista: si rilegge, con
  // il freno descritto sopra.
  if (
    kid &&
    !chiavi.some((k) => k.kid === kid) &&
    ora - cacheChiavi!.quando >= INTERVALLO_MINIMO_RILETTURA_MS
  ) {
    return leggiChiavi(dominio);
  }
  return chiavi;
}

function localhost(url: URL): boolean {
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
}

/** Una variabile e' configurata se non e' vuota e non e' il segnaposto. */
function configurata(v: string | undefined): string {
  const pulita = (v || '').trim();
  return pulita && pulita.toUpperCase() !== SEGNAPOSTO ? pulita : '';
}

export function elencoEmail(grezzo: string | undefined): string[] {
  return configurata(grezzo)
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x && x.toUpperCase() !== SEGNAPOSTO);
}

function leggiCookie(request: Request, nome: string): string | null {
  const grezzo = request.headers.get('Cookie');
  if (!grezzo) return null;
  for (const pezzo of grezzo.split(';')) {
    const i = pezzo.indexOf('=');
    if (i < 0) continue;
    if (pezzo.slice(0, i).trim() === nome) return pezzo.slice(i + 1).trim();
  }
  return null;
}

const rifiuto = (motivo: string): EsitoAccesso => ({ ok: false, stato: 403, motivo });

/**
 * Verifica la richiesta. E' la funzione che il middleware chiama su OGNI
 * /api/*. Non esiste un ramo che, in caso di dubbio, lasci passare.
 */
export async function verificaAccesso(request: Request, env: Ambiente): Promise<EsitoAccesso> {
  const url = new URL(request.url);

  // Scorciatoia di sviluppo: sul sito pubblico e sugli indirizzi di anteprima
  // l'hostname non e' mai localhost, quindi questo ramo non e' raggiungibile.
  if (env.DEV_ADMIN_BYPASS === '1' && localhost(url)) {
    return { ok: true, email: 'sviluppo@locale' };
  }

  const dominio = configurata(env.ACCESS_TEAM_DOMAIN)
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  const aud = configurata(env.ACCESS_AUD);
  const autorizzate = elencoEmail(env.EMAIL_AUTORIZZATE);
  if (!dominio || !aud || autorizzate.length === 0) {
    return {
      ok: false,
      stato: 403,
      motivo: 'admin non configurato: mancano ACCESS_TEAM_DOMAIN, ACCESS_AUD o EMAIL_AUTORIZZATE',
    };
  }

  const token =
    request.headers.get('Cf-Access-Jwt-Assertion') || leggiCookie(request, 'CF_Authorization');
  if (!token) return { ok: false, stato: 401, motivo: 'accesso richiesto' };

  const parti = token.split('.');
  if (parti.length !== 3) return rifiuto('token malformato');

  const intestazione = decodificaJson(parti[0]);
  const corpo = decodificaJson(parti[1]);
  if (!intestazione || !corpo) return rifiuto('token illeggibile');
  // Solo RS256: blocca sia "none" sia la confusione di algoritmo (HS256 con
  // la chiave pubblica usata come segreto).
  if (intestazione.alg !== 'RS256') return rifiuto('algoritmo di firma non ammesso');

  const kid = typeof intestazione.kid === 'string' ? intestazione.kid : null;
  let chiavi: Jwk[];
  try {
    chiavi = await chiaviDiFirma(dominio, kid);
  } catch {
    // Se non riesco a verificare, NON lascio passare.
    return { ok: false, stato: 503, motivo: 'chiavi di verifica non disponibili' };
  }

  const candidate = kid ? chiavi.filter((k) => k.kid === kid) : chiavi;
  if (candidate.length === 0) return rifiuto('chiave di firma sconosciuta');

  let firma: Uint8Array;
  try {
    firma = base64UrlDecode(parti[2]);
  } catch {
    return rifiuto('token illeggibile');
  }
  const datiFirmati = new TextEncoder().encode(`${parti[0]}.${parti[1]}`);

  let firmaValida = false;
  for (const jwk of candidate) {
    try {
      const chiave = await crypto.subtle.importKey(
        'jwk',
        jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chiave, firma as BufferSource, datiFirmati)) {
        firmaValida = true;
        break;
      }
    } catch {
      // chiave non utilizzabile: si prova la successiva
    }
  }
  if (!firmaValida) return rifiuto('firma non valida');

  // Da qui in poi il contenuto e' autentico: si controlla che sia per noi,
  // per adesso, e per la persona giusta.
  const adesso = Math.floor(Date.now() / 1000);
  const exp = typeof corpo.exp === 'number' ? corpo.exp : 0;
  const nbf = typeof corpo.nbf === 'number' ? corpo.nbf : 0;
  if (exp <= adesso) return rifiuto('token scaduto');
  if (nbf > adesso + 60) return rifiuto('token non ancora valido');

  if (String(corpo.iss || '') !== `https://${dominio}`) {
    return rifiuto('emittente del token non corrispondente');
  }

  const audToken = Array.isArray(corpo.aud) ? corpo.aud.map(String) : [String(corpo.aud || '')];
  if (!audToken.includes(aud)) return rifiuto("token emesso per un'altra applicazione");

  // Seconda difesa, obbligatoria: anche un token valido, ma di una persona che
  // la policy Access avesse lasciato passare per sbaglio, viene rifiutato.
  const email = typeof corpo.email === 'string' ? corpo.email.trim().toLowerCase() : '';
  if (!email || !autorizzate.includes(email)) return rifiuto('utente non autorizzato');

  return { ok: true, email };
}
