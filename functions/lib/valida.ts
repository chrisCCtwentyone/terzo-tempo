/**
 * Validatori dei campi in ingresso. Ogni errore e' un ErroreApi 400 con il
 * nome del campo: il frontend lo mostra cosi' com'e'.
 */

import { MAX_COGNOME, MAX_INIZIALI, normalizzaCognome, normalizzaIniziali } from '../../shared/nomi';
import { FUSO_ORARIO } from './costanti';
import { ErroreApi } from './risposta';

const KO = (campo: string, cosa: string): never => {
  throw new ErroreApi(400, `${campo}: ${cosa}`);
};

export function intero(v: unknown, campo: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) KO(campo, `intero fra ${min} e ${max}`);
  return v as number;
}

/** Intero, oppure null (o assente = null). */
export function interoOpz(v: unknown, campo: string, min: number, max: number): number | null {
  return v === undefined || v === null ? null : intero(v, campo, min, max);
}

export function numeroOpz(v: unknown, campo: string, min: number, max: number): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) KO(campo, `numero fra ${min} e ${max}`);
  return v as number;
}

export function testo(v: unknown, campo: string, maxLungo: number): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > maxLungo) KO(campo, `testo non vuoto, al massimo ${maxLungo} caratteri`);
  return (v as string).trim();
}

/** Testo, oppure null (assente, null o stringa vuota = null). */
export function testoOpz(v: unknown, campo: string, maxLungo: number): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  return testo(v, campo, maxLungo);
}

export function booleano(v: unknown, campo: string): boolean {
  if (typeof v !== 'boolean') KO(campo, 'true o false');
  return v as boolean;
}

/**
 * Il giocatore si inserisce con due campi (cognome e iniziali del nome) e si salva come
 * "Cognome I." (shared/nomi.ts). La forma e' accettata in modo tollerante ("de luca",
 * "s c", "S.C.") ma il risultato e' sempre quella canonica.
 */
export function cognomeGiocatore(v: unknown): string {
  const c = normalizzaCognome(v);
  if (c === null) KO('cognome', `solo lettere (anche spazi, apostrofi e trattini), al massimo ${MAX_COGNOME} caratteri`);
  return c as string;
}

export function inizialiGiocatore(v: unknown): string {
  const i = normalizzaIniziali(v);
  if (i === null) KO('iniziali', `da 1 a ${MAX_INIZIALI} lettere (es. "M" o "S. C.")`);
  return i as string;
}

/** Ordine alfabetico per COGNOME: il nome e' gia' "Cognome I.", quindi basta il confronto del testo. */
export function perNome(a: string, b: string): number {
  return a.localeCompare(b, 'it');
}

/** Pagella: da 1 a 10, a mezzi punti. */
export function votoPagella(v: unknown): number | null {
  const n = numeroOpz(v, 'voto_pagella', 1, 10);
  if (n !== null && n * 2 !== Math.floor(n * 2)) KO('voto_pagella', 'a mezzi punti (7, 7.5, ...)');
  return n;
}

export function dataYmd(v: unknown, campo: string): string {
  const s = testo(v, campo, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m || !giornoEsiste(+m[1], +m[2], +m[3])) KO(campo, 'data YYYY-MM-DD');
  return s;
}

function giornoEsiste(a: number, m: number, g: number): boolean {
  const d = new Date(Date.UTC(a, m - 1, g));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g;
}

/** Quanto sommare a un istante UTC per avere l'ora di parete a Roma (ms). */
function scostamentoRoma(istante: number): number {
  const parti = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_ORARIO, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(istante));
  const n = (t: string) => Number(parti.find((p) => p.type === t)!.value);
  const parete = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return parete - Math.floor(istante / 1000) * 1000;
}

/** Ora di parete a Roma -> istante UTC (ms). */
export function romaAUtc(a: number, m: number, g: number, h: number, mi: number, s: number): number {
  const parete = Date.UTC(a, m - 1, g, h, mi, s);
  return parete - scostamentoRoma(parete - scostamentoRoma(parete));
}

/**
 * Data e ora di una partita -> ISO UTC "YYYY-MM-DDTHH:MM:SSZ".
 * Con Z o scostamento ("...+02:00") e' un istante preciso; SENZA (es. il
 * "2026-10-01T21:00" di un input datetime-local) e' un orario di Europe/Rome.
 */
export function dataOraUtc(v: unknown, campo = 'data_ora'): string {
  const s = testo(v, campo, 40);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.exec(s);
  if (!m || !giornoEsiste(+m[1], +m[2], +m[3]) || +m[4] > 23 || +m[5] > 59 || +(m[6] ?? 0) > 59) {
    return KO(campo, 'data e ora ISO (es. "2026-10-01T21:00", ora di Roma)');
  }
  const ms = m[7]
    ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}${m[7]}`)
    : romaAUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (Number.isNaN(ms)) KO(campo, 'data e ora non valide');
  return new Date(ms).toISOString().slice(0, 19) + 'Z';
}
