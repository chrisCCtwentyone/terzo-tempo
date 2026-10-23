/**
 * Freno agli abusi del voto MVP: al massimo LIMITE_VOTI_PER_IP voti per rete e per partita
 * (intestazione CF-Connecting-IP, che il client non puo' falsificare). Un voto per dispositivo resta il
 * limite "vero" (accettato: si aggira con l'incognito); questo ferma gli script.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CIFRE_HASH_RETE, LIMITE_VOTI_PER_IP } from '../functions/lib/costanti';
import { hashRete, reteDi } from '../functions/lib/dispositivo';
import { D1Finto } from './d1_finto';
import { chiama } from './rotte';

const IP = (ip: string) => ({ 'CF-Connecting-IP': ip });
let db: D1Finto;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-09-30T20:00:00Z'));
  db = new D1Finto(true);
  for (const id of [80, 81]) {
    db.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b) VALUES (?, 2, '2026-09-30T19:00:00Z', 'giocata', 1, 0)", id);
    // si vota solo chi ha giocato: i giocatori 1-5 sono convocati con una squadra
    for (const g of [1, 2, 3, 4, 5]) db.esegui('INSERT INTO partecipazioni (partita_id, giocatore_id, squadra) VALUES (?, ?, ?)', id, g, g % 2 ? 'A' : 'B');
  }
});
afterEach(() => vi.useRealTimers());

/** Un voto da un dispositivo NUOVO (nessun cookie) dalla rete `ip`. */
const vota = (partita: number, ip: string | null, giocatore = 1, cookie?: string) =>
  chiama(db, 'POST', `/api/partite/${partita}/mvp`, { corpo: { giocatore_id: giocatore }, headers: ip ? IP(ip) : {}, cookie });
const votiDi = (partita: number) => db.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp WHERE partita_id = ?', partita)[0].n;

describe('limite per rete', () => {
  it(`${LIMITE_VOTI_PER_IP} voti dalla stessa rete passano (una famiglia sul wifi), l'undicesimo e' 429`, async () => {
    const prima = votiDi(80);
    for (let i = 0; i < LIMITE_VOTI_PER_IP; i++) expect((await vota(80, '203.0.113.7', (i % 5) + 1)).stato, `voto ${i + 1}`).toBe(201);
    const r = await vota(80, '203.0.113.7');
    expect(r.stato).toBe(429);
    expect(r.json.errore).toContain('troppi voti');
    expect(r.headers.get('Set-Cookie')).toBeNull(); // nessun dispositivo assegnato a chi e' fermato
    expect(votiDi(80)).toBe(prima + LIMITE_VOTI_PER_IP);
  });

  it('un\'altra rete vota normalmente; il limite e\' per PARTITA', async () => {
    for (let i = 0; i < LIMITE_VOTI_PER_IP; i++) await vota(80, '203.0.113.7');
    expect((await vota(80, '203.0.113.8')).stato).toBe(201);
    expect((await vota(81, '203.0.113.7')).stato).toBe(201); // stessa rete, altra partita
  });

  it('chi ha gia\' votato dal suo telefono riceve 409 (non 429), anche se la rete e\' al limite', async () => {
    const primo = await vota(80, '203.0.113.7');
    const cookie = primo.headers.get('Set-Cookie')!.split(';')[0];
    for (let i = 1; i < LIMITE_VOTI_PER_IP; i++) await vota(80, '203.0.113.7');
    expect((await vota(80, '203.0.113.7', 1, cookie)).stato).toBe(409);
    expect((await vota(80, '203.0.113.7')).stato).toBe(429);
  });

  it('cambiare cookie non aggira il limite; cambiare l\'intestazione X-Forwarded-For nemmeno (conta solo CF-Connecting-IP)', async () => {
    for (let i = 0; i < LIMITE_VOTI_PER_IP; i++) await vota(80, '203.0.113.7');
    for (const headers of [{ 'X-Forwarded-For': '198.51.100.1', ...IP('203.0.113.7') }, { 'X-Real-Ip': '198.51.100.2', ...IP('203.0.113.7') }, { 'True-Client-Ip': '198.51.100.3', ...IP('203.0.113.7') }]) {
      const r = await chiama(db, 'POST', '/api/partite/80/mvp', { corpo: { giocatore_id: 1 }, headers });
      expect(r.stato, JSON.stringify(headers)).toBe(429);
    }
    // ...e falsificare X-Forwarded-For senza CF-Connecting-IP non da' una rete "nuova" ogni volta: senza l'intestazione dell'edge non si limita (solo sviluppo locale)
    const senza = await chiama(db, 'POST', '/api/partite/80/mvp', { corpo: { giocatore_id: 1 }, headers: { 'X-Forwarded-For': '198.51.100.1' } });
    expect(senza.stato).toBe(201);
  });

  it('richieste in parallelo: il conteggio e l\'inserimento sono un solo statement, non si superano i 10', async () => {
    const esiti = await Promise.all(Array.from({ length: 25 }, () => vota(80, '203.0.113.9')));
    expect(esiti.filter((r) => r.stato === 201)).toHaveLength(LIMITE_VOTI_PER_IP);
    expect(esiti.filter((r) => r.stato === 429)).toHaveLength(25 - LIMITE_VOTI_PER_IP);
  });

  it('IPv6: si conta il prefisso /64 (le estensioni privacy cambiano il resto dell\'indirizzo)', async () => {
    for (let i = 0; i < LIMITE_VOTI_PER_IP; i++) expect((await vota(80, `2001:db8:1:2:${i + 1}:aaaa:bbbb:cccc`)).stato).toBe(201);
    expect((await vota(80, '2001:db8:1:2::ffff')).stato).toBe(429);
    expect((await vota(80, '2001:db8:1:3::1')).stato).toBe(201);
    expect(reteDi('2001:DB8:0:0:1::1')).toBe('2001:db8:0:0');
    expect(reteDi('::1')).toBe('0:0:0:0');
    expect(reteDi('203.0.113.7')).toBe('203.0.113.7');
  });

  it('nel DB c\'e\' solo un pezzetto d\'hash: non l\'IP, ne\' un hash che lo riveli', async () => {
    await vota(80, '203.0.113.7');
    const riga = db.tutti<{ hash_ip: string }>('SELECT hash_ip FROM voti_mvp WHERE partita_id = 80')[0];
    expect(riga.hash_ip).toMatch(new RegExp(`^[0-9a-f]{${CIFRE_HASH_RETE}}$`));
    expect(riga.hash_ip).toBe(await hashRete(new Request('https://x', { headers: IP('203.0.113.7') }), 80));
    // l'hash cambia da una partita all'altra (non si collegano le partite)
    expect(await hashRete(new Request('https://x', { headers: IP('203.0.113.7') }), 81)).not.toBe(riga.hash_ip);
    const dump = JSON.stringify(db.tutti('SELECT * FROM voti_mvp WHERE partita_id = 80'));
    expect(dump).not.toContain('203.0.113.7');
    // con 16 bit ogni impronta corrisponde a ~65 mila indirizzi possibili: non e' invertibile
    expect(CIFRE_HASH_RETE).toBeLessThanOrEqual(4);
  });

  it('i voti registrati prima della migrazione (hash_ip NULL) non contano per il limite', async () => {
    for (let i = 0; i < 30; i++) db.esegui("INSERT INTO voti_mvp (partita_id, hash_token, giocatore_id, creato_il) VALUES (80, ?, 1, '2026-09-30T19:30:00Z')", `vecchio${i}`);
    expect((await vota(80, '203.0.113.7')).stato).toBe(201);
  });

  it('il limite non lascia votare cio\' che era gia\' vietato', async () => {
    db.esegui("INSERT INTO giocatori (id, nome, attivo) VALUES (901, 'Archiviato', 0)");
    expect((await vota(80, '203.0.113.7', 901)).stato).toBe(400);
    expect((await vota(80, '203.0.113.7', 99999)).stato).toBe(400);
    expect((await vota(10, '203.0.113.7')).stato).toBe(409); // partita chiusa
    expect((await vota(9999, '203.0.113.7')).stato).toBe(404);
    expect(votiDi(80)).toBe(0);
  });

  it('la GET dello stato non consuma ne\' conta il limite', async () => {
    for (let i = 0; i < 30; i++) expect((await chiama(db, 'GET', '/api/partite/80/mvp', { headers: IP('203.0.113.7') })).stato).toBe(200);
    expect((await vota(80, '203.0.113.7')).stato).toBe(201);
  });
});
