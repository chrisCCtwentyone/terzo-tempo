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
 * data:/blob:. Se serve altro, si allarga qui e si dice perche'.
 */
const CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const INTESTAZIONI_SICUREZZA: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
  'Content-Security-Policy': CSP,
};

/** Il percorso, comunque scritto (maiuscole, %-codifiche, doppi slash), come elenco di segmenti. */
function segmenti(percorso: string): string[][] {
  let decodificato = percorso;
  try {
    decodificato = decodeURIComponent(decodeURIComponent(percorso));
  } catch {
    // percorso con percentuali malformate: si tiene quello grezzo
  }
  return [percorso, decodificato].map((p) => p.toLowerCase().split(/[/\\]+/).filter(Boolean));
}

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const varianti = segmenti(url.pathname);

  if (varianti.some((s) => s[0] === 'lib')) return conIntestazioni(errore(404, 'non trovato'));

  if (varianti.some((s) => s[0] === 'api')) {
    if (daAltroSito(ctx.request, url)) return conIntestazioni(errore(403, 'richiesta da un altro sito: rifiutata'));
    // "admin" in QUALUNQUE posizione del percorso: nel dubbio si chiede l'accesso.
    if (varianti.some((s) => s.includes('admin'))) {
      const esito = await verificaAccesso(ctx.request, ctx.env);
      if (!esito.ok) return conIntestazioni(errore(esito.stato, esito.motivo));
      (ctx.data as { utente?: string }).utente = esito.email;
    }
    const risposta = await esegui(ctx);
    // Un percorso /api inesistente non deve rispondere con la pagina dell'app.
    if ((risposta.headers.get('Content-Type') ?? '').startsWith('text/html')) {
      return conIntestazioni(errore(404, 'non trovato'));
    }
    return conIntestazioni(risposta);
  }

  return conIntestazioni(await ctx.next());
};

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
