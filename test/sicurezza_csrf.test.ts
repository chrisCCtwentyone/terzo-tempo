/**
 * CSRF: una pagina di un altro sito non deve poter scrivere ne' come admin ne' come votante.
 * Il browser dichiara sempre Origin e Sec-Fetch-Site sulle scritture; il middleware li controlla su TUTTE
 * le scritture di /api (compreso il voto MVP). Poi serve il Content-Type esatto application/json: un
 * "form" o un fetch no-cors di un altro sito non puo' inviarlo senza controllo preventivo (CORS).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { D1Finto } from './d1_finto';
import { ENV_ADMIN, ENV_BYPASS, ROTTE_ADMIN, chiama, rottaDi } from './rotte';

const SCRITTURE = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;
afterEach(() => vi.unstubAllGlobals());
const concreto = (f: string) => rottaDi(f).replace(/:\w+/g, '1');

function db() {
  const d = new D1Finto(true);
  d.esegui("INSERT INTO partite (id, stagione_id, data_ora, stato, gol_a, gol_b) VALUES (50, 2, '2999-01-01T19:00:00Z', 'giocata', 1, 0)");
  return d;
}

const DA_FUORI: Record<string, string>[] = [
  { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' },
  { 'Sec-Fetch-Site': 'same-site', Origin: 'https://evil.terzo-tempo.pages.dev' }, // un sottodominio non e' lo stesso sito
  { 'Sec-Fetch-Site': 'cross-site' },
  { Origin: 'https://evil.example' },
  { Origin: 'null' }, // form da iframe sandbox, file://, redirect
  { Origin: 'https://terzo-tempo.pages.dev.evil.example' },
  { Origin: 'http://terzo-tempo.pages.dev' }, // schema diverso
  { Origin: 'https://terzo-tempo.pages.dev:8443' },
  { 'Sec-Fetch-Site': 'same-origin', Origin: 'https://evil.example' }, // incoerente: nel dubbio si rifiuta
];

describe('scritture admin da un altro sito: 403 dal controllo anti-CSRF, PRIMA ancora del login', () => {
  it('ogni rotta admin, ogni metodo di scrittura, ogni tipo di richiesta "da fuori"', async () => {
    const d = db();
    const conta = () => d.tutti('SELECT (SELECT COUNT(*) FROM giocatori) g, (SELECT COUNT(*) FROM partite) p, (SELECT COUNT(*) FROM badge) b, (SELECT COUNT(*) FROM stagioni) s, (SELECT COUNT(*) FROM campi) c, (SELECT COUNT(*) FROM campi WHERE archiviato = 1) ca, (SELECT COUNT(*) FROM partite WHERE campo_id IS NOT NULL) pc, (SELECT COUNT(*) FROM eventi_partita) e, (SELECT COUNT(*) FROM partite WHERE diretta_iniziata_il IS NOT NULL OR diretta_finita_il IS NOT NULL) di, (SELECT SUM(gol + autogol) FROM partecipazioni) gp');
    const prima = conta();
    for (const f of ROTTE_ADMIN) {
      for (const metodo of SCRITTURE) {
        for (const headers of DA_FUORI) {
          const r = await chiama(d, metodo, concreto(f), { headers, corpo: {} });
          expect(r.stato, `${metodo} ${concreto(f)} ${JSON.stringify(headers)}`).toBe(403);
          expect(r.json.errore).toBe('richiesta da un altro sito: rifiutata');
        }
        // dallo stesso sito, senza credenziali, la risposta e' un'altra: serve il login
        const stesso = await chiama(d, metodo, concreto(f), { headers: { Origin: 'https://terzo-tempo.pages.dev', 'Sec-Fetch-Site': 'same-origin' }, corpo: {}, env: ENV_ADMIN });
        expect(stesso.stato).toBe(401);
      }
    }
    expect(conta()).toEqual(prima);
  });

  it('anche col bypass locale (cioe\' "da admin") una scrittura da un altro sito non passa', async () => {
    const d = db();
    const fuori: Record<string, string>[] = [{ 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'https://evil.example' }, { Origin: 'null' }];
    for (const headers of fuori) {
      const r = await chiama(d, 'POST', '/api/admin/badge', { locale: true, env: ENV_BYPASS, headers, corpo: { nome: 'Intruso', tipo: 'positivo' } });
      expect(r.stato).toBe(403);
    }
    expect(d.tutti('SELECT 1 FROM badge WHERE nome = ?', 'Intruso')).toHaveLength(0);
  });

  it('i campi: creare, modificare, archiviare o assegnare da un altro sito = 403, e "risolvi" NON apre nessun link (nessuna richiesta verso Google)', async () => {
    const d = db();
    const rete = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://www.google.com/maps/place/X/@1,2,3z' } }));
    vi.stubGlobal('fetch', rete);
    const prima = d.tutti('SELECT (SELECT COUNT(*) FROM campi) c, (SELECT COUNT(*) FROM partite WHERE campo_id IS NOT NULL) pc');
    const tentativi: [string, string, unknown][] = [
      ['POST', '/api/admin/campi', { nome: 'Intruso' }],
      ['PATCH', '/api/admin/campi/1', { nome: 'Intruso', archiviato: true }],
      ['POST', '/api/admin/campi/risolvi', { link: 'https://maps.app.goo.gl/AbC123' }],
      ['PATCH', '/api/admin/partite/11', { campo_id: 2 }],
      ['POST', '/api/admin/partite', { data_ora: '2030-01-01T20:00', giocatori: [], campo_id: 1 }],
    ];
    for (const [metodo, percorso, corpo] of tentativi) {
      for (const headers of [...DA_FUORI, { 'Sec-Fetch-Site': 'cross-site' }]) {
        for (const opzioni of [{ locale: true, env: ENV_BYPASS }, {}]) {
          const r = await chiama(d, metodo, percorso, { ...opzioni, headers, corpo });
          expect(r.stato, `${metodo} ${percorso} ${JSON.stringify(headers)}`).toBe(403);
        }
      }
    }
    expect(rete).not.toHaveBeenCalled();
    expect(d.tutti('SELECT (SELECT COUNT(*) FROM campi) c, (SELECT COUNT(*) FROM partite WHERE campo_id IS NOT NULL) pc')).toEqual(prima);
    expect(d.tutti('SELECT 1 FROM campi WHERE nome = ?', 'Intruso')).toHaveLength(0);
    // Content-Type diverso da application/json: 415 anche per i campi
    const t = await chiama(d, 'POST', '/api/admin/campi/risolvi', { locale: true, env: ENV_BYPASS, grezzo: '{"link":"https://maps.app.goo.gl/AbC123"}', headers: { 'Content-Type': 'text/plain' } });
    expect(t.stato).toBe(415);
    expect(rete).not.toHaveBeenCalled();
  });

  it('richiesta dello stesso sito: passa (controprova)', async () => {
    const d = db();
    const stessoSito: Record<string, string>[] = [{ 'Sec-Fetch-Site': 'same-origin', Origin: 'http://localhost:8788' }, { Origin: 'http://localhost:8788' }, {}, { 'Sec-Fetch-Site': 'none' }];
    for (const headers of stessoSito) {
      const r = await chiama(d, 'POST', '/api/admin/badge', { locale: true, env: ENV_BYPASS, headers, corpo: { nome: `B${Math.random()}`.slice(0, 12), tipo: 'positivo' } });
      expect(r.stato, JSON.stringify(headers)).toBe(201);
    }
  });

  it('le letture non si bloccano (un link da un altro sito puo\' aprire una pagina, non scrivere)', async () => {
    const r = await chiama(db(), 'GET', '/api/home', { headers: { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://evil.example' } });
    expect(r.stato).toBe(200);
  });
});

describe('voto MVP da un altro sito', () => {
  it('rifiutato, e nessun voto registrato ne\' cookie assegnato', async () => {
    const d = db();
    const voti = d.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp')[0].n;
    for (const headers of DA_FUORI) {
      const r = await chiama(d, 'POST', '/api/partite/50/mvp', { corpo: { giocatore_id: 1 }, headers });
      expect(r.stato, JSON.stringify(headers)).toBe(403);
      expect(r.headers.get('Set-Cookie')).toBeNull();
    }
    expect(d.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp')[0].n).toBe(voti);
  });

  it('Content-Type diverso da application/json: 415 (text/plain e form si spediscono senza CORS)', async () => {
    const d = db();
    const voti = d.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp')[0].n;
    for (const tipo of ['text/plain', 'text/plain;charset=UTF-8', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/plain;application/json', 'application/jsonx', 'application/json-patch+json', '']) {
      const r = await chiama(d, 'POST', '/api/partite/50/mvp', { grezzo: '{"giocatore_id":1}', headers: { 'Content-Type': tipo } });
      expect(r.stato, `"${tipo}"`).toBe(415);
    }
    // e sulle scritture admin
    const a = await chiama(d, 'POST', '/api/admin/badge', { locale: true, env: ENV_BYPASS, grezzo: '{"nome":"Z","tipo":"positivo"}', headers: { 'Content-Type': 'text/plain' } });
    expect(a.stato).toBe(415);
    expect(d.tutti<{ n: number }>('SELECT COUNT(*) AS n FROM voti_mvp')[0].n).toBe(voti);
  });

  it('application/json con parametri e maiuscole e\' ammesso', async () => {
    const d = db();
    const r = await chiama(d, 'POST', '/api/partite/50/mvp', { grezzo: '{"giocatore_id":1}', headers: { 'Content-Type': 'Application/JSON; charset=utf-8' } });
    expect(r.stato).toBe(201);
  });

  it('il cookie del dispositivo e\' SameSite=Lax + HttpOnly + Secure: un altro sito non lo fa inviare su una POST', async () => {
    const d = db();
    const r = await chiama(d, 'POST', '/api/partite/50/mvp', { corpo: { giocatore_id: 1 } });
    const c = r.headers.get('Set-Cookie') ?? '';
    for (const parte of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=']) expect(c).toContain(parte);
    expect(c).not.toMatch(/Domain=/i);
  });
});
