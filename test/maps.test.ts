/**
 * Risoluzione dei link di Google Maps (functions/lib/maps.ts): lettura di nome e coordinate da indirizzi realistici
 * e difese anti-SSRF del giro dei redirect, con un fetch SIMULATO (nessuna rete). Nomi e coordinate INVENTATI.
 */
import { describe, expect, it, vi } from 'vitest';
import { ErroreApi } from '../functions/lib/risposta';
import { HOST_AMMESSI, estraiDati, fetchDiProva, indicazioni, primoUrl, risolviLink, urlAmmesso, type FetchFn } from '../functions/lib/maps';

/** La chiocciola si scrive a runtime: questo file e' tracciato e non deve sembrare contenere indirizzi email (test/sicurezza_repo.test.ts). */
const AT = '@';

const PIACE = 'https://www.google.com/maps/place/Centro+Sportivo+Esempio/@45.1234567,9.1234567,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d45.1111111!4d9.2222222?entry=tts';

// ─── il testo incollato ───
describe('primoUrl', () => {
  it('estrae il primo indirizzo da un testo con altro intorno', () => {
    expect(primoUrl('Guarda questo posto: https://maps.app.goo.gl/AbC123xyz e poi dimmi')).toBe('https://maps.app.goo.gl/AbC123xyz');
    expect(primoUrl('https://maps.app.goo.gl/AbC123xyz')).toBe('https://maps.app.goo.gl/AbC123xyz');
    expect(primoUrl('(https://maps.app.goo.gl/AbC123xyz).')).toBe('https://maps.app.goo.gl/AbC123xyz');
    expect(primoUrl('uno https://maps.app.goo.gl/uno due https://maps.app.goo.gl/due')).toBe('https://maps.app.goo.gl/uno');
    expect(primoUrl('a capo\nhttps://maps.app.goo.gl/x?g_st=ic\nciao')).toBe('https://maps.app.goo.gl/x?g_st=ic');
  });
  it('nessun indirizzo: null (javascript:, intent:, testo semplice)', () => {
    for (const t of ['', 'Centro Sportivo Esempio', 'javascript:alert(1)', 'intent://maps.app.goo.gl/x#Intent;end', 'maps.app.goo.gl/AbC']) expect(primoUrl(t), t).toBeNull();
  });
  it('il PRIMO indirizzo vince anche se e\' http: poi viene rifiutato, non sostituito dal secondo', () => {
    const u = primoUrl('http://evil.example/ https://maps.app.goo.gl/ok')!;
    expect(u).toBe('http://evil.example/');
    expect(() => urlAmmesso(u)).toThrow(ErroreApi);
  });
});

// ─── la lista degli host ───
describe('urlAmmesso: solo https e host in lista ESATTA', () => {
  it('la lista e\' esattamente quella decisa', () => {
    expect([...HOST_AMMESSI].sort()).toEqual(['consent.google.com', 'goo.gl', 'google.com', 'google.it', 'maps.app.goo.gl', 'maps.google.com', 'www.google.com', 'www.google.it']);
  });
  it('accetta gli host ammessi', () => {
    for (const u of [
      'https://maps.app.goo.gl/AbC123', 'https://goo.gl/maps/AbC123', 'https://goo.gl/maps', 'https://www.google.com/maps/place/X', 'https://google.com/maps',
      'https://maps.google.com/?q=x', 'https://maps.google.com?q=x', 'https://www.google.it/maps', 'https://google.it/maps', 'https://consent.google.com/m?continue=https://www.google.com/maps',
      'HTTPS://WWW.GOOGLE.COM/maps',
    ]) expect(() => urlAmmesso(u), u).not.toThrow();
  });
  it('rifiuta http e ogni altro schema', () => {
    for (const u of ['http://maps.app.goo.gl/AbC', 'http://www.google.com/maps', 'ftp://www.google.com/', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'intent://maps.app.goo.gl/x#Intent;end']) {
      expect(() => urlAmmesso(u), u).toThrow(ErroreApi);
    }
  });
  it('rifiuta gli indirizzi IP, comunque scritti', () => {
    for (const u of [
      'https://127.0.0.1/', 'https://10.0.0.1/maps', 'https://192.168.1.1/', 'https://169.254.169.254/latest/meta-data', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/',
      'https://2130706433/', 'https://0x7f.0.0.1/', 'https://0177.0.0.1/', 'https://127.1/', 'https://8.8.8.8/maps', 'https://142.250.180.14/maps',
    ]) {
      expect(() => urlAmmesso(u), u).toThrow(/IP|non è un link|non valido/);
    }
  });
  it('rifiuta host simili, sottodomini, suffissi, porte, utente e password', () => {
    for (const u of [
      'https://evil.example/', 'https://www.google.com.evil.example/maps', 'https://evil-www.google.com/', 'https://notgoogle.com/', 'https://google.com.evil.example/',
      'https://mail.google.com/', 'https://www.google.fr/maps', 'https://www.google.co.uk/maps', 'https://maps.googleapis.com/maps/api', 'https://sub.maps.app.goo.gl/x',
      'https://www.google.com./maps', 'https://maps.google.com./', 'https://www.google.com:8443/maps', 'https://www.google.com:443x/', `https://user${AT}www.google.com/maps`,
      `https://www.google.com${AT}evil.example/maps`, `https://evil.example${AT}www.google.com/maps`, `https://user:pass${AT}www.google.com/`, 'https://www.gооgle.com/', // "о" cirillica
      'https://www.google.com%2eevil.example/', 'https://goo.gl.evil.example/maps/x', 'https://bit.ly/x',
    ]) {
      expect(() => urlAmmesso(u), u).toThrow(ErroreApi);
    }
  });
  it('nessuna differenza fra chi controlla e chi richiede: si richiede SEMPRE l\'href normalizzato dell\'URL controllato', () => {
    // il parser WHATWG tratta "\\" come "/": l'host e' www.google.com (ammesso), il resto e' solo il percorso
    const u = urlAmmesso('https://www.google.com\\@evil.example/');
    expect(u.hostname).toBe('www.google.com');
    expect(u.href).toBe('https://www.google.com/@evil.example/');
  });
  it('goo.gl vale solo per il percorso /maps', () => {
    for (const u of ['https://goo.gl/', 'https://goo.gl/AbC123', 'https://goo.gl/mapsx', 'https://goo.gl/photos/x', 'https://goo.gl/MAPS/x']) expect(() => urlAmmesso(u), u).toThrow(ErroreApi);
  });
  it('un Location relativo si risolve sull\'host corrente e si ri-valida; //host-esterno no', () => {
    const base = new URL('https://www.google.com/maps/place/X');
    expect(urlAmmesso('/maps/place/Y', base).href).toBe('https://www.google.com/maps/place/Y');
    expect(() => urlAmmesso('//evil.example/x', base)).toThrow(ErroreApi);
    expect(() => urlAmmesso('http://www.google.com/x', base)).toThrow(ErroreApi);
    expect(() => urlAmmesso('/x', new URL('https://goo.gl/maps/abc'))).toThrow(ErroreApi); // goo.gl fuori da /maps
  });
});

// ─── nome e coordinate ───
const dati = (u: string) => estraiDati(new URL(u));

describe('estraiDati', () => {
  it('nome da /maps/place (+ -> spazio, %xx decodificati) e coordinate del POSTO (!3d!4d) preferite a quelle della mappa (@)', () => {
    expect(dati(PIACE)).toEqual({ nome: 'Centro Sportivo Esempio', lat: 45.1111111, lng: 9.2222222 });
  });
  it('solo @lat,lng', () => {
    expect(dati('https://www.google.com/maps/place/Campo+Prova/@41.5,-12.25,15z')).toEqual({ nome: 'Campo Prova', lat: 41.5, lng: -12.25 });
    expect(dati('https://www.google.com/maps/@-33.8,151.2,12z')).toEqual({ lat: -33.8, lng: 151.2 });
  });
  it('?q=lat,lng (con virgola codificata e spazi)', () => {
    expect(dati('https://maps.google.com/?q=45.25,9.5')).toEqual({ lat: 45.25, lng: 9.5 });
    expect(dati('https://www.google.com/maps?q=45.25%2C9.5')).toEqual({ lat: 45.25, lng: 9.5 });
    expect(dati('https://maps.google.com/?q=-45.25,%209.5')).toEqual({ lat: -45.25, lng: 9.5 });
  });
  it('percent-encoding: accenti, apostrofi, %2B, +', () => {
    expect(dati('https://www.google.com/maps/place/Caff%C3%A8+dell%27Angolo/@1,2,3z').nome).toBe("Caffè dell'Angolo");
    expect(dati('https://www.google.com/maps/place/Sport%2BClub+Esempio/').nome).toBe('Sport+Club Esempio');
    expect(dati('https://www.google.com/maps/place/Polisportiva%20Esempio%20A/').nome).toBe('Polisportiva Esempio A');
  });
  it('senza nome: niente nome inventato', () => {
    expect(dati('https://www.google.com/maps/@45.1,9.1,17z').nome).toBeUndefined();
    expect(dati('https://www.google.com/maps/place//@45.1,9.1,17z').nome).toBeUndefined();
    expect(dati('https://www.google.com/maps/search/pizza/@45.1,9.1,17z').nome).toBeUndefined();
    expect(dati('https://maps.google.com/').nome).toBeUndefined();
  });
  it('un posto scelto col dito: /maps/place/<lat,lng> da la posizione e NESSUN nome', () => {
    expect(dati('https://www.google.com/maps/place/45.3,9.4/')).toEqual({ lat: 45.3, lng: 9.4 });
    expect(dati('https://www.google.com/maps/place/45%C2%B018\'00.0%22N+9%C2%B024\'00.0%22E/').nome).toBeUndefined();
  });
  it('nome non adatto: vuoto, troppo lungo (> 80), caratteri di controllo, %-codifica malformata = assente', () => {
    expect(dati(`https://www.google.com/maps/place/${'a'.repeat(81)}/`).nome).toBeUndefined();
    expect(dati(`https://www.google.com/maps/place/${'a'.repeat(80)}/`).nome).toHaveLength(80);
    expect(dati('https://www.google.com/maps/place/Campo%00Prova/').nome).toBeUndefined();
    expect(dati('https://www.google.com/maps/place/Campo%07Prova/').nome).toBeUndefined();
    expect(dati('https://www.google.com/maps/place/Campo%0AProva/').nome).toBe('Campo Prova'); // un a capo e' solo uno spazio
    expect(dati('https://www.google.com/maps/place/Campo%E2%80%AEProva/').nome).toBeUndefined(); // ribalta il verso di scrittura
    expect(dati('https://www.google.com/maps/place/Campo%ZZProva/').nome).toBeUndefined();
    expect(dati('https://www.google.com/maps/place/%20%20/').nome).toBeUndefined();
  });
  it('coordinate fuori dai limiti della Terra: ignorate', () => {
    expect(dati('https://www.google.com/maps/@91.0,10.0,12z')).toEqual({});
    expect(dati('https://www.google.com/maps/@45.0,181.0,12z')).toEqual({});
    expect(dati('https://maps.google.com/?q=200,300')).toEqual({});
    expect(dati('https://www.google.com/maps/place/X/data=!3d95.5!4d10.5')).toEqual({ nome: 'X' });
    expect(dati('https://www.google.com/maps/place/X/data=!3d95.5!4d10.5/@45.5,10.5,12z')).toEqual({ nome: 'X', lat: 45.5, lng: 10.5 });
  });
  it('?q=<testo>: nome = il testo fino alla prima virgola (forma del link "Condividi" dell\'app), solo su pagine di mappe', () => {
    const d = dati('https://maps.google.com?q=Centro+Sportivo+Esempio,+Via+Finta+1,+00000+Nessunluogo,+Italy&ftid=0x0:0x0&entry=gps&g_st=com.google.maps.preview.copy');
    expect(d).toEqual({ nome: 'Centro Sportivo Esempio' });
    expect(dati('https://www.google.com/search?q=Centro+Sportivo+Esempio').nome).toBeUndefined();
    expect(dati('https://www.google.com/maps/place/Nome+Uno/?q=Altro+Nome').nome).toBe('Nome Uno');
  });
  it('le coordinate nei percorsi codificati (%21 al posto di !) si leggono ugualmente', () => {
    expect(dati('https://www.google.com/maps/place/X/data=%213d10.5%214d20.5')).toEqual({ nome: 'X', lat: 10.5, lng: 20.5 });
  });
});

describe('indicazioni', () => {
  it('con coordinate: destination=lat,lng', () => {
    expect(indicazioni({ nome: 'X', lat: 45.1111111, lng: 9.2222222 })).toBe('https://www.google.com/maps/dir/?api=1&destination=45.1111111,9.2222222');
    expect(indicazioni({ lat: -45, lng: 9.5 })).toBe('https://www.google.com/maps/dir/?api=1&destination=-45,9.5');
    expect(indicazioni({ lat: 1e-9, lng: 0 })).toBe('https://www.google.com/maps/dir/?api=1&destination=0,0');
  });
  it('senza coordinate: il nome codificato; senza niente: null', () => {
    expect(indicazioni({ nome: 'Centro Sportivo Esempio & C. #1' })).toBe('https://www.google.com/maps/dir/?api=1&destination=Centro%20Sportivo%20Esempio%20%26%20C.%20%231');
    expect(indicazioni({ nome: 'Caffè', lat: null, lng: null })).toBe('https://www.google.com/maps/dir/?api=1&destination=Caff%C3%A8');
    expect(indicazioni({})).toBeNull();
    expect(indicazioni({ nome: '   ' })).toBeNull();
  });
  it('mai altro che https://www.google.com/maps/dir/ (nome malizioso codificato)', () => {
    const u = indicazioni({ nome: 'x&destination=evil.example#javascript:alert(1)' })!;
    expect(u.startsWith('https://www.google.com/maps/dir/?api=1&destination=')).toBe(true);
    expect(new URL(u).host).toBe('www.google.com');
    expect(new URL(u).hash).toBe('');
  });
});

// ─── il giro dei redirect, con un fetch simulato ───
type Passo = number | [number, string] | Error | ((url: string) => Response | Promise<Response>);

/** Un "Google" finto: per ogni indirizzo richiesto risponde come dice `catena`. Registra tutte le richieste. */
function finto(catena: Record<string, Passo>) {
  const chiamate: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    chiamate.push({ url, init });
    const p = catena[url];
    if (p === undefined) throw new Error(`fetch inatteso verso ${url}`);
    if (p instanceof Error) throw p;
    if (typeof p === 'function') return p(url);
    if (typeof p === 'number') return new Response(null, { status: p });
    return new Response(null, { status: p[0], headers: { Location: p[1] } });
  }) as unknown as FetchFn & ReturnType<typeof vi.fn>;
  return { f, chiamate };
}
const SHORT = 'https://maps.app.goo.gl/AbC123xyz';
const esito = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as ErroreApi);

describe('risolviLink: catena valida', () => {
  it('link corto -> pagina del posto: nome, coordinate del posto, indicazioni; ci si ferma senza aprire la pagina finale', async () => {
    const { f, chiamate } = finto({ [SHORT]: [302, PIACE] });
    const r = await risolviLink(`Guarda questo posto: ${SHORT} grazie`, f);
    expect(r).toEqual({
      nome: 'Centro Sportivo Esempio', lat: 45.1111111, lng: 9.2222222,
      url_indicazioni: 'https://www.google.com/maps/dir/?api=1&destination=45.1111111,9.2222222', link_finale: PIACE,
    });
    expect(chiamate.map((c) => c.url)).toEqual([SHORT]);
  });

  it('ogni richiesta: GET, redirect a mano, segnale di timeout, SOLO User-Agent e lingua (niente cookie, credenziali o intestazioni del client)', async () => {
    const { f, chiamate } = finto({ [SHORT]: [302, PIACE] });
    await risolviLink(SHORT, f);
    const { method, redirect, signal, headers, ...altro } = chiamate[0].init;
    expect(method).toBe('GET');
    expect(redirect).toBe('manual');
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(Object.keys(headers as object).sort()).toEqual(['Accept-Language', 'User-Agent']);
    expect(altro).toEqual({}); // nessun `credentials`, `body`, `referrer`...
    expect(JSON.stringify(headers).toLowerCase()).not.toMatch(/cookie|authorization|token/);
  });

  it('catena di piu\' passaggi (corto -> goo.gl/maps -> pagina)', async () => {
    const { f, chiamate } = finto({ [SHORT]: [301, 'https://goo.gl/maps/Zz9'], 'https://goo.gl/maps/Zz9': [302, PIACE] });
    const r = await risolviLink(SHORT, f);
    expect(r.nome).toBe('Centro Sportivo Esempio');
    expect(chiamate).toHaveLength(2);
  });

  it('Location relativo: si risolve sull\'host corrente', async () => {
    const senza = 'https://www.google.com/maps?cid=1';
    const { f } = finto({ [SHORT]: [302, senza], [senza]: [302, '/maps/place/Campo+Relativo/@1.5,2.5,17z'] });
    const r = await risolviLink(SHORT, f);
    expect(r).toMatchObject({ nome: 'Campo Relativo', lat: 1.5, lng: 2.5, link_finale: 'https://www.google.com/maps/place/Campo+Relativo/@1.5,2.5,17z' });
  });

  it('forma del link "Condividi" dell\'app: maps.google.com?q=<Nome, indirizzo>: nome dal testo, nessuna coordinata, destination=<nome>', async () => {
    const q = 'https://maps.google.com?q=Centro+Sportivo+Esempio,+Via+Finta+1,+00000+Nessunluogo,+Italy&ftid=0x0:0x0&entry=gps&g_st=com.google.maps.preview.copy';
    const { f, chiamate } = finto({ [SHORT]: [302, q] });
    const r = await risolviLink(SHORT, f);
    expect(r.nome).toBe('Centro Sportivo Esempio');
    expect(r.lat).toBeUndefined();
    expect(r.url_indicazioni).toBe('https://www.google.com/maps/dir/?api=1&destination=Centro%20Sportivo%20Esempio');
    expect(chiamate).toHaveLength(1);
  });

  it('un link lungo gia\' completo si legge senza nessuna richiesta di rete', async () => {
    const { f, chiamate } = finto({});
    const r = await risolviLink(PIACE, f);
    expect(r.nome).toBe('Centro Sportivo Esempio');
    expect(chiamate).toHaveLength(0);
  });

  it('nome non ricavabile: nome assente, coordinate se ci sono, indicazioni da quelle', async () => {
    const { f } = finto({ [SHORT]: [302, 'https://www.google.com/maps/@45.5,9.5,17z'] });
    const r = await risolviLink(SHORT, f);
    expect(r.nome).toBeUndefined();
    expect(r.url_indicazioni).toBe('https://www.google.com/maps/dir/?api=1&destination=45.5,9.5');
  });

  it('ne\' nome ne\' coordinate: indicazioni = il link finale validato', async () => {
    const fine = 'https://www.google.com/maps?cid=12345';
    const { f, chiamate } = finto({ [SHORT]: [302, fine], [fine]: 200 });
    const r = await risolviLink(SHORT, f);
    expect(r).toEqual({ url_indicazioni: fine, link_finale: fine });
    expect(chiamate.map((c) => c.url)).toEqual([SHORT, fine]); // senza dati, la pagina si apre per vedere se rimanda altrove
  });

  it('la pagina senza dati che rimanda al posto: si segue', async () => {
    const senza = 'https://maps.google.com/?cid=12345';
    const { f } = finto({ [SHORT]: [302, senza], [senza]: [302, PIACE] });
    expect((await risolviLink(SHORT, f)).nome).toBe('Centro Sportivo Esempio');
  });
});

describe('risolviLink: consenso e controllo anti-robot di Google', () => {
  it('consent.google.com?continue=<url>: si usa continue (validato), consent non viene MAI richiesto', async () => {
    const consenso = `https://consent.google.com/m?continue=${encodeURIComponent(PIACE)}&gl=IT&m=0&pc=m&hl=it`;
    const { f, chiamate } = finto({ [SHORT]: [302, consenso] });
    const r = await risolviLink(SHORT, f);
    expect(r.nome).toBe('Centro Sportivo Esempio');
    expect(chiamate.map((c) => c.url)).toEqual([SHORT]);
  });
  it('un link incollato che e\' gia\' di consent: idem, senza richieste', async () => {
    const { f, chiamate } = finto({});
    expect((await risolviLink(`https://consent.google.com/ml?continue=${encodeURIComponent(PIACE)}`, f)).nome).toBe('Centro Sportivo Esempio');
    expect(chiamate).toHaveLength(0);
  });
  it('continue verso un host fuori lista, http, IP o mancante: rifiutato, e nessuna richiesta verso quell\'indirizzo', async () => {
    for (const cont of ['https://evil.example/x', 'http://www.google.com/maps', 'https://127.0.0.1/', 'javascript:alert(1)', '']) {
      const { f, chiamate } = finto({ [SHORT]: [302, `https://consent.google.com/m?continue=${encodeURIComponent(cont)}`] });
      const e = await esito(risolviLink(SHORT, f));
      expect(e, cont).toBeInstanceOf(ErroreApi);
      expect(e!.stato).toBe(400);
      expect(chiamate.map((c) => c.url), cont).toEqual([SHORT]);
    }
    const { f } = finto({ [SHORT]: [302, 'https://consent.google.com/m?gl=IT'] });
    expect((await esito(risolviLink(SHORT, f)))!.stato).toBe(400);
  });
  it('consent che rimanda a consent all\'infinito: si ferma ai redirect massimi', async () => {
    const giro = `https://consent.google.com/m?continue=${encodeURIComponent('https://consent.google.com/m?x=1')}`;
    const { f } = finto({});
    expect((await esito(risolviLink(giro, f)))!.stato).toBe(400);
  });
  it('/sorry/ (controllo anti-robot): non si segue; si torna con quello che c\'era', async () => {
    const q = 'https://maps.google.com?q=Centro+Sportivo+Esempio,+Via+Finta+1&ftid=0x0:0x0';
    const sorry = `https://www.google.com/sorry/index?continue=${encodeURIComponent(q)}&q=EhD`;
    const senza = 'https://maps.google.com/?cid=1';
    const { f, chiamate } = finto({ [SHORT]: [302, senza], [senza]: [302, sorry] });
    const r = await risolviLink(SHORT, f);
    expect(r).toEqual({ url_indicazioni: senza, link_finale: senza });
    expect(chiamate.map((c) => c.url)).toEqual([SHORT, senza]);
  });
});

describe('risolviLink: anti-SSRF', () => {
  it('host fuori lista a meta\' catena: rifiutato e MAI richiesto', async () => {
    for (const fuori of ['https://evil.example/steal', 'https://169.254.169.254/latest/meta-data/', 'https://127.0.0.1:8788/api/admin/campi', 'https://[::1]/', 'https://www.google.com.evil.example/maps', 'https://internal.service.local/']) {
      const { f, chiamate } = finto({ [SHORT]: [302, 'https://goo.gl/maps/Zz9'], 'https://goo.gl/maps/Zz9': [302, fuori] });
      const e = await esito(risolviLink(SHORT, f));
      expect(e, fuori).toBeInstanceOf(ErroreApi);
      expect(e!.stato, fuori).toBe(400);
      expect(chiamate.map((c) => c.url), fuori).toEqual([SHORT, 'https://goo.gl/maps/Zz9']);
    }
  });
  it('Location http:// verso un host ammesso: rifiutato (solo https), non richiesto', async () => {
    const { f, chiamate } = finto({ [SHORT]: [302, 'http://www.google.com/maps/place/X'] });
    expect((await esito(risolviLink(SHORT, f)))!.stato).toBe(400);
    expect(chiamate).toHaveLength(1);
  });
  it('Location verso IP (decimale, esadecimale, IPv6), intent:, data:, javascript:: rifiutato', async () => {
    for (const dove of ['https://2130706433/', 'https://0x7f000001/', 'https://[::ffff:7f00:1]/', 'intent://maps.app.goo.gl/x#Intent;end', 'data:text/html,x', 'javascript:alert(1)', '//evil.example/x', 'https://goo.gl/photos/x']) {
      const { f, chiamate } = finto({ [SHORT]: [302, dove] });
      const e = await esito(risolviLink(SHORT, f));
      expect(e, dove).toBeInstanceOf(ErroreApi);
      expect(chiamate, dove).toHaveLength(1);
    }
  });
  it('il PRIMO indirizzo e\' controllato come gli altri: http, IP, host fuori lista non partono nemmeno', async () => {
    for (const primo of ['http://maps.app.goo.gl/AbC', 'https://evil.example/maps', 'https://127.0.0.1/', 'https://[::1]/', 'https://169.254.169.254/', `https://www.google.com${AT}evil.example/`, 'https://www.google.com:444/maps', 'https://goo.gl/AbC', 'solo testo']) {
      const { f, chiamate } = finto({});
      const e = await esito(risolviLink(primo, f));
      expect(e, primo).toBeInstanceOf(ErroreApi);
      expect(e!.stato, primo).toBe(400);
      expect(chiamate, primo).toHaveLength(0);
    }
  });
  it('troppi redirect: il sesto e\' rifiutato (5 si seguono), e non si fa la richiesta successiva', async () => {
    const passi = (n: number) => Array.from({ length: n + 1 }, (_, i) => `https://goo.gl/maps/p${i}`);
    const catena = (n: number) => {
      const u = passi(n);
      const c: Record<string, Passo> = {};
      u.forEach((x, i) => { c[x] = i < n ? [302, u[i + 1]] : [302, PIACE]; });
      return finto(c);
    };
    const cinque = catena(4); // 1 richiesta iniziale + redirect: p0->p1->p2->p3->p4->PIACE = 5 redirect
    expect((await risolviLink('https://goo.gl/maps/p0', cinque.f)).nome).toBe('Centro Sportivo Esempio');
    expect(cinque.chiamate).toHaveLength(5);
    const sei = catena(5); // 6 redirect
    const e = await esito(risolviLink('https://goo.gl/maps/p0', sei.f));
    expect(e).toBeInstanceOf(ErroreApi);
    expect(e!.message).toMatch(/troppi reindirizzamenti/);
    expect(sei.chiamate.length).toBeLessThanOrEqual(6);
    expect(sei.chiamate.map((c) => c.url)).not.toContain('https://goo.gl/maps/p6');
  });
  it('redirect circolare: si ferma, al massimo 6 richieste', async () => {
    const { f, chiamate } = finto({ [SHORT]: [302, SHORT] });
    const e = await esito(risolviLink(SHORT, f));
    expect(e!.stato).toBe(400);
    expect(chiamate.length).toBeLessThanOrEqual(6);
  });
  it('il corpo della risposta non si legge mai (solo Location), e viene scartato', async () => {
    const letture: string[] = [];
    const risposta = () => {
      const r = new Response('<html>segreto</html>', { status: 302, headers: { Location: PIACE } });
      for (const m of ['text', 'json', 'arrayBuffer', 'blob', 'formData'] as const) vi.spyOn(r, m).mockImplementation(async () => { letture.push(m); return undefined as never; });
      const cancel = vi.spyOn(r.body!, 'cancel');
      return { r, cancel };
    };
    const { r, cancel } = risposta();
    const { f } = finto({ [SHORT]: () => r });
    await risolviLink(SHORT, f);
    expect(letture).toEqual([]);
    expect(cancel).toHaveBeenCalled();
  });
  it('timeout: una risposta che non arriva viene interrotta (502, non resta appesa)', async () => {
    const lento: FetchFn = (_url, init) => new Promise((_ok, no) => init.signal!.addEventListener('abort', () => no(new DOMException('aborted', 'AbortError'))));
    const t0 = Date.now();
    const e = await esito(risolviLink(SHORT, lento, { timeoutMs: 40 }));
    expect(e).toBeInstanceOf(ErroreApi);
    expect(e!.stato).toBe(502);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('il timeout e\' UNO per tutta la catena (non 5 s per passaggio)', async () => {
    let n = 0;
    const lento: FetchFn = (_url, init) => {
      n++;
      return new Promise((ok, no) => {
        const t = setTimeout(() => ok(new Response(null, { status: 302, headers: { Location: `https://goo.gl/maps/q${n}` } })), 25);
        init.signal!.addEventListener('abort', () => { clearTimeout(t); no(new DOMException('aborted', 'AbortError')); });
      });
    };
    const e = await esito(risolviLink(SHORT, lento, { timeoutMs: 60 }));
    expect(e!.stato).toBe(502);
    expect(n).toBeLessThan(6);
  });
});

describe('risolviLink: risposte strane di Google', () => {
  it('404 / 400 = link non riconosciuto (400); 5xx e rete = 502; 3xx senza Location = 502; mai un 500', async () => {
    expect((await esito(risolviLink(SHORT, finto({ [SHORT]: 404 }).f)))!.stato).toBe(400);
    expect((await esito(risolviLink(SHORT, finto({ [SHORT]: 400 }).f)))!.stato).toBe(400);
    expect((await esito(risolviLink(SHORT, finto({ [SHORT]: 503 }).f)))!.stato).toBe(502);
    expect((await esito(risolviLink(SHORT, finto({ [SHORT]: 302 }).f)))!.stato).toBe(502);
    expect((await esito(risolviLink(SHORT, finto({ [SHORT]: new TypeError('fetch failed') }).f)))!.stato).toBe(502);
  });
  it('200 sul link corto senza rimandare: si ferma col link e senza dati', async () => {
    const r = await risolviLink(SHORT, finto({ [SHORT]: 200 }).f);
    expect(r).toEqual({ url_indicazioni: SHORT, link_finale: SHORT });
  });
});

// ─── il finto Google delle prove nel browser ───
describe('fetchDiProva: solo nello sviluppo locale, mai in produzione', () => {
  const locale = new Request('http://localhost:8788/api/admin/campi/risolvi', { method: 'POST' });
  const PROVA = 'http://localhost:9009';
  const bypass = { DEV_ADMIN_BYPASS: '1', GOOGLE_MAPS_PROVA: PROVA };

  it('aperto: bypass + localhost + Access non configurato + variabile valida', () => {
    expect(fetchDiProva(locale, bypass)).toBeTypeOf('function');
    expect(fetchDiProva(locale, { ...bypass, ACCESS_TEAM_DOMAIN: 'DA_COMPILARE', ACCESS_AUD: 'DA_COMPILARE' })).toBeTypeOf('function');
  });
  it('chiuso in ogni altro caso', () => {
    const prod = new Request('https://terzo-tempo.pages.dev/api/admin/campi/risolvi', { method: 'POST' });
    const conRay = new Request('http://localhost:8788/x', { method: 'POST', headers: { 'Cf-Ray': 'abc' } });
    expect(fetchDiProva(prod, bypass)).toBeNull(); // sito vero
    expect(fetchDiProva(prod, { GOOGLE_MAPS_PROVA: PROVA })).toBeNull();
    expect(fetchDiProva(locale, { GOOGLE_MAPS_PROVA: PROVA })).toBeNull(); // senza bypass
    expect(fetchDiProva(locale, { ...bypass, DEV_ADMIN_BYPASS: '0' })).toBeNull();
    expect(fetchDiProva(conRay, bypass)).toBeNull(); // passata dall'edge di Cloudflare
    expect(fetchDiProva(locale, { ...bypass, ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', ACCESS_AUD: 'aud', EMAIL_AUTORIZZATE: 'a@b.invalid' })).toBeNull(); // Access configurato
    expect(fetchDiProva(locale, { DEV_ADMIN_BYPASS: '1' })).toBeNull(); // senza variabile
  });
  it('la variabile deve essere http://localhost o 127.0.0.1: un indirizzo esterno non apre la scorciatoia', () => {
    for (const v of ['https://localhost:9009', 'http://evil.example:9009', 'http://10.0.0.1:9009', 'http://localhost.evil.example', 'ftp://localhost', 'non un indirizzo', '']) {
      expect(fetchDiProva(locale, { ...bypass, GOOGLE_MAPS_PROVA: v }), v).toBeNull();
    }
    expect(fetchDiProva(locale, { ...bypass, GOOGLE_MAPS_PROVA: 'http://127.0.0.1:9009' })).toBeTypeOf('function');
  });
  it('spedisce la richiesta al finto Google con l\'host vero in X-Host-Simulato', async () => {
    const visto: { url: string; host: string | null }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string, init: RequestInit) => {
      visto.push({ url: u, host: new Headers(init.headers).get('X-Host-Simulato') });
      return new Response(null, { status: 302, headers: { Location: PIACE } });
    }));
    try {
      const f = fetchDiProva(locale, bypass)!;
      await f('https://maps.app.goo.gl/AbC123?x=1', { method: 'GET', redirect: 'manual', headers: { 'User-Agent': 'x' } });
      expect(visto).toEqual([{ url: `${PROVA}/AbC123?x=1`, host: 'maps.app.goo.gl' }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
