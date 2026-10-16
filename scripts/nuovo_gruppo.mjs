#!/usr/bin/env node
/**
 * Crea un Terzo Tempo NUOVO per un altro gruppo, sul SUO account Cloudflare: progetto Pages, database D1, wrangler.toml,
 * email degli admin, tabelle e prima pubblicazione. Guida passo passo in docs/NUOVO_GRUPPO.md.
 *
 * Uso (dalla cartella del progetto, dopo `npx wrangler login`):
 *   node scripts/nuovo_gruppo.mjs
 *
 * Fa domande e si ferma al primo errore. Si puo' rilanciare: un passo gia' fatto (progetto o database esistenti) si riusa.
 * Non lavora MAI sul sito originale: se l'account collegato ospita gia' il sito descritto da wrangler.toml, si rifiuta.
 * Le email degli admin finiscono solo nel secret EMAIL_AUTORIZZATE di Cloudflare, mai in un file.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import {
  PROGETTO_ORIGINALE, databaseDaJson, elencoEmail, impostaValore, indirizzoPagesDev, leggiValore, nomeValido,
  normalizzaAud, normalizzaTeamDomain, sitoOriginaleSuQuestoAccount,
} from './gruppo.mjs'

const RADICE = join(fileURLToPath(import.meta.url), '..', '..')
const TOML = join(RADICE, 'wrangler.toml')
const WINDOWS = process.platform === 'win32'

const titolo = (t) => console.log(`\n=== ${t} ===\n`)
function stop(messaggio) {
  console.error(`\nFERMO: ${messaggio}`)
  process.exit(1)
}

/** Lancia un comando mostrando tutto a schermo (anche le sue domande). Esito: true se e' andato bene. */
function esegui(comando, argomenti, opzioni = {}) {
  const r = spawnSync(comando, argomenti, { cwd: RADICE, stdio: opzioni.input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'], input: opzioni.input, shell: WINDOWS })
  return r.status === 0
}

/** Lancia un comando e ne raccoglie l'uscita (che poi si mostra comunque). */
function raccogli(comando, argomenti) {
  const r = spawnSync(comando, argomenti, { cwd: RADICE, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], shell: WINDOWS })
  return { ok: r.status === 0, uscita: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

const wrangler = (...a) => ['wrangler', ...a]

/** Una domanda alla volta: chiudere readline subito lascia la tastiera libera per le domande di wrangler. */
async function chiedi(domanda, predefinita = '') {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const r = (await rl.question(predefinita ? `${domanda} [${predefinita}]: ` : `${domanda}: `)).trim()
  rl.close()
  return r || predefinita
}
async function conferma(domanda) {
  return /^(s|si|sì|y|yes)$/i.test(await chiedi(`${domanda} (si/no)`))
}

function elencoDatabase() {
  const r = raccogli('npx', wrangler('d1', 'list', '--json'))
  const elenco = r.ok ? databaseDaJson(r.uscita) : null
  if (!elenco) {
    console.log(r.uscita)
    stop('non riesco a leggere i database D1 dell\'account. Se hai piu\' account Cloudflare, scegli quello giusto con la variabile CLOUDFLARE_ACCOUNT_ID (vedi docs/NUOVO_GRUPPO.md).')
  }
  return elenco
}

/** "https://nome.pages.dev/" -> "nome.pages.dev". */
function normalizzaDominio(t) {
  const d = t.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!/^[a-z0-9-]+\.pages\.dev$/.test(d)) stop(`"${t}" non e' un indirizzo .pages.dev`)
  return d
}

const scrivi = (chiave, valore) => writeFileSync(TOML, impostaValore(readFileSync(TOML, 'utf8'), chiave, valore))

// ---------------------------------------------------------------------------------------------------------------------
console.log('Terzo Tempo per un gruppo nuovo, sul TUO account Cloudflare. Guida completa: docs/NUOVO_GRUPPO.md')

if (!existsSync(join(RADICE, 'node_modules', 'wrangler'))) {
  titolo('Installo le dipendenze (npm ci)')
  if (!esegui('npm', ['ci'])) stop('npm ci non e\' riuscito.')
}

titolo('1. Account Cloudflare')
if (!esegui('npx', wrangler('whoami'))) stop('wrangler non vede nessun account. Esegui prima:  npx wrangler login')
const database = elencoDatabase()
if (sitoOriginaleSuQuestoAccount(readFileSync(TOML, 'utf8'), database)) {
  stop(`questo account ospita gia' il sito "${PROGETTO_ORIGINALE}" descritto in wrangler.toml. Questo script crea solo siti NUOVI su un altro account: il sito originale si pubblica con ./scripts/pubblica.sh. Non ho toccato niente.`)
}
if (!(await conferma('E\' questo l\'account su cui creare il sito?'))) stop('nessuna modifica. Cambia account con  npx wrangler logout  e  npx wrangler login')

titolo('2. Nome del sito')
console.log('Minuscole, cifre e trattini (es. calcetto-giovedi). Diventa l\'indirizzo: <nome>.pages.dev')
const attuale = leggiValore(readFileSync(TOML, 'utf8'), 'name')
let nome = ''
for (;;) {
  nome = (await chiedi('Nome', attuale !== PROGETTO_ORIGINALE ? attuale ?? '' : '')).toLowerCase()
  if (nome === PROGETTO_ORIGINALE) console.log(`"${PROGETTO_ORIGINALE}" e' il nome del sito originale: scegline un altro.`)
  else if (nomeValido(nome)) break
  else console.log('Nome non valido: solo a-z, 0-9 e trattini, senza trattino all\'inizio o alla fine.')
}

titolo('3. Progetto Cloudflare Pages')
const creato = raccogli('npx', wrangler('pages', 'project', 'create', nome, '--production-branch', 'main'))
console.log(creato.uscita)
let dominio = creato.ok ? indirizzoPagesDev(creato.uscita) : null
if (!creato.ok && !(await conferma(`Il progetto "${nome}" non e' stato creato. Se esiste gia' nel TUO account e vuoi riusarlo, rispondi si`))) {
  stop('nessuna pubblicazione. Rilancia lo script con un altro nome.')
}
if (!dominio) {
  console.log('L\'indirizzo esatto e\' nella dashboard: Workers & Pages > il progetto > "Domains".')
  dominio = normalizzaDominio(await chiedi('Indirizzo del sito', `${nome}.pages.dev`))
}
console.log(`Il sito sara' su https://${dominio}`)

titolo('4. Database D1')
let db = database.find((d) => d.name === nome)
if (db) {
  if (!(await conferma(`Esiste gia' un database "${nome}" in questo account. Lo riuso?`))) stop('nessuna modifica al database. Rilancia con un altro nome.')
} else {
  if (!esegui('npx', wrangler('d1', 'create', nome))) stop('creazione del database non riuscita.')
  db = elencoDatabase().find((d) => d.name === nome)
  if (!db) stop(`il database "${nome}" non compare nell'elenco dopo la creazione.`)
}
scrivi('name', nome)
scrivi('database_name', nome)
scrivi('database_id', db.uuid)
console.log(`wrangler.toml aggiornato: progetto e database "${nome}" (${db.uuid}).`)

titolo('5. Cloudflare Access (il login dell\'area admin)')
console.log(`Ora, nel browser, sulla dashboard Cloudflare (dettagli in docs/NUOVO_GRUPPO.md, passo "Access"):
  a) Zero Trust: se e' la prima volta, scegli il nome del team e il piano Free.
  b) Access > Applications > Add an application > Self-hosted, con questi indirizzi:
       ${dominio}  percorso  admin
       ${dominio}  percorso  api/admin
       *.${dominio}  (nessun percorso: copre le anteprime)
  c) Policy: Action "Allow", Include > Emails > le email degli admin.
  d) Login method: One-time PIN (codice via email).
  e) Salva, poi copia due valori:
       - il "Team domain": <nome-del-team>.cloudflareaccess.com
       - l'"Application Audience (AUD) Tag" dell'applicazione (64 caratteri, nella pagina dell'applicazione)`)
let team = null
while (!team) {
  team = normalizzaTeamDomain(await chiedi('Team domain'))
  if (!team) console.log('Deve essere del tipo  nome.cloudflareaccess.com')
}
let aud = null
while (!aud) {
  aud = normalizzaAud(await chiedi('AUD Tag'))
  if (!aud) console.log('L\'AUD Tag e\' una sequenza di 64 caratteri fra 0-9 e a-f.')
}
scrivi('ACCESS_TEAM_DOMAIN', team)
scrivi('ACCESS_AUD', aud)
console.log('wrangler.toml aggiornato: dominio Access e AUD.')

titolo('6. Email degli admin')
console.log('Le STESSE email messe nella policy di Access, separate da virgola. Restano solo su Cloudflare, mai in un file.')
let email = null
while (!email) {
  const e = elencoEmail(await chiedi('Email'))
  if (e.errore) console.log(e.errore)
  else email = e.email
}
if (!esegui('npx', wrangler('pages', 'secret', 'put', 'EMAIL_AUTORIZZATE', '--project-name', nome), { input: email.join(',') })) {
  stop('salvataggio del secret EMAIL_AUTORIZZATE non riuscito.')
}

titolo('7. Tabelle del database')
if (!esegui('npx', wrangler('d1', 'migrations', 'apply', 'DB', '--remote'))) stop('migrazioni non riuscite.')

titolo('8. Build e controlli')
if (!esegui('npm', ['run', 'build'])) stop('build non riuscita.')
if (!esegui('npm', ['test'])) stop('i test non passano: niente pubblicazione.')

titolo('9. Pubblicazione')
if (!esegui('npx', wrangler('pages', 'deploy', 'app/dist', '--project-name', nome, '--branch', 'main', '--commit-dirty=true'))) {
  stop('pubblicazione non riuscita.')
}

console.log(`
FATTO.
  Sito:        https://${dominio}   (il primo minuto puo' rispondere con un errore: riprova)
  Area admin:  https://${dominio}/admin   (chiede il codice via email)

Prossimi passi:
  - Dall'area admin: crea una stagione, poi i giocatori.
  - Salva wrangler.toml nel tuo fork (non contiene segreti):  git commit -am "Configurazione del mio gruppo"
  - Per pubblicare gli aggiornamenti:  node scripts/aggiorna_gruppo.mjs`)
