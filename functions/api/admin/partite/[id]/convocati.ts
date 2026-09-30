/**
 * PUT /api/admin/partite/:id/convocati
 *   { convocati: [ { giocatore_id, squadra?: "A"|"B"|null, pos_x?, pos_y? (0-100, insieme),
 *                    gol?, autogol?, voto_pagella? (1-10 a mezzi punti) }, ... ] }
 * SOSTITUISCE tutto l'elenco: si manda sempre per intero. Copre convocati, squadre,
 * posizioni delle pedine, gol, autogol e pagelle. Risposta: dettaglio + `avvisi`.
 */
import { avvisiCoerenza, controllaGiocabile, type Convocato } from '../../../../lib/admin';
import { CODICI_SQUADRA } from '../../../../lib/costanti';
import { caricaPartita } from '../../../../lib/mvp';
import { dettaglio } from '../../../../lib/partite';
import { ErroreApi, idDa, json, leggiOggetto, perMetodo } from '../../../../lib/risposta';
import { intero, numeroOpz, votoPagella } from '../../../../lib/valida';

function leggiConvocato(v: unknown): Convocato {
  if (!v || typeof v !== 'object') throw new ErroreApi(400, 'convocati: ogni elemento e\' un oggetto');
  const c = v as Record<string, unknown>;
  const squadra = c.squadra ?? null;
  if (squadra !== null && !CODICI_SQUADRA.includes(squadra as never)) throw new ErroreApi(400, `squadra: ${CODICI_SQUADRA.join(', ')} o null`);
  const x = numeroOpz(c.pos_x, 'pos_x', 0, 100);
  const y = numeroOpz(c.pos_y, 'pos_y', 0, 100);
  if ((x === null) !== (y === null)) throw new ErroreApi(400, 'pos_x e pos_y vanno dati insieme');
  return {
    giocatore_id: intero(c.giocatore_id, 'giocatore_id', 1, Number.MAX_SAFE_INTEGER),
    squadra: squadra as Convocato['squadra'],
    pos_x: x,
    pos_y: y,
    gol: c.gol === undefined ? 0 : intero(c.gol, 'gol', 0, 99),
    autogol: c.autogol === undefined ? 0 : intero(c.autogol, 'autogol', 0, 99),
    voto_pagella: votoPagella(c.voto_pagella),
  };
}

export const onRequest = perMetodo({
  PUT: async ({ env, request, params }) => {
    const id = idDa(params.id);
    const c = await leggiOggetto(request);
    if (!Array.isArray(c.convocati)) throw new ErroreApi(400, 'convocati: elenco');
    const righe = c.convocati.map(leggiConvocato);
    if (new Set(righe.map((r) => r.giocatore_id)).size !== righe.length) throw new ErroreApi(400, 'convocati: giocatori ripetuti');
    const p = await caricaPartita(env.DB, id);
    if (!p) throw new ErroreApi(404, 'partita non trovata');
    if (p.stato === 'giocata') controllaGiocabile(righe);

    try {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM partecipazioni WHERE partita_id = ?').bind(id),
        ...righe.map((r) =>
          env.DB
            .prepare('INSERT INTO partecipazioni (partita_id, giocatore_id, squadra, pos_x, pos_y, gol, autogol, voto_pagella) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(id, r.giocatore_id, r.squadra, r.pos_x, r.pos_y, r.gol, r.autogol, r.voto_pagella),
        ),
      ]);
    } catch (e) {
      if (e instanceof Error && e.message.includes('FOREIGN KEY')) throw new ErroreApi(400, 'convocati: un giocatore non esiste');
      throw e;
    }
    return json({
      ...(await dettaglio(env.DB, id, null, Date.now())),
      avvisi: p.stato === 'giocata' ? avvisiCoerenza(p.gol_a!, p.gol_b!, righe) : [],
    });
  },
});
