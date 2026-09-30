/**
 * REGOLA DI SICUREZZA (CLAUDE.md): il livello segreto non deve MAI comparire in
 * una risposta pubblica, nemmeno come campo nullo. Questo test chiama TUTTI gli
 * endpoint pubblici (l'elenco e' verificato contro i file di functions/api/) e
 * fallisce se la stringa "livello" compare nel corpo o nelle intestazioni.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1Finto } from './d1_finto';
import { ENV_BYPASS, ROTTE_PUBBLICHE, chiama, rottaDi } from './rotte';

type Richiesta = [metodo: string, percorso: string, corpo?: unknown];

/** Per ogni rotta pubblica: le richieste da fare (successi ed errori). Dati: scripts/seed_prova.sql. */
const RICHIESTE: Record<string, Richiesta[]> = {
  '/api/home': [['GET', '/api/home']],
  '/api/stagioni': [['GET', '/api/stagioni']],
  '/api/classifiche': [['GET', '/api/classifiche'], ['GET', '/api/classifiche?stagione=sempre'], ['GET', '/api/classifiche?stagione=2'], ['GET', '/api/classifiche?stagione=1'], ['GET', '/api/classifiche?stagione=99']],
  '/api/partite': [['GET', '/api/partite'], ['GET', '/api/partite?stagione=2']],
  '/api/partite/:id': [['GET', '/api/partite/1'], ['GET', '/api/partite/10'], ['GET', '/api/partite/11'], ['GET', '/api/partite/12'], ['GET', '/api/partite/999'], ['GET', '/api/partite/abc']],
  '/api/partite/:id/mvp': [
    ['GET', '/api/partite/10/mvp'], ['GET', '/api/partite/12/mvp'], ['GET', '/api/partite/999/mvp'],
    ['POST', '/api/partite/12/mvp', { giocatore_id: 1 }], // voto valido (la partita 12 e' aperta: vedi beforeEach)
    ['POST', '/api/partite/12/mvp', { giocatore_id: 1 }], // 409 doppio voto
    ['POST', '/api/partite/10/mvp', { giocatore_id: 1 }], // 409 chiusa
    ['POST', '/api/partite/12/mvp', { giocatore_id: 999 }], // 400
  ],
  '/api/giocatori': [['GET', '/api/giocatori'], ['GET', '/api/giocatori?tutti=1']],
  '/api/giocatori/:id': [['GET', '/api/giocatori/1'], ['GET', '/api/giocatori/14'], ['GET', '/api/giocatori/16?stagione=2'], ['GET', '/api/giocatori/1?stagione=sempre'], ['GET', '/api/giocatori/999']],
};

let db: D1Finto;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-09-30T20:00:00Z'));
  db = new D1Finto(true);
  // una partita con la votazione davvero aperta (giocata poche ore fa)
  db.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b) VALUES (12, 2, '2026-09-30T19:00:00Z', 'giocata', 1, 0)");
  db.esegui("INSERT INTO partecipazioni (partita_id, giocatore_id, squadra, gol) VALUES (12, 1, 'A', 1), (12, 2, 'B', 0)");
});
afterEach(() => vi.useRealTimers());

describe('nessun endpoint pubblico mostra il livello', () => {
  it('l\'elenco delle richieste copre TUTTE le rotte pubbliche, e solo quelle', () => {
    expect(Object.keys(RICHIESTE).sort()).toEqual(ROTTE_PUBBLICHE.map(rottaDi).sort());
  });

  it('il seed ha davvero dei livelli da nascondere (il test non e\' vuoto)', () => {
    const conLivello = db.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM giocatori WHERE livello_segreto IS NOT NULL')[0].n;
    expect(conLivello).toBeGreaterThan(5);
  });

  for (const [rotta, richieste] of Object.entries(RICHIESTE)) {
    it(rotta, async () => {
      // un solo "telefono" per rotta: cosi' il doppio voto e' davvero un doppio voto
      let cookie: string | undefined;
      for (const [metodo, percorso, corpo] of richieste) {
        const r = await chiama(db, metodo, percorso, { corpo, cookie });
        cookie = r.headers.get('Set-Cookie')?.split(';')[0] ?? cookie;
        const intestazioni = [...r.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');
        expect(r.testo, `${metodo} ${percorso}`).not.toMatch(/livello/i);
        expect(intestazioni, `${metodo} ${percorso}`).not.toMatch(/livello/i);
        expect(r.stato, `${metodo} ${percorso}`).toBeLessThan(500);
      }
    });
  }

  it('un percorso /api sconosciuto non risponde con la pagina dell\'app', async () => {
    const r = await chiama(db, 'GET', '/api/non-esiste');
    expect(r.stato).toBe(404);
    expect(r.testo).not.toMatch(/livello/i);
  });

  it('controprova: l\'admin invece il livello lo vede', async () => {
    const r = await chiama(db, 'GET', '/api/admin/giocatori', { env: ENV_BYPASS, locale: true });
    expect(r.stato).toBe(200);
    expect(r.json.giocatori.find((g: any) => g.nome === 'Rossi M.').livello_segreto).toBe(5);
  });
});
