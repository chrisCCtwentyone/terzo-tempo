/**
 * Middleware di radice: passa su TUTTE le richieste del sito.
 *
 *  1. `/api/admin/*` richiede Cloudflare Access (functions/lib/access.ts):
 *     401 senza token, 403 se non valido o non autorizzato o non configurato.
 *     Vale per ogni file presente o futuro sotto functions/api/admin/, senza che
 *     nessuno debba ricordarsene (test/admin_chiuso.test.ts li enumera).
 *     Il resto di `/api/*` e' pubblico per scelta (decisione dell'utente).
 *  2. `/lib/*` e' chiuso: ci sono solo moduli condivisi.
 *  3. Le SCRITTURE che il browser dichiara partite da un altro sito (Origin o
 *     Sec-Fetch-Site) sono rifiutate: difesa dal CSRF, vale anche per il voto.
 *  4. Intestazioni di sicurezza; un errore interno non esce mai come stack trace.
 */

import { verificaAccesso } from './lib/access';
import { errore, type Env } from './lib/risposta';

/**
 * Il frontend deve stare dentro questa CSP: script, stili e caratteri solo dal
 * nostro sito (i font vanno self-hosted, es. @fontsource), immagini anche
 * data:/blob:. Niente 'unsafe-inline' e niente 'unsafe-eval': gli stili dei
 * componenti React passano dal CSSOM (element.style), che la CSP non blocca.
 * Se serve altro, si allarga qui e si dice perche'.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const INTESTAZIONI_SICUREZZA: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': CSP,
};

/**
 * Decodifica le %XX ASCII una a una, anche se altrove il percorso ha percentuali malformate:
 * decodeURIComponent su tutto il percorso lancia al primo "%zz" e un percorso come
 * "/api/%61dmin/%zz" resterebbe scritto in chiaro-cifrato, cioe' senza la parola "admin".
 * Si ripete (doppia e tripla codifica).
 */
function decodifica(percorso: string): string {
  let p = percorso;
  for (let i = 0; i < 3; i++) {
    const nuovo = p.replace(/%([0-9a-fA-F]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    if (nuovo === p) break;
    p = nuovo;
  }
  return p;
}

/** Il percorso, comunque scritto (maiuscole, %-codifiche anche doppie o malformate, doppi slash, backslash), come elenco di segmenti. */
function segmenti(percorso: string): string[][] {
  return [percorso, decodifica(percorso)].map((p) => p.toLowerCase().split(/[/\\;]+/).filter(Boolean));
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  try {
    return await gestisci(ctx);
  } catch (e) {
    // Anche un guasto fuori dagli handler (o del middleware stesso) esce senza dettagli e con le intestazioni.
    console.error('errore non gestito:', e instanceof Error ? e.message : 'sconosciuto');
    return conIntestazioni(errore(500, 'errore interno del servizio: riprova fra poco'));
  }
};

async function gestisci(ctx: EventContext<Env, string, Record<string, unknown>>): Promise<Response> {
  const url = new URL(ctx.request.url);
  const varianti = segmenti(url.pathname);

  if (varianti.some((s) => s[0] === 'lib')) return conIntestazioni(errore(404, 'non trovato'));

  if (varianti.some((s) => s.includes('api'))) {
    if (daAltroSito(ctx.request, url)) return conIntestazioni(errore(403, 'richiesta da un altro sito: rifiutata'));
    // "admin" in QUALUNQUE posizione del percorso: nel dubbio si chiede l'accesso.
    if (varianti.some((s) => s.includes('admin'))) {
      const esito = await verificaAccesso(ctx.request, ctx.env);
      if (!esito.ok) {
        // All'esterno un messaggio uguale per tutti i rifiuti: niente indizi su configurazione o motivo
        // (il motivo resta nei log, che non contengono mai token ne' email).
        if (esito.stato !== 401) console.warn('accesso admin rifiutato:', esito.motivo);
        return conIntestazioni(errore(esito.stato, MESSAGGIO_RIFIUTO[esito.stato]));
      }
      (ctx.data as { utente?: string }).utente = esito.email;
    }
    const risposta = await esegui(ctx);
    // Un percorso /api inesistente non deve rispondere con la pagina dell'app.
    if ((risposta.headers.get('Content-Type') ?? '').startsWith('text/html')) {
      return conIntestazioni(errore(404, 'non trovato'));
    }
    return conIntestazioni(risposta);
  }

  const risposta = conIntestazioni(await ctx.next());
  return url.pathname === PERCORSO_MANIFEST ? conTipoManifest(risposta) : risposta;
}

const PERCORSO_MANIFEST = '/manifest.webmanifest';
const TIPO_MANIFEST = 'application/manifest+json';

/**
 * Il manifest (icona e nome della webapp sulla Home) deve uscire come application/manifest+json. Pages lo fa gia' da solo
 * (scripts/controlla_produzione.sh lo verifica sul sito vero); qui si corregge solo un tipo sbagliato (octet-stream, text/plain,
 * json...). Una risposta HTML resta com'e': e' la pagina dell'app al posto di un manifest mancante, e dirle "manifest" nasconderebbe l'errore.
 */
function conTipoManifest(risposta: Response): Response {
  const tipo = (risposta.headers.get('Content-Type') ?? '').toLowerCase();
  if (!risposta.ok || tipo.startsWith(TIPO_MANIFEST) || tipo.startsWith('text/html')) return risposta;
  risposta.headers.set('Content-Type', TIPO_MANIFEST);
  return risposta;
}

const MESSAGGIO_RIFIUTO = { 401: 'accesso richiesto', 403: 'accesso negato', 503: 'servizio momentaneamente non disponibile' } as const;

/**
 * True se una scrittura arriva, secondo il browser, da un altro sito. Le
 * letture restano fuori. Senza Origin ne' Sec-Fetch-Site (curl, strumenti) non
 * si decide qui: per l'admin resta il token di Access, che un altro sito non
 * puo' fabbricare.
 */
function daAltroSito(request: Request, url: URL): boolean {
  const metodo = request.method.toUpperCase();
  if (metodo === 'GET' || metodo === 'HEAD') return false;
  const sito = request.headers.get('Sec-Fetch-Site');
  if (sito && sito !== 'same-origin' && sito !== 'none') return true;
  const origine = request.headers.get('Origin');
  return !!origine && origine !== url.origin;
}

/** Un errore non previsto non deve MAI uscire come stack trace. Nei log solo il messaggio. */
async function esegui(ctx: EventContext<Env, string, Record<string, unknown>>): Promise<Response> {
  try {
    return await ctx.next();
  } catch (e) {
    console.error('errore non gestito:', e instanceof Error ? e.message : 'sconosciuto');
    return errore(500, 'errore interno del servizio: riprova fra poco');
  }
}

function conIntestazioni(risposta: Response): Response {
  const nuova = new Response(risposta.body, risposta);
  for (const [k, v] of Object.entries(INTESTAZIONI_SICUREZZA)) nuova.headers.set(k, v);
  return nuova;
}
