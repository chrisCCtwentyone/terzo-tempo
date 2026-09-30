/**
 * Le schermate su cui gira il rilevatore di trabocchi (e2e/trabocchi.ts): TUTTE quelle dell'app, compresi i form aperti,
 * le righe espanse, le conferme e gli stati coi dati estremi di `aggiungiDatiEstremi()` (impianto.ts).
 * Ids: partite 10 (giocata), 11 (in convocazione), 5 (parita'), 101/110 (senza voti / MVP dell'admin), 100 (voto aperto),
 * 120 (giocata, nomi lunghi, stagione dal nome lungo), 121 (in convocazione, nomi lunghi); giocatori 1 (seed), 90-92 (lunghi).
 */
import type { Page } from 'playwright-core'
import type { Schermata } from './trabocchi.ts'

/** Le schermate della parte PUBBLICA. Partite 100/101/110 esistono solo nel seed di e2e.ts (preparaDati). */
export const schermatePubbliche = (conPartiteDiProva: boolean): Schermata[] => [
  { nome: 'home', url: '/' },
  { nome: 'classifiche gol', url: '/classifiche' },
  { nome: 'classifiche presenze', url: '/classifiche?cat=presenze' },
  { nome: 'classifiche media voto', url: '/classifiche?cat=media_voto' },
  { nome: 'classifiche mvp', url: '/classifiche?cat=mvp' },
  { nome: 'classifiche % vittorie', url: '/classifiche?cat=pct_vittorie' },
  { nome: 'classifiche tutte le stagioni', url: '/classifiche?stagione=sempre' },
  { nome: 'classifiche stagione lunga', url: '/classifiche?stagione=90' },
  { nome: 'partite elenco', url: '/partite' },
  { nome: 'partita giocata (10)', url: '/partite/10' },
  { nome: 'partita parita (5)', url: '/partite/5' },
  { nome: 'partita convocazione (11)', url: '/partite/11' },
  { nome: 'partita nomi lunghi (120)', url: '/partite/120' },
  { nome: 'partita convocazione nomi lunghi (121)', url: '/partite/121' },
  ...(conPartiteDiProva
    ? [
        { nome: 'partita voto aperto (100)', url: '/partite/100', attesa: '.vota' },
        {
          nome: 'partita voto aperto, conferma (100)',
          url: '/partite/100',
          attesa: '.vota',
          prepara: async (p: Page) => {
            await p.locator('.vota label').last().click()
            await p.getByRole('group', { name: 'Conferma del voto' }).waitFor()
          },
        },
        { nome: 'partita senza voti (101)', url: '/partite/101' },
        { nome: 'partita MVP dell\'admin (110)', url: '/partite/110' },
      ]
    : []),
  { nome: 'giocatori', url: '/giocatori' },
  { nome: 'scheda giocatore (1)', url: '/giocatori/1' },
  { nome: 'scheda giocatore nome lungo (90)', url: '/giocatori/90' },
  { nome: 'scheda giocatore parola lunga (91)', url: '/giocatori/91' },
  { nome: 'scheda giocatore inesistente', url: '/giocatori/999', attesa: '[role="alert"]' },
  { nome: 'info', url: '/info' },
  { nome: 'pagina non trovata', url: '/pagina-che-non-c-e' },
  { nome: 'area riservata (senza accesso)', url: '/admin', attesa: 'main h1' },
]

const clic = async (p: Page, nome: string | RegExp) => {
  await p.getByRole('button', { name: nome }).first().click()
}

/** Le schermate dell'area ADMIN (server col bypass locale). `senzaAccesso` = origine del server senza bypass. */
export const schermateAdmin = (senzaAccesso: string): Schermata[] => {
  const sez = (id: number, s: string, nome: string, prepara?: Schermata['prepara']): Schermata => ({ nome: `admin partita ${id} ${nome}`, url: `/admin/partite/${id}?sez=${s}`, attesa: 'main h1', prepara })
  return [
    { nome: 'admin partite elenco', url: '/admin/partite' },
    {
      nome: 'admin nuova partita (con convocati scelti)',
      url: '/admin/partite/nuova',
      attesa: '.conv-scelta label',
      prepara: async (p) => {
        await p.locator('.conv-scelta label').nth(0).click()
        await p.locator('.conv-scelta label').nth(8).click()
        await p.locator('.conv-scelta label').last().click()
        await p.getByLabel('Data e ora').fill('2026-10-22T21:00')
        await p.getByLabel('Campo', { exact: true }).selectOption({ label: 'Polisportiva Comunale Giovanni Battista Montefiascone-Vannozzi e Figli' })
      },
    },
    sez(10, 'convocati', 'convocati'),
    sez(10, 'squadre', 'squadre'),
    sez(10, 'campo', 'campo'),
    sez(10, 'risultato', 'risultato'),
    sez(10, 'mvp', 'mvp'),
    sez(10, 'partita', 'modifica'),
    sez(5, 'mvp', 'mvp parita'),
    sez(11, 'convocati', 'convocati'),
    sez(11, 'squadre', 'squadre'),
    sez(11, 'campo', 'campo'),
    sez(11, 'risultato', 'risultato'),
    sez(11, 'partita', 'modifica'),
    sez(120, 'squadre', 'squadre (nomi lunghi)'),
    sez(120, 'campo', 'campo (nomi lunghi)'),
    sez(120, 'risultato', 'risultato (nomi lunghi)'),
    sez(120, 'mvp', 'mvp (nomi lunghi)'),
    sez(120, 'partita', 'modifica (stagione lunga)'),
    sez(121, 'convocati', 'convocati (nomi lunghi)'),
    sez(121, 'squadre', 'squadre (nomi lunghi)'),
    sez(121, 'campo', 'campo (nomi lunghi)'),
    sez(121, 'partita', 'modifica (stagione lunga)'),
    { nome: 'admin giocatori elenco', url: '/admin/giocatori', attesa: '.riga-btn' },
    {
      nome: 'admin giocatori nuovo',
      url: '/admin/giocatori',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await clic(p, 'Nuovo giocatore')
        await p.getByLabel('Cognome', { exact: true }).fill('Pettirosso Montefiascone Vannozzi')
        await p.getByLabel(/Iniziali del nome/).fill('S.C.')
      },
    },
    {
      nome: 'admin giocatori modifica (nome lungo)',
      url: '/admin/giocatori',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await p.locator('.riga-btn', { hasText: 'Pettirosso' }).click()
        await p.locator('.lvl').waitFor()
      },
    },
    {
      nome: 'admin giocatori modifica (parola lunga)',
      url: '/admin/giocatori',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await p.locator('.riga-btn', { hasText: 'Wolfeschlegel' }).click()
        await p.locator('.lvl').waitFor()
      },
    },
    { nome: 'admin campi elenco', url: '/admin/campi', attesa: '.riga-btn' },
    {
      nome: 'admin campi nuovo (link e nome lunghi)',
      url: '/admin/campi',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await clic(p, 'Nuovo campo')
        await p.getByLabel('Link di Google Maps').fill('Guarda questo posto bellissimo e lunghissimo: https://maps.app.goo.gl/EsempioLinkMoltoLungoSenzaSpaziChePuoUscireDalCampoDiTestoDelModulo')
        await p.getByLabel('Nome del campo').fill('Polisportiva Comunale Giovanni Battista Montefiascone-Vannozzi e Figli')
      },
    },
    {
      nome: 'admin campi link non valido',
      url: '/admin/campi',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await clic(p, 'Nuovo campo')
        await p.getByLabel('Link di Google Maps').fill('https://evil.example/un/indirizzo/che/non/e/di/google/maps')
        await clic(p, 'Ricava nome')
        await p.getByText(/Non è un link di Google Maps/).waitFor()
      },
    },
    {
      nome: 'admin campi modifica (nome lungo)',
      url: '/admin/campi',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await p.locator('.riga-btn', { hasText: 'Polisportiva Comunale' }).click()
        await p.getByLabel('Nome del campo').waitFor()
      },
    },
    {
      nome: 'admin campi modifica (parola lunga)',
      url: '/admin/campi',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await p.locator('.riga-btn', { hasText: 'Supercalifragilistiche' }).click()
        await p.getByLabel('Nome del campo').waitFor()
      },
    },
    { nome: 'admin campi dalla partita (+ Nuovo campo)', url: '/admin/campi?nuovo=1', attesa: '.ricava' },
    { nome: 'admin badge elenco', url: '/admin/badge', attesa: '.riga-btn' },
    {
      nome: 'admin badge nuovo',
      url: '/admin/badge',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await clic(p, 'Nuovo badge')
        await p.getByLabel('Nome del badge').fill('Dribblomane Instancabile')
        await p.getByLabel('Descrizione (facoltativa)').fill('Corre, dribbla e non si ferma mai, nemmeno quando la partita e finita da un pezzo')
      },
    },
    {
      nome: 'admin badge modifica (nome lungo)',
      url: '/admin/badge',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await p.locator('.riga-btn', { hasText: 'Supercalifragilistichespiralidoso' }).click()
        await p.getByLabel('Nome del badge').waitFor()
      },
    },
    {
      nome: 'admin badge elimina (conferma)',
      url: '/admin/badge',
      attesa: '.riga-btn',
      prepara: async (p) => {
        await p.locator('.riga-btn', { hasText: 'Dribblomane Instancabile' }).click()
        await clic(p, 'Elimina')
        await p.getByRole('group', { name: 'Conferma' }).waitFor()
      },
    },
    { nome: 'admin stagioni elenco', url: '/admin/stagioni', attesa: '.stagione' },
    {
      nome: 'admin stagioni nuova',
      url: '/admin/stagioni',
      attesa: '.stagione',
      prepara: async (p) => {
        await clic(p, 'Nuova stagione')
        await p.getByLabel('Nome della stagione').fill('Stagione straordinaria dei campionati amichevoli 2026-27')
        await p.getByLabel('Data di inizio').fill('2026-10-01')
      },
    },
    {
      nome: 'admin stagioni rinomina (nome lungo)',
      url: '/admin/stagioni',
      attesa: '.stagione',
      prepara: async (p) => {
        await p.locator('.stagione', { hasText: 'straordinaria' }).getByRole('button', { name: 'Rinomina' }).click()
        await p.getByLabel(/Nuovo nome di/).waitFor()
      },
    },
    { nome: 'admin pagina non trovata', url: '/admin/pagina-che-non-c-e' },
    { nome: 'admin area riservata (senza accesso)', url: '/admin', base: senzaAccesso },
  ]
}
