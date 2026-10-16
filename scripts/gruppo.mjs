/**
 * Funzioni pure per scripts/nuovo_gruppo.mjs e scripts/aggiorna_gruppo.mjs: servono a chi vuole un SUO Terzo Tempo, sul SUO
 * account Cloudflare (docs/NUOVO_GRUPPO.md). Stanno qui, e non dentro gli script, per poterle provare con test/gruppo.test.ts.
 *
 * Non toccano niente da sole: niente rete, niente file. Il sito originale si pubblica SOLO con scripts/pubblica.sh, e questi
 * script si rifiutano di lavorare sul progetto che si chiama come lui (PROGETTO_ORIGINALE).
 */

/** Il nome del progetto Pages del sito originale: gli script per un gruppo nuovo non lo pubblicano mai. */
export const PROGETTO_ORIGINALE = 'terzo-tempo'

/** Le sole righe di wrangler.toml che cambiano da un gruppo all'altro. */
export const CHIAVI_GRUPPO = ['name', 'database_name', 'database_id', 'ACCESS_TEAM_DOMAIN', 'ACCESS_AUD']

/** Nome di un progetto Pages (e del suo database D1): minuscole, cifre e trattini, senza trattino in testa o in coda. */
export function nomeValido(nome) {
  return /^[a-z0-9](?:[a-z0-9-]{0,56}[a-z0-9])?$/.test(nome)
}

/** "https://Nome.cloudflareaccess.com/" -> "nome.cloudflareaccess.com"; null se non e' un dominio Zero Trust. */
export function normalizzaTeamDomain(testo) {
  const d = String(testo).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(d) ? d : null
}

/** L'"Application Audience (AUD) Tag" di Access: 64 caratteri esadecimali. null se non lo e'. */
export function normalizzaAud(testo) {
  const a = String(testo).trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(a) ? a : null
}

/**
 * Elenco di email separate da virgola, spazio o punto e virgola -> { email: [...] } in minuscolo e senza doppioni,
 * oppure { errore }. Il risultato va nel secret EMAIL_AUTORIZZATE, unito da virgole (functions/lib/access.ts).
 */
export function elencoEmail(testo) {
  const email = [...new Set(String(testo).split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
  if (email.length === 0) return { errore: 'serve almeno una email' }
  const sbagliate = email.filter((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
  if (sbagliate.length > 0) return { errore: `non sembrano email: ${sbagliate.join(', ')}` }
  return { email }
}

/** Il valore di `chiave = "..."` in wrangler.toml (le righe di commento non contano); null se manca. */
export function leggiValore(toml, chiave) {
  const m = toml.match(new RegExp(`^${chiave} = "([^"]*)"$`, 'm'))
  return m ? m[1] : null
}

/** Riscrive `chiave = "..."` in wrangler.toml. La riga deve esserci UNA volta sola: altrimenti errore, mai indovinare. */
export function impostaValore(toml, chiave, valore) {
  if (!CHIAVI_GRUPPO.includes(chiave)) throw new Error(`chiave non prevista: ${chiave}`)
  if (/["\\\n]/.test(valore)) throw new Error(`valore non valido per ${chiave}`)
  const riga = new RegExp(`^${chiave} = "[^"]*"$`, 'gm')
  const trovate = toml.match(riga) ?? []
  if (trovate.length !== 1) throw new Error(`in wrangler.toml la riga ${chiave} = "..." c'e' ${trovate.length} volte (ne serve una)`)
  return toml.replace(riga, `${chiave} = "${valore}"`)
}

/** Dall'uscita di `wrangler pages project create`: l'indirizzo vero del sito (puo' avere un suffisso se il nome e' preso). */
export function indirizzoPagesDev(uscita) {
  const m = String(uscita).match(/https:\/\/([a-z0-9-]+\.pages\.dev)/)
  return m ? m[1] : null
}

/** Dall'uscita di `wrangler d1 list --json`: l'elenco dei database ({ uuid, name }). Uscita illeggibile -> null. */
export function databaseDaJson(uscita) {
  // Il JSON parte dalla prima riga che inizia con "[": prima possono esserci avvisi come "▲ [WARNING] ...".
  const testo = String(uscita)
  const inizio = testo.search(/^\[/m)
  if (inizio < 0) return null
  try {
    const elenco = JSON.parse(testo.slice(inizio))
    return Array.isArray(elenco) ? elenco.filter((d) => d && typeof d.uuid === 'string' && typeof d.name === 'string') : null
  } catch {
    return null
  }
}

/**
 * Il wrangler.toml descrive un sito che sta GIA' su questo account, cioe' un sito avviato e funzionante? Allora
 * nuovo_gruppo.mjs non deve riscriverlo. L'unica eccezione e' un gruppo nuovo avviato a meta' (nome diverso
 * dall'originale): lo script puo' ripartire per finire il lavoro.
 */
export function sitoOriginaleSuQuestoAccount(toml, database) {
  const id = leggiValore(toml, 'database_id')
  return leggiValore(toml, 'name') === PROGETTO_ORIGINALE && database.some((d) => d.uuid === id)
}
