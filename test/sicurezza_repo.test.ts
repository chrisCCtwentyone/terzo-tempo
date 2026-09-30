/**
 * Repository PUBBLICO: nessun dato personale, nessun segreto, ne' nei file tracciati ne' in TUTTA la storia
 * dei commit (`git log --all -p`): da una storia pubblicata un dato non si toglie piu'.
 * Cerca: email vere (quelle di dati/email_admin.txt se c'e', e qualunque indirizzo non di prova), token
 * (cfut_, cfat_, chiavi private), cognomi reali (dati/giocatori_reali.tsv). I messaggi di errore dicono
 * DOVE, mai COSA (i log non devono ripetere il dato).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cognomiReali, trovaCognomi } from './guardia_nomi.test';

const RADICE = join(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: RADICE, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const haGit = existsSync(join(RADICE, '.git'));

/** Domini ammessi negli esempi: riservati (RFC 2606) o di servizi. */
const AMMESSI = /^(noreply@(github|anthropic)\.com|[^@]+@([^@]*\.)?invalid|[^@]+@example\.(org|com|net)|[^@]+@users\.noreply\.github\.com)$/i;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const SEGRETI: [string, RegExp][] = [
  ['token Cloudflare cfut_', /\bcfut_[A-Za-z0-9]{10,}/],
  ['token Cloudflare cfat_', /\bcfat_[A-Za-z0-9]{10,}/],
  ['chiave privata', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['token GitHub', /\bgh[pousr]_[A-Za-z0-9]{20,}/],
  ['token Anthropic/OpenAI', /\bsk-(ant-)?[A-Za-z0-9_-]{20,}/],
  ['chiave AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['Bearer con valore', /Bearer\s+[A-Za-z0-9._-]{30,}/],
  ['JWT intero', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];

function emailReali(): string[] {
  const p = join(RADICE, 'dati', 'email_admin.txt');
  return existsSync(p) ? readFileSync(p, 'utf8').split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@')) : [];
}

/** Cerca nei testi `contenuti` (nome -> testo). Restituisce solo "dove: cosa-e'" senza mai riportare il dato. */
function cerca(contenuti: Iterable<[string, string]>): string[] {
  const reali = emailReali();
  const trovati: string[] = [];
  for (const [dove, testo] of contenuti) {
    for (const m of testo.matchAll(EMAIL)) {
      if (!AMMESSI.test(m[0])) trovati.push(`${dove}: indirizzo email non di prova`);
      if (reali.includes(m[0].toLowerCase())) trovati.push(`${dove}: EMAIL REALE DI UN ADMIN`);
    }
    for (const [nome, re] of SEGRETI) if (re.test(testo)) trovati.push(`${dove}: ${nome}`);
  }
  return [...new Set(trovati)];
}

describe('il rilevatore funziona', () => {
  // Gli esempi si costruiscono a runtime: questo file e' tracciato e deve passare a sua volta la scansione.
  const at = '@';
  const jwt = ['eyJhbGciOiJSUzI1NiJ9', 'eyJlbWFpbCI6InhAeC5pdCJ9', 'c2lnbmF0dXJhc2lnbmF0dXJh'].join('.');
  it('trova un token e un\'email vera, ignora quelle di prova', () => {
    expect(cerca([['a', 'cfut' + '_' + 'A'.repeat(40)]])).toHaveLength(1);
    expect(cerca([['a', `scrivi a mario.rossi${at}gmail.com`]])).toHaveLength(1);
    expect(cerca([['a', `admin${at}prova.invalid e a${at}example.org e noreply${at}github.com e 1+x${at}users.noreply.github.com`]])).toHaveLength(0);
    expect(cerca([['a', `x${at}github.com y${at}anthropic.com`]])).toHaveLength(1); // un solo "dove", due indirizzi
    expect(cerca([['a', jwt]])).toHaveLength(1);
  });
});

describe.skipIf(!haGit)('file tracciati', () => {
  it('nessuna email vera e nessun segreto nei file di oggi', () => {
    const file = git('ls-files', '-z').split('\0').filter(Boolean).filter((f) => !/\.(png|jpg|woff2?|ico|lock)$/.test(f) && f !== 'package-lock.json');
    const contenuti: [string, string][] = file.filter((f) => existsSync(join(RADICE, f))).map((f) => [f, readFileSync(join(RADICE, f), 'utf8')]);
    expect(cerca(contenuti)).toEqual([]);
  });
});

describe.skipIf(!haGit)('tutta la storia dei commit (git log --all -p)', () => {
  // Escluso il file di questo test: nella sua PRIMA versione (gia' pubblicata) gli esempi del rilevatore erano scritti in chiaro
  // (un'email e un token inventati); da adesso si costruiscono a runtime e il file passa la scansione dei file di oggi.
  const storia = haGit ? git('log', '--all', '-p', '--no-color', '--format=%H%n%an <%ae>%n%cn <%ce>%n%B', '--', '.', ':(exclude)package-lock.json', ':(exclude)test/sicurezza_repo.test.ts') : '';

  it('la storia c\'e\' (il controllo non e\' vuoto)', () => {
    expect(storia.length).toBeGreaterThan(1000);
  });

  it('nessuna email vera, nessun segreto', () => {
    expect(cerca([['storia', storia]])).toEqual([]);
  });

  const elenco = join(RADICE, 'dati', 'giocatori_reali.tsv');
  it.skipIf(!existsSync(elenco))('nessun cognome reale (dati/giocatori_reali.tsv)', () => {
    const cognomi = cognomiReali(readFileSync(elenco, 'utf8'));
    expect(cognomi.length).toBeGreaterThan(0);
    // non si stampa il cognome trovato: solo quanti
    const n = trovaCognomi('storia', storia, cognomi).length;
    expect(n, 'cognomi reali nella storia dei commit (riscrivere la storia PRIMA di pubblicare)').toBe(0);
  });

  it('gli autori dei commit non espongono un\'email personale', () => {
    const autori = git('log', '--all', '--format=%ae%n%ce').split('\n').filter(Boolean);
    for (const a of new Set(autori)) expect(AMMESSI.test(a), 'un commit ha un\'email d\'autore personale').toBe(true);
  });
});
