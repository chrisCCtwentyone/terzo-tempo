/**
 * Un D1 finto costruito su `node:sqlite` (Node 22+): applica le migrazioni VERE
 * di migrations/ e implementa la parte di interfaccia D1 usata dal backend
 * (prepare/bind/first/all/run/batch). Cosi' i test provano SQL, vincoli e
 * schema veri, non oggetti in memoria.
 */

import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RADICE = join(import.meta.dirname, '..');

class Preparata {
  db: DatabaseSync;
  sql: string;
  valori: unknown[];

  constructor(db: DatabaseSync, sql: string, valori: unknown[] = []) {
    this.db = db;
    this.sql = sql;
    this.valori = valori;
  }

  bind(...valori: unknown[]): Preparata {
    return new Preparata(this.db, this.sql, valori);
  }

  async first<T>(): Promise<T | null> {
    return ((this.db.prepare(this.sql).all(...(this.valori as never[])) as T[])[0]) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    return { results: this.db.prepare(this.sql).all(...(this.valori as never[])) as T[], success: true };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    return { success: true, meta: { changes: Number(this.eseguiSincrono().changes) } };
  }

  /** usata da batch() */
  eseguiSincrono() {
    return this.db.prepare(this.sql).run(...(this.valori as never[]));
  }
}

export class D1Finto {
  readonly db: DatabaseSync;

  constructor(conSeed = false) {
    this.db = new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys = ON;');
    const cartella = join(RADICE, 'migrations');
    for (const nome of readdirSync(cartella).filter((n) => n.endsWith('.sql')).sort()) {
      this.db.exec(readFileSync(join(cartella, nome), 'utf8'));
    }
    if (conSeed) this.db.exec(readFileSync(join(RADICE, 'scripts', 'seed_prova.sql'), 'utf8'));
  }

  prepare(sql: string): Preparata {
    return new Preparata(this.db, sql);
  }

  /** Come D1: il batch e' una transazione, o tutto o niente. */
  async batch(istruzioni: Preparata[]): Promise<{ success: true }[]> {
    this.db.exec('BEGIN');
    try {
      for (const i of istruzioni) i.eseguiSincrono();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return istruzioni.map(() => ({ success: true as const }));
  }

  /** Scorciatoie per i test: SQL diretto. */
  tutti<T = Record<string, unknown>>(sql: string, ...valori: unknown[]): T[] {
    return this.db.prepare(sql).all(...(valori as never[])) as T[];
  }
  esegui(sql: string, ...valori: unknown[]): void {
    this.db.prepare(sql).run(...(valori as never[]));
  }
}
