#!/usr/bin/env node
/**
 * Decide QUALI prove nel browser servono a una pubblicazione, dai file cambiati rispetto all'ultima pubblicazione riuscita
 * (CLAUDE.md, "Pubblicazione a verifiche mirate"). Lo usa scripts/pubblica.sh; la logica sta qui, e non dentro la shell, per
 * poterla provare con test/verifiche_mirate.test.ts.
 *
 * Decide SOLO le prove nel browser (npm run e2e, npm run e2e:admin, rilevatore di trabocchi compreso). Il resto di pubblica.sh
 * (tsc -b, build, tutti i test unitari con le guardie su sicurezza, nomi e segreti, migrazioni, deploy, controllo del sito vero)
 * parte SEMPRE e non dipende da niente di quello che c'e' qui.
 *
 * Regola di fondo: nel dubbio si prova. Un percorso che nessuna regola prevede, o scritto in modo strano, vale il giro COMPLETO.
 *
 * Uso da riga di comando:
 *   node scripts/verifiche_mirate.mjs [--completo] [--da-file <elenco>] [percorso...]
 * I percorsi (relativi alla radice del repository) si passano come argomenti, oppure uno per riga in un file (--da-file).
 * Uscita, sullo stdout: prima riga `E2E=0|1`, seconda `E2E_ADMIN=0|1`, poi il resoconto per gli umani (righe rientrate).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------------------------------------------------
// LE REGOLE. Si valutano IN ORDINE, per ogni file cambiato; vale la PRIMA che corrisponde. Modello dei percorsi: `dir/**` =
// tutto quello che sta sotto dir; `*` = qualsiasi cosa dentro un nome (mai una `/`); `**/` davanti = a qualsiasi profondita'.
// Un file puo' chiedere l'e2e pubblico (`e2e`), l'e2e admin (`admin`), tutti e due, o nessuno. La richiesta dell'INSIEME dei
// file e' l'unione di quelle dei singoli file.
// ---------------------------------------------------------------------------------------------------------------------
const TUTTI = { e2e: true, admin: true }
const SOLO_PUBBLICO = { e2e: true, admin: false }
const SOLO_ADMIN = { e2e: false, admin: true }
const NESSUNO = { e2e: false, admin: false }

/** @type {{ nome: string, percorsi: string[], prove: { e2e: boolean, admin: boolean } }[]} */
export const REGOLE = [
  // 0. Un file Markdown e' un documento, in qualunque cartella stia (anche in app/src/admin): non gira nel browser.
  { nome: 'documenti Markdown', percorsi: ['**/*.md'], prove: NESSUNO },

  // 1. Lo script di pubblicazione e la logica che decide le prove: se cambiano loro, niente e' piu' "gia' provato" -> COMPLETO.
  //    (verifiche_mirate.mjs/.d.mts sono la stessa logica di pubblica.sh: stessa prudenza, anche se stanno in scripts/.)
  { nome: 'pubblica.sh e la sua logica di scelta', percorsi: ['scripts/pubblica.sh', 'scripts/verifiche_mirate.mjs', 'scripts/verifiche_mirate.d.mts'], prove: TUTTI },
  //    Il seed di prova e' il contenuto del D1 su cui girano TUTTE le prove nel browser: anche se sta in scripts/, lo si prova.
  { nome: 'seed di prova (i dati delle prove nel browser)', percorsi: ['scripts/seed_prova.sql'], prove: TUTTI },

  // 2. Impianto e rilevatore di trabocchi delle prove nel browser: li usano tutti e due i giri.
  { nome: 'impianto comune delle prove nel browser', percorsi: ['e2e/impianto.ts', 'e2e/trabocchi.ts', 'e2e/schermate_trabocchi.ts'], prove: TUTTI },
  //    Un file e2e specifico: solo il suo giro.
  { nome: 'prova e2e pubblica', percorsi: ['e2e/e2e.ts'], prove: SOLO_PUBBLICO },
  { nome: 'prove e2e admin e i loro finti (Access, Google, moduli)', percorsi: ['e2e/e2e_admin.ts', 'e2e/access_simulato.ts', 'e2e/google_simulato.ts', 'e2e/moduli.ts'], prove: SOLO_ADMIN },

  // 3. Interfaccia: l'area admin e le pagine pubbliche.
  { nome: 'area admin (app/src/admin)', percorsi: ['app/src/admin/**'], prove: SOLO_ADMIN },
  { nome: 'pagine pubbliche (app/src/pagine)', percorsi: ['app/src/pagine/**'], prove: SOLO_PUBBLICO },

  // 4. Tutto cio' che e' COMUNE a pubblico e admin (componenti, stili, librerie, backend, database, build, dipendenze): TUTTI E DUE.
  {
    nome: 'parti comuni (ui, stili, lib, index.html, public, shared, functions, migrations, build, dipendenze)',
    percorsi: [
      'app/src/ui/**', 'app/src/stili/**', 'app/src/lib/**', 'app/index.html', 'app/public/**',
      'shared/**', 'functions/**', 'migrations/**',
      'vite.config.*', 'package.json', 'package-lock.json',
    ],
    prove: TUTTI,
  },

  // 5. Niente di cio' che gira nel browser: documenti, test unitari (partono comunque tutti in pubblica.sh), altri script.
  //    Gli script restanti (controlla_produzione.sh, genera_icone.mjs...) non cambiano l'app: il controllo del sito vero parte sempre.
  { nome: 'documenti, test unitari o altri script', percorsi: ['docs/**', 'LICENSE', 'test/**', 'scripts/*'], prove: NESSUNO },
]

/** Il motivo che si stampa per un file che nessuna regola prevede: nel dubbio si prova. */
const REGOLA_SCONOSCIUTO = 'percorso non previsto dalle regole (nel dubbio si prova tutto)'

/** Da un modello di percorso a un'espressione regolare. */
function modello(p) {
  let r = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*' && p[i + 1] === '*') {
      if (p[i + 2] === '/') { r += '(?:.*/)?'; i += 2 } else { r += '.*'; i += 1 }
    } else if (c === '*') r += '[^/]*'
    else r += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&')
  }
  return new RegExp(`^${r}$`)
}
const COMPILATE = REGOLE.map((r) => ({ ...r, res: r.percorsi.map(modello) }))

/** `./a//b` -> `a/b`. Null se il percorso e' vuoto, assoluto, esce dalla radice (`..`) o contiene caratteri di controllo/virgolette. */
function normalizza(percorso) {
  const p = String(percorso).trim().replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/\/{2,}/g, '/')
  if (p === '' || p.startsWith('/') || p.split('/').includes('..') || p.split('/').includes('.') || /["\u0000-\u001f]/.test(p)) return null
  return p
}

/**
 * La regola di un singolo file: { regola, e2e, admin }. Senza regola (percorso non previsto o strano) vale il COMPLETO.
 * @param {string} percorso
 */
export function classificaFile(percorso) {
  const p = normalizza(percorso)
  if (p !== null) {
    for (const r of COMPILATE) if (r.res.some((re) => re.test(p))) return { file: p, regola: r.nome, ...r.prove }
  }
  return { file: p ?? String(percorso), regola: REGOLA_SCONOSCIUTO, ...TUTTI }
}

/**
 * Le prove nel browser che servono a un elenco di file cambiati.
 * @param {string[]} files  percorsi cambiati rispetto all'ultima pubblicazione
 * @param {{ completo?: boolean }} [opzioni]  completo = forza tutto (`--completo`, o riferimento mancante)
 * @returns {{ e2e: boolean, e2eAdmin: boolean, motivo: string, gruppi: { regola: string, e2e: boolean, admin: boolean, file: string[] }[] }}
 */
export function verificheMirate(files, { completo = false } = {}) {
  const classificati = [...new Set(files.map((f) => String(f)))].filter((f) => f.trim() !== '').map(classificaFile)
  /** @type {Map<string, { regola: string, e2e: boolean, admin: boolean, file: string[] }>} */
  const perRegola = new Map()
  for (const c of classificati) {
    const g = perRegola.get(c.regola) ?? { regola: c.regola, e2e: c.e2e, admin: c.admin, file: [] }
    g.file.push(c.file)
    perRegola.set(c.regola, g)
  }
  const gruppi = [...perRegola.values()]
  if (completo) return { e2e: true, e2eAdmin: true, motivo: 'giro completo richiesto', gruppi }
  const e2e = gruppi.some((g) => g.e2e)
  const e2eAdmin = gruppi.some((g) => g.admin)
  if (gruppi.length === 0) return { e2e, e2eAdmin, motivo: 'nessun file cambiato dall\'ultima pubblicazione: nessuna prova nel browser', gruppi }
  const motivo = gruppi.map((g) => `${g.regola}: ${g.e2e && g.admin ? 'e2e pubblico + admin' : g.e2e ? 'e2e pubblico' : g.admin ? 'e2e admin' : 'nessuna prova nel browser'}`).join('; ')
  return { e2e, e2eAdmin, motivo, gruppi }
}

/** Il riassunto dei file per gruppo, una riga ciascuno (al massimo 3 nomi per gruppo). */
export function riassuntoFile(gruppi) {
  return gruppi.map((g) => {
    const nomi = g.file.slice(0, 3).join(', ') + (g.file.length > 3 ? `, ... (+${g.file.length - 3})` : '')
    const prove = g.e2e && g.admin ? 'e2e pubblico + admin' : g.e2e ? 'e2e pubblico' : g.admin ? 'e2e admin' : 'nessuna prova nel browser'
    return `${g.file.length} file - ${g.regola} -> ${prove} [${nomi}]`
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Riga di comando (solo se il file e' lanciato direttamente, non quando lo importa un test).
// ---------------------------------------------------------------------------------------------------------------------
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2)
  let completo = false
  /** @type {string[]} */
  const files = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--completo') completo = true
    else if (args[i] === '--da-file') {
      const f = args[++i]
      if (!f) { console.error('--da-file vuole il nome di un file'); process.exit(2) }
      files.push(...readFileSync(f, 'utf8').split('\n'))
    } else files.push(args[i])
  }
  const r = verificheMirate(files, { completo })
  console.log(`E2E=${r.e2e ? 1 : 0}`)
  console.log(`E2E_ADMIN=${r.e2eAdmin ? 1 : 0}`)
  for (const riga of riassuntoFile(r.gruppi)) console.log(`  ${riga}`)
  console.log(`  motivo: ${r.motivo}`)
}
