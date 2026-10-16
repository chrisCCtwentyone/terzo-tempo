/** Funzioni di scripts/gruppo.mjs: la configurazione di un Terzo Tempo per un gruppo nuovo (docs/NUOVO_GRUPPO.md). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CHIAVI_GRUPPO, PROGETTO_ORIGINALE, databaseDaJson, elencoEmail, impostaValore, indirizzoPagesDev, leggiValore, nomeValido,
  normalizzaAud, normalizzaTeamDomain, sitoOriginaleSuQuestoAccount,
} from '../scripts/gruppo.mjs';

const TOML = readFileSync(join(import.meta.dirname, '..', 'wrangler.toml'), 'utf8');
const AUD = 'a'.repeat(64);
const ID = '11111111-2222-3333-4444-555555555555';

describe('wrangler.toml del repository', () => {
  it('ha UNA riga per ogni valore che cambia da un gruppo all\'altro, e il nome e\' quello del sito originale', () => {
    for (const chiave of CHIAVI_GRUPPO) expect(impostaValore(TOML, chiave, 'x'), chiave).toContain(`${chiave} = "x"`);
    expect(leggiValore(TOML, 'name')).toBe(PROGETTO_ORIGINALE);
  });

  it('riscrivere tutti i valori cambia solo quelle righe: commenti, binding e opzioni restano', () => {
    let nuovo = TOML;
    const valori: Record<string, string> = { name: 'calcetto', database_name: 'calcetto', database_id: ID, ACCESS_TEAM_DOMAIN: 'altro.cloudflareaccess.com', ACCESS_AUD: AUD };
    for (const [k, v] of Object.entries(valori)) nuovo = impostaValore(nuovo, k, v);
    for (const [k, v] of Object.entries(valori)) expect(leggiValore(nuovo, k)).toBe(v);
    const righeCambiate = TOML.split('\n').filter((r, i) => r !== nuovo.split('\n')[i]);
    expect(righeCambiate).toHaveLength(CHIAVI_GRUPPO.length);
    expect(nuovo.split('\n')).toHaveLength(TOML.split('\n').length);
    expect(nuovo).toContain('binding = "DB"');
    expect(nuovo).toContain('pages_build_output_dir = "app/dist"');
  });
});

describe('impostaValore', () => {
  it('rifiuta chiavi non previste, valori che romperebbero il file e righe doppie o mancanti', () => {
    expect(() => impostaValore(TOML, 'compatibility_date', 'x')).toThrow();
    expect(() => impostaValore(TOML, 'name', 'a"b')).toThrow();
    expect(() => impostaValore(TOML, 'name', 'a\nb')).toThrow();
    expect(() => impostaValore('name = "a"\nname = "b"\n', 'name', 'c')).toThrow();
    expect(() => impostaValore('# name = "a"\n', 'name', 'c')).toThrow();
  });

  it('ignora le righe di commento', () => {
    expect(impostaValore('# name = "a"\nname = "b"\n', 'name', 'c')).toBe('# name = "a"\nname = "c"\n');
    expect(leggiValore('# name = "a"\n', 'name')).toBeNull();
  });
});

describe('validazioni delle risposte', () => {
  it('nome del progetto', () => {
    for (const ok of ['calcetto', 'calcetto-giovedi', 'a', 'tt2']) expect(nomeValido(ok), ok).toBe(true);
    for (const no of ['', 'Calcetto', '-calcetto', 'calcetto-', 'cal cetto', 'calcetto_1', 'a'.repeat(59)]) expect(nomeValido(no), no).toBe(false);
  });

  it('team domain di Zero Trust', () => {
    expect(normalizzaTeamDomain(' https://Gruppo.cloudflareaccess.com/ ')).toBe('gruppo.cloudflareaccess.com');
    expect(normalizzaTeamDomain('gruppo.cloudflareaccess.com')).toBe('gruppo.cloudflareaccess.com');
    for (const no of ['', 'gruppo', 'gruppo.cloudflareaccess.com.evil.example', 'evil.example/gruppo.cloudflareaccess.com']) expect(normalizzaTeamDomain(no), no).toBeNull();
  });

  it('AUD Tag', () => {
    expect(normalizzaAud(` ${'A'.repeat(64)} `)).toBe(AUD);
    for (const no of ['', 'a'.repeat(63), 'g'.repeat(64)]) expect(normalizzaAud(no), no).toBeNull();
  });

  it('email degli admin: minuscole, senza doppioni, separate come capita', () => {
    expect(elencoEmail('M.Rossi@example.com, l.bianchi@example.com;m.rossi@example.com\nverdi@example.org')).toEqual({ email: ['m.rossi@example.com', 'l.bianchi@example.com', 'verdi@example.org'] });
    expect(elencoEmail(' , ').errore).toBeTruthy();
    expect(elencoEmail('rossi@example.com, bianchi').errore).toContain('bianchi');
  });
});

describe('uscite di wrangler', () => {
  it('indirizzo del sito dopo la creazione del progetto, anche con il suffisso', () => {
    expect(indirizzoPagesDev("Successfully created the 'calcetto' project. It will be available at https://calcetto-3x9.pages.dev/ once you create your first deployment.")).toBe('calcetto-3x9.pages.dev');
    expect(indirizzoPagesDev('errore')).toBeNull();
  });

  it('elenco dei database, anche con un avviso prima del JSON', () => {
    const uscita = `▲ [WARNING] qualcosa\n[{"uuid":"${ID}","name":"calcetto","version":"production"}]`;
    expect(databaseDaJson(uscita)).toEqual([{ uuid: ID, name: 'calcetto', version: 'production' }]);
    expect(databaseDaJson('niente')).toBeNull();
    expect(databaseDaJson('[non json')).toBeNull();
  });
});

describe('protezione del sito originale', () => {
  const idOriginale = leggiValore(TOML, 'database_id')!;

  it('sull\'account che ha gia\' il database del sito originale lo script si ferma', () => {
    expect(sitoOriginaleSuQuestoAccount(TOML, [{ uuid: idOriginale, name: PROGETTO_ORIGINALE }])).toBe(true);
  });

  it('su un altro account si parte; un gruppo nuovo avviato a meta\' puo\' ripartire', () => {
    expect(sitoOriginaleSuQuestoAccount(TOML, [])).toBe(false);
    expect(sitoOriginaleSuQuestoAccount(TOML, [{ uuid: ID, name: 'altro' }])).toBe(false);
    const avviato = impostaValore(impostaValore(TOML, 'name', 'calcetto'), 'database_id', ID);
    expect(sitoOriginaleSuQuestoAccount(avviato, [{ uuid: ID, name: 'calcetto' }])).toBe(false);
  });
});
