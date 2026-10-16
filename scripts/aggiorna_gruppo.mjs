#!/usr/bin/env node
/**
 * Ripubblica un Terzo Tempo creato con scripts/nuovo_gruppo.mjs (per esempio dopo aver preso gli aggiornamenti dal
 * repository originale): dipendenze, build, test, tabelle nuove e pubblicazione. Guida in docs/NUOVO_GRUPPO.md.
 *
 * Uso:  node scripts/aggiorna_gruppo.mjs
 *
 * Si rifiuta sul sito originale: quello si pubblica SOLO con scripts/pubblica.sh, che fa anche le prove nel browser e il
 * controllo del sito vero.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROGETTO_ORIGINALE, leggiValore } from './gruppo.mjs'

const RADICE = join(fileURLToPath(import.meta.url), '..', '..')

function passo(titolo, comando, argomenti) {
  console.log(`\n=== ${titolo} ===\n`)
  const r = spawnSync(comando, argomenti, { cwd: RADICE, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) {
    console.error(`\nFERMO: "${titolo}" non e' riuscito.`)
    process.exit(1)
  }
}

const nome = leggiValore(readFileSync(join(RADICE, 'wrangler.toml'), 'utf8'), 'name')
if (!nome || nome === PROGETTO_ORIGINALE) {
  console.error(`FERMO: wrangler.toml descrive il sito originale "${PROGETTO_ORIGINALE}", che si pubblica solo con ./scripts/pubblica.sh.
Per il TUO sito, configura prima il progetto con:  node scripts/nuovo_gruppo.mjs`)
  process.exit(1)
}

console.log(`Aggiorno il sito "${nome}".`)
passo('Dipendenze', 'npm', ['ci'])
passo('Build', 'npm', ['run', 'build'])
passo('Test', 'npm', ['test'])
passo('Tabelle nuove del database', 'npx', ['wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote'])
passo('Pubblicazione', 'npx', ['wrangler', 'pages', 'deploy', 'app/dist', '--project-name', nome, '--branch', 'main', '--commit-dirty=true'])
console.log('\nFATTO: sito aggiornato.')
