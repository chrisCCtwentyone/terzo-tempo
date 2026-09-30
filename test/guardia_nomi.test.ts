/**
 * Guardia dei nomi reali (regola del CLAUDE.md: nessun nome reale nei file
 * tracciati da git, nemmeno in un commento o in un test).
 *
 * Se esiste dati/giocatori_reali.tsv (ignorato da git: cognome, iniziali, nota),
 * il test fallisce quando uno di quei cognomi compare in un file tracciato.
 * Senza il file (per esempio in una copia pulita) non c'e' niente da controllare
 * e il test passa: i nomi veri non stanno nel repository, quindi non possono
 * stare nemmeno qui.
 *
 * Se trova un match si correggono i file trovati (negli esempi si usano cognomi
 * inventati: Rossi, Bianchi, Verdi), MAI il test.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RADICE = join(import.meta.dirname, '..');
const ELENCO = join(RADICE, 'dati', 'giocatori_reali.tsv');

/** Cognomi del tsv (prima colonna, senza intestazione), come espressioni con confini di parola. */
export function cognomiReali(testo: string): string[] {
  return testo
    .split(/\r?\n/)
    .slice(1)
    .map((riga) => (riga.split('\t')[0] ?? '').trim())
    .filter((c) => c.length > 0);
}

/** Restituisce "file: cognome" per ogni cognome trovato in un testo (nome del file compreso). */
export function trovaCognomi(percorso: string, contenuto: string, cognomi: string[]): string[] {
  const trovati: string[] = [];
  for (const c of cognomi) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
    if (re.test(percorso) || re.test(contenuto)) trovati.push(`${percorso}: ${c}`);
  }
  return trovati;
}

describe('guardia dei nomi reali', () => {
  it('il rilevatore trova un cognome, con confini di parola e senza badare alle maiuscole', () => {
    expect(trovaCognomi('a.ts', 'il signor ROSSI e Di Marco', ['Rossi', 'Di Marco'])).toHaveLength(2);
    expect(trovaCognomi('a.ts', 'Rossini', ['Rossi'])).toHaveLength(0);
    expect(trovaCognomi('rossi/a.ts', 'niente', ['Rossi'])).toHaveLength(1);
  });

  it.skipIf(!existsSync(ELENCO))('nessun cognome reale (dati/giocatori_reali.tsv) in un file tracciato da git', () => {
    const cognomi = cognomiReali(readFileSync(ELENCO, 'utf8'));
    expect(cognomi.length, 'il file dei giocatori reali e\' vuoto o senza intestazione').toBeGreaterThan(0);
    const file = execFileSync('git', ['ls-files', '-z'], { cwd: RADICE, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0')
      .filter(Boolean);
    const trovati: string[] = [];
    for (const f of file) {
      const p = join(RADICE, f);
      // un file tracciato e poi cancellato dal disco non ha contenuto da leggere, ma il suo nome si controlla
      const contenuto = existsSync(p) ? readFileSync(p, 'utf8') : '';
      for (const t of trovaCognomi(f, contenuto, cognomi)) if (!trovati.includes(t)) trovati.push(t);
    }
    expect(trovati, 'cognomi reali in file tracciati: correggi i FILE, non il test').toEqual([]);
  });
});
