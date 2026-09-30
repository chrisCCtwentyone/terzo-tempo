/** GET /api/home: ultima partita, prossima con convocati, top marcatori della stagione aperta. */
import { TOP_MARCATORI_HOME } from '../lib/costanti';
import { hashDelDispositivo } from '../lib/dispositivo';
import { dettaglio, stagioneAperta } from '../lib/partite';
import { json, perMetodo } from '../lib/risposta';
import { classifica, totaliStagione } from '../lib/statistiche';

export const onRequest = perMetodo({
  GET: async ({ env, request }) => {
    const adesso = Date.now();
    const hash = await hashDelDispositivo(request);
    const idDi = async (sql: string) => (await env.DB.prepare(sql).first<{ id: number }>())?.id;
    const ultima = await idDi("SELECT id FROM partite WHERE stato = 'giocata' ORDER BY data_ora DESC, id DESC LIMIT 1");
    const prossima = await idDi("SELECT id FROM partite WHERE stato = 'convocazione' ORDER BY data_ora ASC, id ASC LIMIT 1");
    const stagione = await stagioneAperta(env.DB);
    const marcatori = stagione
      ? classifica(await totaliStagione(env.DB, stagione.id), (t) => (t.gol > 0 ? t.gol : null)).filter((v) => v.posizione <= TOP_MARCATORI_HOME)
      : [];
    return json({
      stagione: stagione ? { id: stagione.id, nome: stagione.nome } : null,
      ultima_partita: ultima ? await dettaglio(env.DB, ultima, hash, adesso) : null,
      prossima_partita: prossima ? await dettaglio(env.DB, prossima, hash, adesso) : null,
      top_marcatori: marcatori,
    });
  },
});
