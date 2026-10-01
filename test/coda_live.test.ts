/** La coda locale della schermata LIVE: logica pura (app/src/admin/coda_live.ts), senza browser. */
import { describe, expect, it } from 'vitest';
import { applicaCoda, attesaMs, beneficiaria, chiaveCoda, esitoInvio, leggiCoda, nuovaVoce, nuovoId, punteggio, richiesta, scriviCoda, togliDipendenti, type Giocatori, type VoceCoda } from '../app/src/admin/coda_live';
import type { EventoDiretta } from '../app/src/lib/tipi';
import { idClient } from '../functions/lib/diretta';

const SQUADRE: Record<number, 'A' | 'B'> = { 1: 'A', 2: 'A', 3: 'B', 4: 'B' };
const NOMI: Record<number, string> = { 1: 'Rossi M.', 2: 'Bianchi L.', 3: 'Verdi A.G.', 4: 'Neri P.' };
const g: Giocatori = { squadraDi: (id) => SQUADRE[id] ?? null, nomeDi: (id) => NOMI[id] ?? '?' };
const ev = (id: number, id_client: string, tipo: 'gol' | 'autogol', giocatore_id: number): EventoDiretta => ({
  id, id_client, tipo, autogol: tipo === 'autogol', squadra: beneficiaria(tipo, SQUADRE[giocatore_id]), giocatore_id, nome: NOMI[giocatore_id],
});
const vc = (a: Parameters<typeof nuovaVoce>[0]) => nuovaVoce(a, 1000);

/** Un deposito finto, con un guasto a richiesta. */
const deposito = (guasto = false) => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => (guasto ? (() => { throw new Error('bloccato'); })() : (m.get(k) ?? null)),
    setItem: (k: string, v: string) => (guasto ? (() => { throw new Error('pieno'); })() : void m.set(k, v)),
    removeItem: (k: string) => void m.delete(k),
  };
};

describe('stato mostrato = server + coda', () => {
  it('con la coda vuota e\' esattamente lo stato del server', () => {
    const server = [ev(1, 'aaaaaaaa-1', 'gol', 1), ev(2, 'aaaaaaaa-2', 'autogol', 3)];
    const v = applicaCoda(server, [], g);
    expect(v.map((e) => [e.chiave, e.giocatore_id, e.squadra, e.inInvio])).toEqual([['aaaaaaaa-1', 1, 'A', false], ['aaaaaaaa-2', 3, 'A', false]]);
    expect(punteggio(v)).toEqual({ A: 2, B: 0 });
  });

  it('un gol in coda compare subito, "in invio", con la squadra beneficiaria (autogol: gli avversari)', () => {
    const v = applicaCoda([], [vc({ k: 'segna', id_client: 'bbbbbbbb-1', tipo: 'gol', giocatore_id: 1 }), vc({ k: 'segna', id_client: 'bbbbbbbb-2', tipo: 'autogol', giocatore_id: 1 })], g);
    expect(v.map((e) => [e.nome, e.squadra, e.tipo, e.inInvio])).toEqual([['Rossi M.', 'A', 'gol', true], ['Rossi M.', 'B', 'autogol', true]]);
    expect(punteggio(v)).toEqual({ A: 1, B: 1 });
  });

  it('un gol gia\' arrivato al server e ancora in coda (risposta non tornata) compare UNA volta sola', () => {
    const v = applicaCoda([ev(7, 'cccccccc-1', 'gol', 1)], [vc({ k: 'segna', id_client: 'cccccccc-1', tipo: 'gol', giocatore_id: 1 })], g);
    expect(v).toHaveLength(1);
    expect(punteggio(v)).toEqual({ A: 1, B: 0 });
  });

  it('cambia ed elimina in coda si applicano nell\'ordine; un gol eliminato prima di partire sparisce', () => {
    const server = [ev(1, 'dddddddd-1', 'gol', 1), ev(2, 'dddddddd-2', 'gol', 3)];
    const v = applicaCoda(server, [
      vc({ k: 'cambia', id_client: 'dddddddd-1', giocatore_id: 4 }),
      vc({ k: 'cambia', id_client: 'dddddddd-2', tipo: 'autogol' }),
      vc({ k: 'segna', id_client: 'dddddddd-3', tipo: 'gol', giocatore_id: 2 }),
      vc({ k: 'elimina', id_client: 'dddddddd-3' }),
    ], g);
    expect(v.map((e) => [e.giocatore_id, e.tipo, e.squadra, e.inInvio])).toEqual([[4, 'gol', 'B', true], [3, 'autogol', 'A', true]]);
  });

  it('le voci rifiutate dal server non si applicano', () => {
    const rifiutata: VoceCoda = { ...vc({ k: 'segna', id_client: 'eeeeeeee-1', tipo: 'gol', giocatore_id: 1 }), errore: 'la diretta è finita' };
    expect(applicaCoda([], [rifiutata], g)).toEqual([]);
  });

  it('un giocatore sconosciuto (non in campo) non crea un gol fantasma', () => {
    expect(applicaCoda([], [vc({ k: 'segna', id_client: 'ffffffff-1', tipo: 'gol', giocatore_id: 99 })], g)).toEqual([]);
  });
});

describe('esito dell\'invio: cosa si ritenta e cosa no', () => {
  it('rete assente e guasti del server: si riprova', () => {
    for (const s of [0, 408, 425, 429, 500, 502, 503, 522]) expect(esitoInvio('segna', s, false), String(s)).toBe('riprova');
  });
  it('sessione scaduta: serve ricaricare (non si martella il server)', () => {
    expect(esitoInvio('segna', 401, false)).toBe('accesso');
    expect(esitoInvio('segna', 403, false)).toBe('accesso');
    expect(esitoInvio('segna', 0, true)).toBe('accesso');
  });
  it('il server dice no (partita chiusa, giocatore non in campo, id non valido): rifiutata, MAI ritentata', () => {
    for (const s of [400, 404, 409, 413, 415]) expect(esitoInvio('segna', s, false), String(s)).toBe('rifiutata');
    expect(esitoInvio('cambia', 404, false)).toBe('rifiutata');
  });
  it('eliminare un gol che non c\'e\' piu\' (404) e\' gia\' fatto', () => {
    expect(esitoInvio('elimina', 404, false)).toBe('fatto');
    expect(esitoInvio('elimina', 409, false)).toBe('rifiutata');
  });
  it('attesa crescente: 1,5 s, 3 s, 6 s... al massimo 30 s', () => {
    expect([1, 2, 3, 4, 5, 6].map(attesaMs)).toEqual([1500, 3000, 6000, 12000, 24000, 30000]);
    expect(attesaMs(40)).toBe(30000);
  });
  it('un gol rifiutato porta via le altre voci sullo stesso gol, e solo quelle', () => {
    const a = vc({ k: 'segna', id_client: 'gggggggg-1', tipo: 'gol', giocatore_id: 1 });
    const b = vc({ k: 'cambia', id_client: 'gggggggg-1', tipo: 'autogol' });
    const c = vc({ k: 'segna', id_client: 'gggggggg-2', tipo: 'gol', giocatore_id: 2 });
    expect(togliDipendenti([a, b, c], a).map((v) => v.aid)).toEqual([a.aid, c.aid]);
    expect(togliDipendenti([a, b, c], b)).toHaveLength(3); // un "cambia" rifiutato non toglie niente
  });
});

describe('richieste HTTP', () => {
  it('segna = POST con l\'id_client; cambia e elimina indicano il gol per id_client', () => {
    expect(richiesta(5, { k: 'segna', id_client: 'hhhhhhhh-1', tipo: 'autogol', giocatore_id: 3 })).toEqual({ metodo: 'POST', percorso: '/api/admin/partite/5/diretta/eventi', corpo: { id_client: 'hhhhhhhh-1', tipo: 'autogol', giocatore_id: 3 } });
    expect(richiesta(5, { k: 'cambia', id_client: 'hhhhhhhh-1', giocatore_id: 2 })).toEqual({ metodo: 'PATCH', percorso: '/api/admin/partite/5/diretta/eventi/hhhhhhhh-1', corpo: { giocatore_id: 2 } });
    expect(richiesta(5, { k: 'elimina', id_client: 'hhhhhhhh-1' })).toEqual({ metodo: 'DELETE', percorso: '/api/admin/partite/5/diretta/eventi/hhhhhhhh-1' });
  });
  it('gli identificativi generati sono accettati dal server (UUID, mai di sole cifre)', () => {
    for (let i = 0; i < 50; i++) expect(() => idClient(nuovoId())).not.toThrow();
    expect(new Set(Array.from({ length: 200 }, nuovoId)).size).toBe(200);
  });
});

describe('persistenza sul telefono (localStorage)', () => {
  const chiave = chiaveCoda(12);
  const voci = [vc({ k: 'segna', id_client: 'iiiiiiii-1', tipo: 'gol', giocatore_id: 1 }), vc({ k: 'cambia', id_client: 'iiiiiiii-1', tipo: 'autogol' }), vc({ k: 'elimina', id_client: 'iiiiiiii-2' })];

  it('la coda scritta si rilegge uguale (ricarica della pagina, app chiusa e riaperta)', () => {
    const d = deposito();
    expect(scriviCoda(d, chiave, voci)).toBe(true);
    const lette = leggiCoda(d, chiave);
    expect(lette.map(({ prossimo: _p, ...r }) => r)).toEqual(voci.map(({ prossimo: _p, ...r }) => r));
    expect(lette.every((v) => v.prossimo === 0)).toBe(true); // all'apertura si prova subito
  });
  it('una coda vuota toglie la chiave; la coda di una partita non tocca quella di un\'altra', () => {
    const d = deposito();
    scriviCoda(d, chiave, voci);
    scriviCoda(d, chiaveCoda(13), [voci[0]]);
    scriviCoda(d, chiave, []);
    expect(d.m.has(chiave)).toBe(false);
    expect(leggiCoda(d, chiaveCoda(13))).toHaveLength(1);
  });
  it('mantiene l\'errore di una voce rifiutata (non si ritenta dopo la ricarica)', () => {
    const d = deposito();
    scriviCoda(d, chiave, [{ ...voci[0], errore: 'la diretta è finita' }]);
    expect(leggiCoda(d, chiave)[0].errore).toBe('la diretta è finita');
  });
  it('contenuto rovinato o manomesso: scartato, mai un crash', () => {
    const d = deposito();
    for (const grezzo of ['', 'non json', '{}', '"x"', 'null', '[1, "a", null]', JSON.stringify([{ k: 'segna', aid: 'corto', id_client: 'iiiiiiii-1', creata: 1, tipo: 'gol', giocatore_id: 1 }]), JSON.stringify([{ k: 'segna', aid: 'aaaaaaaa-1', id_client: 'iiiiiiii-1', creata: 1, tipo: 'rigore', giocatore_id: 1 }]), JSON.stringify([{ k: 'segna', aid: 'aaaaaaaa-1', id_client: 'iiiiiiii-1', creata: 1, tipo: 'gol', giocatore_id: -3 }]), JSON.stringify([{ k: 'cambia', aid: 'aaaaaaaa-1', id_client: 'iiiiiiii-1', creata: 1 }]), JSON.stringify([{ k: 'boh', aid: 'aaaaaaaa-1', id_client: 'iiiiiiii-1', creata: 1 }])]) {
      d.m.set(chiave, grezzo);
      expect(leggiCoda(d, chiave), grezzo).toEqual([]);
    }
  });
  it('senza localStorage o con il deposito che lancia: coda vuota in lettura, false in scrittura, nessuna eccezione', () => {
    expect(leggiCoda(null, chiave)).toEqual([]);
    expect(scriviCoda(null, chiave, voci)).toBe(false);
    expect(leggiCoda(deposito(true), chiave)).toEqual([]);
    expect(scriviCoda(deposito(true), chiave, voci)).toBe(false);
  });
});
