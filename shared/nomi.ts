/**
 * Nomi dei giocatori, in UN punto (backend, frontend e test).
 *
 * Il nome si mostra ovunque come "Cognome I." con le iniziali attaccate e
 * il punto: "Rossi M.", "Rossi S.C.", "De Luca V." (decisione dell'utente,
 * 30/09/2026). Le iniziali sono FACOLTATIVE: alcuni giocatori veri hanno solo un
 * nome ("Gianni", "Amico Gianni") e allora si mostra il solo nome scritto.
 * Nel DB `nome` e' la composizione, scritta solo dal server con `componiNome`.
 */

export const MAX_COGNOME = 40;
export const MAX_INIZIALI = 3;

/** Prima lettera maiuscola; una parola tutta maiuscola ("ROSSI") diventa "Rossi". */
function parola(p: string): string {
  const base = p.length > 1 && p === p.toUpperCase() ? p.toLowerCase() : p;
  return base.replace(/(^|['’\-])(\p{L})/gu, (_, prima: string, l: string) => prima + l.toUpperCase());
}

/** Cognome normalizzato ("de  luca" -> "De Luca"), o null se non e' un cognome valido. */
export function normalizzaCognome(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim().split(/\s+/).map(parola).join(' ');
  return c.length > 0 && c.length <= MAX_COGNOME && /^\p{L}[\p{L}'’\- ]*$/u.test(c) ? c : null;
}

/** Iniziali normalizzate: "s c", "S.C.", "sc" -> "S.C."; null se non sono da 1 a 3 lettere. */
export function normalizzaIniziali(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const lettere = v.replace(/[.\s]/g, '');
  if (!/^\p{L}+$/u.test(lettere) || [...lettere].length > MAX_INIZIALI) return null;
  return [...lettere].map((l) => `${l.toUpperCase()}.`).join('');
}

/** Iniziali facoltative: vuote/assenti/null = nessuna (""); non vuote e non valide = null. */
export function normalizzaInizialiOpz(v: unknown): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return '';
  return normalizzaIniziali(v);
}

/** "Rossi" + "M." -> "Rossi M."; senza iniziali resta il solo nome ("Gianni"). */
export const componiNome = (cognome: string, iniziali: string) => (iniziali ? `${cognome} ${iniziali}` : cognome);

/** "De Luca V." -> { cognome: "De Luca", iniziali: "V." }. Un nome di altra forma resta tutto cognome. */
export function dividiNome(nome: string): { cognome: string; iniziali: string } {
  const m = /^(.*\S)\s+((?:\p{Lu}\.)+)$/u.exec(nome.trim());
  return m ? { cognome: m[1], iniziali: m[2] } : { cognome: nome.trim(), iniziali: '' };
}
