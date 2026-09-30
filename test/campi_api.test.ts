/**
 * Campi da gioco: API admin (elenco, crea, modifica, archivia, risolvi), assegnazione alla partita, e forma PUBBLICA
 * (home, elenco e dettaglio partite). Il "Google" e' simulato: nessuna rete. Nomi di fantasia.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { D1Finto } from './d1_finto';
import { ENV_BYPASS, chiama } from './rotte';

/** La chiocciola si scrive a runtime: questo file e' tracciato e non deve sembrare contenere indirizzi email (test/sicurezza_repo.test.ts). */
const AT = '@';

let db: D1Finto;
beforeEach(() => {
  db = new D1Finto(true);
});
afterEach(() => vi.unstubAllGlobals());

const admin = (metodo: string, percorso: string, corpo?: unknown, extra: Record<string, unknown> = {}) =>
  chiama(db, metodo, percorso, { locale: true, env: ENV_BYPASS, corpo, ...extra });
const DIR = 'https://www.google.com/maps/dir/?api=1&destination=';
const PIACE = 'https://www.google.com/maps/place/Polisportiva+Finta/@45.2,9.2,17z/data=!3d45.1!4d9.1';

describe('GET /api/admin/campi', () => {
  it('attivi prima (per nome), poi archiviati; con il numero di partite e le indicazioni costruite', async () => {
    const r = await admin('GET', '/api/admin/campi');
    expect(r.stato).toBe(200);
    expect(r.json.campi.map((c: any) => [c.nome, c.archiviato])).toEqual([['Centro Sportivo Esempio', false], ['Palestra di Prova', false], ['Vecchio Campo Esempio', true]]);
    expect(r.json.campi[0]).toEqual({
      id: 1, nome: 'Centro Sportivo Esempio', link_originale: 'https://maps.app.goo.gl/EsempioCentro1', lat: 44.123456, lng: 10.654321,
      url_indicazioni: `${DIR}44.123456,10.654321`, archiviato: false, partite: 1,
    });
    expect(r.json.campi[1].url_indicazioni).toBe(`${DIR}Palestra%20di%20Prova`);
  });
});

describe('POST /api/admin/campi', () => {
  it('nome obbligatorio: senza, vuoto, di soli spazi o non testo = 400 "nome: ..."', async () => {
    for (const corpo of [{}, { nome: '' }, { nome: '   ' }, { nome: null }, { nome: 5 }, { nome: ['x'] }, { link: 'https://maps.app.goo.gl/x' }]) {
      const r = await admin('POST', '/api/admin/campi', corpo);
      expect(r.stato, JSON.stringify(corpo)).toBe(400);
      expect(r.json.errore).toMatch(/^nome:/);
    }
  });
  it('crea col solo nome: indicazioni dal nome', async () => {
    const r = await admin('POST', '/api/admin/campi', { nome: '  Campo Nuovo  ' });
    expect(r.stato).toBe(201);
    expect(r.json).toMatchObject({ nome: 'Campo Nuovo', link_originale: null, lat: null, lng: null, archiviato: false, partite: 0, url_indicazioni: `${DIR}Campo%20Nuovo` });
    expect(db.tutti<{ url_indicazioni: string }>('SELECT url_indicazioni FROM campi WHERE id = ?', r.json.id)[0].url_indicazioni).toBe(`${DIR}Campo%20Nuovo`);
  });
  it('crea con link e coordinate: le indicazioni le costruisce il SERVER, anche se il client manda altro', async () => {
    const r = await admin('POST', '/api/admin/campi', { nome: 'Polisportiva Finta', link: 'Guarda: https://maps.app.goo.gl/AbC123.', lat: 45.1, lng: 9.1, url_indicazioni: 'javascript:alert(1)' });
    expect(r.stato).toBe(201);
    expect(r.json.link_originale).toBe('https://maps.app.goo.gl/AbC123');
    expect(r.json.url_indicazioni).toBe(`${DIR}45.1,9.1`);
    expect(JSON.stringify(db.tutti('SELECT * FROM campi WHERE id = ?', r.json.id))).not.toContain('javascript');
  });
  it('lo stesso nome (anche con maiuscole diverse) = 409', async () => {
    expect((await admin('POST', '/api/admin/campi', { nome: 'centro sportivo ESEMPIO' })).stato).toBe(409);
  });
  it('coordinate: in coppia, nei limiti; link: solo https di Google', async () => {
    for (const corpo of [{ lat: 45 }, { lng: 9 }, { lat: null, lng: 9 }, { lat: 91, lng: 9 }, { lat: 45, lng: 181 }, { lat: '45', lng: 9 }, { lat: Number.NaN, lng: 1 }]) {
      const r = await admin('POST', '/api/admin/campi', { nome: 'X', ...corpo });
      expect(r.stato, JSON.stringify(corpo)).toBe(400);
    }
    for (const link of ['http://maps.app.goo.gl/x', 'https://evil.example/x', 'solo testo', 'https://127.0.0.1/x', 7, 'javascript:alert(1) https://evil.example']) {
      const r = await admin('POST', '/api/admin/campi', { nome: 'Y', link });
      expect(r.stato, JSON.stringify(link)).toBe(400);
      expect(r.json.errore).toMatch(/^link:/);
    }
    expect(db.tutti('SELECT 1 FROM campi WHERE nome IN (?, ?)', 'X', 'Y')).toHaveLength(0);
  });
  it('null o vuoto come link = nessun link', async () => {
    for (const [i, link] of [null, '', '  '].entries()) expect((await admin('POST', '/api/admin/campi', { nome: `Campo L${i}`, link })).json.link_originale).toBeNull();
  });
});

describe('PATCH /api/admin/campi/:id', () => {
  it('cambia il nome: le indicazioni senza coordinate seguono il nome, con coordinate no', async () => {
    const senza = await admin('PATCH', '/api/admin/campi/2', { nome: 'Palestra Rinnovata' });
    expect(senza.json).toMatchObject({ nome: 'Palestra Rinnovata', url_indicazioni: `${DIR}Palestra%20Rinnovata` });
    const con = await admin('PATCH', '/api/admin/campi/1', { nome: 'Centro Esempio Bis' });
    expect(con.json).toMatchObject({ nome: 'Centro Esempio Bis', url_indicazioni: `${DIR}44.123456,10.654321` });
  });
  it('cambia il link (e le coordinate, in coppia); null toglie', async () => {
    const r = await admin('PATCH', '/api/admin/campi/2', { link: PIACE, lat: 45.5, lng: 9.5 });
    expect(r.json).toMatchObject({ link_originale: PIACE, lat: 45.5, lng: 9.5, url_indicazioni: `${DIR}45.5,9.5` });
    const t = await admin('PATCH', '/api/admin/campi/2', { link: null, lat: null, lng: null });
    expect(t.json).toMatchObject({ link_originale: null, lat: null, lng: null, url_indicazioni: `${DIR}Palestra%20di%20Prova` });
  });
  it('archivia e riattiva', async () => {
    expect((await admin('PATCH', '/api/admin/campi/2', { archiviato: true })).json.archiviato).toBe(true);
    expect((await admin('PATCH', '/api/admin/campi/2', { archiviato: false })).json.archiviato).toBe(false);
    expect((await admin('PATCH', '/api/admin/campi/2', { archiviato: 'si' })).stato).toBe(400);
  });
  it('errori: nome vuoto, doppione, corpo senza campi, id inesistente o malformato, una sola coordinata', async () => {
    expect((await admin('PATCH', '/api/admin/campi/1', { nome: '' })).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/campi/1', { nome: 'palestra di prova' })).stato).toBe(409);
    expect((await admin('PATCH', '/api/admin/campi/1', {})).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/campi/999', { nome: 'X' })).stato).toBe(404);
    expect((await admin('PATCH', '/api/admin/campi/abc', { nome: 'X' })).stato).toBe(404);
    expect((await admin('PATCH', '/api/admin/campi/1', { lat: 10 })).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/campi/1', { link: 'https://evil.example/' })).stato).toBe(400);
    expect(db.tutti<{ nome: string }>('SELECT nome FROM campi WHERE id = 1')[0].nome).toBe('Centro Sportivo Esempio');
  });
  it('nessuna rotta di cancellazione: un campo si archivia', async () => {
    const r = await admin('DELETE', '/api/admin/campi/1');
    expect(r.stato).toBe(405);
    expect(db.tutti('SELECT 1 FROM campi')).toHaveLength(3);
    expect(() => db.esegui('DELETE FROM campi WHERE id = 1')).toThrow(); // nemmeno il DB: una partita lo usa
  });
});

describe('POST /api/admin/campi/risolvi', () => {
  const SHORT = 'https://maps.app.goo.gl/AbC123xyz';
  const fingiGoogle = (catena: Record<string, string>) => {
    const visti: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      visti.push(url);
      const dove = catena[url];
      if (!dove) throw new Error(`fetch inatteso verso ${url}`);
      return new Response(null, { status: 302, headers: { Location: dove } });
    }));
    return visti;
  };

  it('link corto -> { nome, lat, lng, url_indicazioni, link_finale }', async () => {
    const visti = fingiGoogle({ [SHORT]: PIACE });
    const r = await admin('POST', '/api/admin/campi/risolvi', { link: `Guarda questo posto: ${SHORT}` });
    expect(r.stato).toBe(200);
    expect(r.json).toEqual({ nome: 'Polisportiva Finta', lat: 45.1, lng: 9.1, url_indicazioni: `${DIR}45.1,9.1`, link_finale: PIACE });
    expect(visti).toEqual([SHORT]);
  });
  it('non scrive niente nel DB', async () => {
    fingiGoogle({ [SHORT]: PIACE });
    const prima = db.tutti('SELECT * FROM campi');
    await admin('POST', '/api/admin/campi/risolvi', { link: SHORT });
    expect(db.tutti('SELECT * FROM campi')).toEqual(prima);
  });
  it('senza nome: la chiave nome manca nella risposta', async () => {
    fingiGoogle({ [SHORT]: 'https://www.google.com/maps/@45.5,9.5,17z' });
    const r = await admin('POST', '/api/admin/campi/risolvi', { link: SHORT });
    expect(r.json).toEqual({ lat: 45.5, lng: 9.5, url_indicazioni: `${DIR}45.5,9.5`, link_finale: 'https://www.google.com/maps/@45.5,9.5,17z' });
    expect('nome' in r.json).toBe(false);
  });
  it('link non valido o fuori lista: 400 "link: ..." e NESSUNA richiesta di rete', async () => {
    const visti = fingiGoogle({});
    for (const link of ['', '   ', 'testo senza indirizzo', 'http://maps.app.goo.gl/x', 'https://evil.example/x', 'https://169.254.169.254/latest', `https://www.google.com${AT}evil.example/`, 'https://goo.gl/AbC', 5, null, ['x']]) {
      const r = await admin('POST', '/api/admin/campi/risolvi', { link });
      expect(r.stato, JSON.stringify(link)).toBe(400);
      expect(r.json.errore, JSON.stringify(link)).toMatch(/^link:/);
    }
    expect((await admin('POST', '/api/admin/campi/risolvi', {})).stato).toBe(400);
    expect(visti).toEqual([]);
  });
  it('redirect fuori lista a meta\' catena: 400, e l\'host esterno non viene mai richiesto', async () => {
    const visti = fingiGoogle({ [SHORT]: 'https://evil.example/steal' });
    const r = await admin('POST', '/api/admin/campi/risolvi', { link: SHORT });
    expect(r.stato).toBe(400);
    expect(visti).toEqual([SHORT]);
  });
  it('Google non risponde: 502 senza dettagli', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('dettaglio-segreto: connessione rifiutata'); }));
    const r = await admin('POST', '/api/admin/campi/risolvi', { link: SHORT });
    expect(r.stato).toBe(502);
    expect(r.testo).not.toContain('dettaglio-segreto');
  });
  it('troppo lungo: 400; non oggetto / non JSON: 400; Content-Type sbagliato: 415', async () => {
    fingiGoogle({});
    expect((await admin('POST', '/api/admin/campi/risolvi', { link: `${SHORT}?${'a'.repeat(3000)}` })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi/risolvi', undefined, { grezzo: '[]' })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi/risolvi', undefined, { grezzo: '{"link":"x"', headers: {} })).stato).toBe(400);
    expect((await admin('POST', '/api/admin/campi/risolvi', undefined, { grezzo: `{"link":"${SHORT}"}`, headers: { 'Content-Type': 'text/plain' } })).stato).toBe(415);
  });
  it('senza accesso admin: chiuso, e nessuna richiesta di rete (il server non apre link per gli estranei)', async () => {
    const visti = fingiGoogle({ [SHORT]: PIACE });
    for (const env of [{}, { ACCESS_TEAM_DOMAIN: 'team-di-prova.cloudflareaccess.com', ACCESS_AUD: 'aud-di-prova-0123456789', EMAIL_AUTORIZZATE: 'admin@prova.invalid' }]) {
      const r = await chiama(db, 'POST', '/api/admin/campi/risolvi', { env, corpo: { link: SHORT } });
      expect([401, 403]).toContain(r.stato);
    }
    expect(visti).toEqual([]);
  });
  it('la scorciatoia di prova (GOOGLE_MAPS_PROVA) in produzione e\' ignorata: si va sul Google vero', async () => {
    const visti = fingiGoogle({ [SHORT]: PIACE, 'http://localhost:9009/AbC123xyz': PIACE });
    // "sito vero": niente bypass (non e' localhost, Access configurato): la richiesta non passa nemmeno dal login
    const r = await chiama(db, 'POST', '/api/admin/campi/risolvi', { env: { ...ENV_BYPASS, GOOGLE_MAPS_PROVA: 'http://localhost:9009' }, corpo: { link: SHORT } });
    expect([401, 403]).toContain(r.stato);
    // in locale col bypass, invece, la richiesta va al finto Google dichiarato
    const locale = await admin('POST', '/api/admin/campi/risolvi', { link: SHORT }, { env: { ...ENV_BYPASS, GOOGLE_MAPS_PROVA: 'http://localhost:9009' } });
    expect(locale.stato).toBe(200);
    expect(visti).toEqual(['http://localhost:9009/AbC123xyz']);
  });
});

describe('la partita e il suo campo', () => {
  it('crea una partita con campo_id (e senza: nessun campo)', async () => {
    const con = await admin('POST', '/api/admin/partite', { data_ora: '2027-01-01T20:00', giocatori: [1, 2], campo_id: 1 });
    expect(con.stato).toBe(201);
    expect(con.json.campo_id).toBe(1);
    const senza = await admin('POST', '/api/admin/partite', { data_ora: '2027-01-08T20:00', giocatori: [1, 2] });
    expect(senza.json.campo_id).toBeNull();
    const nullo = await admin('POST', '/api/admin/partite', { data_ora: '2027-01-15T20:00', giocatori: [1, 2], campo_id: null });
    expect(nullo.json.campo_id).toBeNull();
  });
  it('campo inesistente, archiviato o non numerico: 400, e la partita non si crea', async () => {
    const n = db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partite')[0].n;
    for (const campo_id of [999, 3, 0, -1, 1.5, '1', true, [1], {}]) {
      const r = await admin('POST', '/api/admin/partite', { data_ora: '2027-01-01T20:00', giocatori: [1], campo_id });
      expect(r.stato, JSON.stringify(campo_id)).toBe(400);
      expect(r.json.errore).toMatch(/^campo_id:/);
    }
    expect(db.tutti<{ n: number }>('SELECT COUNT(*) n FROM partite')[0].n).toBe(n);
  });
  it('PATCH: assegna, cambia, toglie; archiviato o inesistente = 400', async () => {
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: 2 })).json.campo_id).toBe(2);
    expect((await admin('GET', '/api/admin/partite/11')).json.campo_id).toBe(2);
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: null })).json.campo_id).toBeNull();
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: 3 })).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: 999 })).stato).toBe(400);
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: 'x' })).stato).toBe(400);
    expect(db.tutti<{ campo_id: number | null }>('SELECT campo_id FROM partite WHERE id = 11')[0].campo_id).toBeNull();
  });
  it('un campo archiviato DOPO l\'assegnazione resta sulla partita, e la partita si puo\' modificare lo stesso', async () => {
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: 1 })).stato).toBe(200);
    await admin('PATCH', '/api/admin/campi/1', { archiviato: true });
    expect((await admin('PATCH', '/api/admin/partite/11', { cronaca: 'ok' })).json.campo_id).toBe(1);
    expect((await admin('PATCH', '/api/admin/partite/11', { campo_id: 1 })).stato).toBe(200); // lo stesso campo: nessun cambiamento
    expect((await chiama(db, 'GET', '/api/partite/11')).json.campo).not.toBeNull();
    expect((await admin('PATCH', '/api/admin/partite/9', { campo_id: 1 })).stato).toBe(400); // ma non si assegna a un'altra
  });
  it('GET admin partita: 404 se non esiste', async () => {
    expect((await admin('GET', '/api/admin/partite/999')).stato).toBe(404);
  });
});

describe('API PUBBLICHE: { campo: { nome, url_indicazioni } | null }', () => {
  it('dettaglio: nome e indicazioni; partita senza campo = null', async () => {
    const r = await chiama(db, 'GET', '/api/partite/11');
    expect(r.json.campo).toEqual({ nome: 'Centro Sportivo Esempio', url_indicazioni: `${DIR}44.123456,10.654321` });
    expect(Object.keys(r.json.campo).sort()).toEqual(['nome', 'url_indicazioni']);
    expect((await chiama(db, 'GET', '/api/partite/8')).json.campo).toBeNull();
    expect((await chiama(db, 'GET', '/api/partite/10')).json.campo).toEqual({ nome: 'Palestra di Prova', url_indicazioni: `${DIR}Palestra%20di%20Prova` });
  });
  it('elenco: ogni partita ha il suo campo (archiviato compreso: resta sulle partite passate)', async () => {
    const r = await chiama(db, 'GET', '/api/partite');
    const per = Object.fromEntries(r.json.partite.map((p: any) => [p.id, p.campo]));
    expect(per[11].nome).toBe('Centro Sportivo Esempio');
    expect(per[10].nome).toBe('Palestra di Prova');
    expect(per[9]).toEqual({ nome: 'Vecchio Campo Esempio', url_indicazioni: `${DIR}44.5,10.5` });
    expect(per[8]).toBeNull();
    expect(r.json.partite.every((p: any) => 'campo' in p)).toBe(true);
  });
  it('home: prossima e ultima partita portano il campo', async () => {
    const r = await chiama(db, 'GET', '/api/home');
    expect(r.json.prossima_partita.campo).toEqual({ nome: 'Centro Sportivo Esempio', url_indicazioni: `${DIR}44.123456,10.654321` });
    expect(r.json.ultima_partita.campo).toEqual({ nome: 'Palestra di Prova', url_indicazioni: `${DIR}Palestra%20di%20Prova` });
  });
  it('un url_indicazioni non Google nel DB ("javascript:...") NON esce: l\'indirizzo si ricostruisce sempre da nome e coordinate', async () => {
    for (const cattivo of ['javascript:alert(document.cookie)', 'https://evil.example/phishing', 'data:text/html,<script>1</script>', 'http://www.google.com/maps', '//evil.example', '']) {
      db.esegui('UPDATE campi SET url_indicazioni = ? WHERE id IN (1, 2)', cattivo);
      for (const percorso of ['/api/partite/11', '/api/partite/10', '/api/partite', '/api/home']) {
        const r = await chiama(db, 'GET', percorso);
        expect(r.testo, `${percorso} con "${cattivo}"`).not.toMatch(/javascript:|evil\.example|data:text|http:\/\/www\.google/);
      }
      const r = await chiama(db, 'GET', '/api/partite/11');
      expect(r.json.campo.url_indicazioni).toBe(`${DIR}44.123456,10.654321`);
    }
  });
  it('ogni url_indicazioni pubblico e\' https://www.google.com/maps/dir/..., anche con un nome maligno', async () => {
    const nome = 'x&destination=evil.example#"><script>alert(1)</script>';
    db.esegui('UPDATE campi SET nome = ?, lat = NULL, lng = NULL WHERE id = 2', nome);
    const u = (await chiama(db, 'GET', '/api/partite/10')).json.campo.url_indicazioni as string;
    expect(u.startsWith(DIR)).toBe(true);
    expect(new URL(u).hostname).toBe('www.google.com');
    expect(new URL(u).searchParams.get('destination')).toBe(nome);
    expect(u).not.toMatch(/[<>"]/);
  });
  it('il link incollato (link_originale), l\'id del campo e la colonna archiviato non escono dalle rotte pubbliche', async () => {
    for (const percorso of ['/api/partite/11', '/api/partite/10', '/api/partite/9', '/api/partite', '/api/home']) {
      const r = await chiama(db, 'GET', percorso);
      expect(r.testo, percorso).not.toMatch(/link_originale|EsempioCentro1|maps\.app\.goo\.gl|campo_id|archiviato/);
    }
  });
  it('rotte pubbliche dei campi: non ce ne sono (l\'elenco e\' solo admin)', async () => {
    expect((await chiama(db, 'GET', '/api/campi')).stato).toBe(404);
  });
});
