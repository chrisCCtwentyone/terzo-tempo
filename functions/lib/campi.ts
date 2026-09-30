/**
 * Campi da gioco: forma per l'admin, forma PUBBLICA e validazioni condivise.
 *
 * Regola di sicurezza: nelle API pubbliche `url_indicazioni` e' SEMPRE ricostruito qui da lat/lng/nome
 * (https://www.google.com/maps/dir/?api=1&destination=...). La colonna `campi.url_indicazioni` e' una copia
 * per comodita' e NON si legge: se qualcuno ci scrivesse "javascript:..." l'API pubblica non lo restituirebbe.
 * Anche il link incollato dall'admin (`link_originale`) non esce mai dalle rotte pubbliche.
 */

import { MAX_LINK_CAMPO } from './costanti';
import { indicazioni, primoUrl, urlAmmesso } from './maps';
import { ErroreApi } from './risposta';
import { intero, numeroOpz } from './valida';

export type CampoDb = {
  id: number;
  nome: string;
  link_originale: string | null;
  lat: number | null;
  lng: number | null;
  archiviato: number;
  partite?: number;
};

/** Costante del codice: nessun dato del client entra in questa stringa. */
export const SELECT_CAMPO = `SELECT c.id, c.nome, c.link_originale, c.lat, c.lng, c.archiviato,
  (SELECT COUNT(*) FROM partite p WHERE p.campo_id = c.id) AS partite
  FROM campi c`;

/** Il campo come lo vede l'admin (anche archiviato, col link incollato). */
export const perAdminCampo = (c: CampoDb) => ({
  id: c.id,
  nome: c.nome,
  link_originale: c.link_originale,
  lat: c.lat,
  lng: c.lng,
  url_indicazioni: indicazioni(c),
  archiviato: c.archiviato === 1,
  partite: c.partite ?? 0,
});

export type CampoPubblico = { nome: string; url_indicazioni: string };

/** Il campo come lo vede il pubblico: solo nome e indicazioni costruite dal server. null = nessun campo. */
export function campoPubblico(c: Pick<CampoDb, 'nome' | 'lat' | 'lng'> | null | undefined): CampoPubblico | null {
  if (!c) return null;
  const url = indicazioni(c);
  return url ? { nome: c.nome, url_indicazioni: url } : null;
}

/** Tutti i campi (archiviati compresi: restano sulle partite passate), per id. Sono poche righe. */
export async function mappaCampi(db: D1Database): Promise<Map<number, Pick<CampoDb, 'nome' | 'lat' | 'lng'>>> {
  const r = await db.prepare('SELECT id, nome, lat, lng FROM campi').all<CampoDb>();
  return new Map(r.results.map((c) => [c.id, c]));
}

/**
 * `campo_id` di una partita: null (nessun campo) oppure un campo che esiste e NON e' archiviato. Fa eccezione il campo gia'
 * assegnato alla partita (`corrente`): un campo archiviato dopo l'assegnazione non blocca le altre modifiche.
 */
export async function campoAssegnabile(db: D1Database, valore: unknown, corrente: number | null): Promise<number | null> {
  if (valore === null) return null;
  const id = intero(valore, 'campo_id', 1, Number.MAX_SAFE_INTEGER);
  if (id === corrente) return id;
  const c = await db.prepare('SELECT archiviato FROM campi WHERE id = ?').bind(id).first<{ archiviato: number }>();
  if (!c || c.archiviato === 1) throw new ErroreApi(400, 'campo_id: il campo non esiste o è archiviato');
  return id;
}

/** Il link incollato, pulito e controllato con la stessa lista del risolutore (nessuna richiesta di rete). null = assente. */
export function linkCampo(v: unknown): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return null;
  if (typeof v !== 'string' || v.length > MAX_LINK_CAMPO) throw new ErroreApi(400, `link: testo di al massimo ${MAX_LINK_CAMPO} caratteri`);
  const u = primoUrl(v);
  if (!u) throw new ErroreApi(400, 'link: nessun indirizzo trovato');
  return urlAmmesso(u).href;
}

/** lat e lng vanno in coppia (entrambi o nessuno). */
export function coordinateCampo(c: Record<string, unknown>): { lat: number | null; lng: number | null } {
  const lat = numeroOpz(c.lat, 'lat', -90, 90);
  const lng = numeroOpz(c.lng, 'lng', -180, 180);
  if ((lat === null) !== (lng === null)) throw new ErroreApi(400, 'lat e lng: vanno indicate insieme');
  return { lat, lng };
}
