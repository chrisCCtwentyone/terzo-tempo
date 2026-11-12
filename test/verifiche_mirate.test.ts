/**
 * Le regole di scripts/verifiche_mirate.mjs: da quali file cambiati dipendono le prove nel browser di pubblica.sh.
 * Un caso per ogni regola, piu' il giro completo per ogni percorso non previsto (nel dubbio si prova) e la prova a secco
 * dello script vero (`pubblica.sh --solo-piano --simula`, che non esegue niente).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classificaFile, REGOLE, riassuntoTrabocchi, SCHERMATE_PER_FILE, TUTTI_I_GRUPPI, valoreTrabocchi, verificheMirate } from '../scripts/verifiche_mirate.mjs';

const RADICE = join(import.meta.dirname, '..');
const TUTTI = { e2e: true, e2eAdmin: true };
const SOLO_PUBBLICO = { e2e: true, e2eAdmin: false };
const SOLO_ADMIN = { e2e: false, e2eAdmin: true };
const NESSUNO = { e2e: false, e2eAdmin: false };
const prove = (...files: string[]) => {
  const { e2e, e2eAdmin } = verificheMirate(files);
  return { e2e, e2eAdmin };
};

describe('regole per percorso', () => {
  it('area admin -> solo e2e admin', () => {
    expect(prove('app/src/admin/Campi.tsx')).toEqual(SOLO_ADMIN);
    expect(prove('app/src/admin/admin.css')).toEqual(SOLO_ADMIN);
    expect(prove('app/src/admin/Campi.tsx', 'app/src/admin/Partite.tsx')).toEqual(SOLO_ADMIN);
  });

  it('pagine pubbliche -> solo e2e pubblico', () => {
    expect(prove('app/src/pagine/Home.tsx')).toEqual(SOLO_PUBBLICO);
    expect(prove('app/src/pagine/Partita.tsx', 'app/src/pagine/Scheda.tsx')).toEqual(SOLO_PUBBLICO);
  });

  it.each([
    'app/src/ui/Carta.tsx',
    'app/src/stili/ui.css',
    'app/src/lib/api.ts',
    'app/index.html',
    'app/public/manifest.webmanifest',
    'app/public/icon-192.png',
    'shared/moduli.ts',
    'functions/_middleware.ts',
    'functions/api/admin/campi/index.ts',
    'migrations/0004_campi.sql',
    'vite.config.ts',
    'package.json',
    'package-lock.json',
    'e2e/impianto.ts',
    'e2e/trabocchi.ts',
  ])('parte comune %s -> tutti e due', (file) => {
    expect(prove(file)).toEqual(TUTTI);
  });

  it('un file e2e specifico -> solo il suo giro', () => {
    expect(prove('e2e/e2e.ts')).toEqual(SOLO_PUBBLICO);
    expect(prove('e2e/e2e_admin.ts')).toEqual(SOLO_ADMIN);
    // i finti e le visite che usa solo l'admin
    for (const f of ['e2e/live.ts', 'e2e/access_simulato.ts', 'e2e/google_simulato.ts', 'e2e/moduli.ts']) expect(prove(f), f).toEqual(SOLO_ADMIN);
    // l'elenco delle schermate del rilevatore lo usano tutti e due i giri
    expect(prove('e2e/schermate_trabocchi.ts')).toEqual(TUTTI);
  });

  it('solo documenti, test o altri script -> nessuna prova nel browser', () => {
    for (const f of ['README.md', 'CLAUDE.md', 'docs/DEPLOY.md', 'docs/anteprima-figurine.html', 'docs/logo/logo-figurina.svg', 'LICENSE', 'test/mvp.test.ts', 'test/aiuti.ts', 'scripts/controlla_produzione.sh', 'scripts/genera_icone.mjs']) {
      expect(prove(f), f).toEqual(NESSUNO);
    }
    expect(prove('docs/API.md', 'test/accesso.ts', 'scripts/controlla_produzione.sh')).toEqual(NESSUNO);
    // un .md a qualsiasi profondita' e' un documento
    expect(prove('app/src/admin/NOTE.md')).toEqual(NESSUNO);
  });

  it('pubblica.sh stesso, e la logica che sceglie le prove -> completo', () => {
    expect(prove('scripts/pubblica.sh')).toEqual(TUTTI);
    expect(prove('scripts/verifiche_mirate.mjs')).toEqual(TUTTI);
    expect(prove('scripts/verifiche_mirate.d.mts')).toEqual(TUTTI);
  });

  it('il seed di prova (i dati di tutte le prove nel browser) -> completo, anche se sta in scripts/', () => {
    expect(prove('scripts/seed_prova.sql')).toEqual(TUTTI);
  });
});

describe('nel dubbio si prova: percorso non previsto -> completo', () => {
  it.each([
    'app/src/App.tsx',
    'app/src/main.tsx',
    'app/src/router.tsx',
    'wrangler.toml',
    'tsconfig.json',
    'tsconfig.app.json',
    'vitest.config.ts',
    '.gitignore',
    '.npmrc',
    '.claude/settings.json',
    'e2e/nuovo_file_mai_visto.ts',
    'altra_cartella/qualcosa.ts',
    'scripts/sottocartella/script.sh',
    'app/src/admin2/Altro.tsx',
  ])('%s', (file) => {
    const r = verificheMirate([file]);
    expect({ e2e: r.e2e, e2eAdmin: r.e2eAdmin }).toEqual(TUTTI);
    expect(r.motivo).toContain('non previsto');
  });

  it('un solo percorso sconosciuto fra tanti documenti basta per il completo', () => {
    expect(prove('README.md', 'docs/DEPLOY.md', 'test/mvp.test.ts', 'app/src/App.tsx')).toEqual(TUTTI);
  });

  it('percorsi strani (fuori dalla radice, assoluti, con .., virgolette, vuoti di significato) -> completo', () => {
    for (const f of ['../fuori/README.md', '/etc/passwd', 'docs/../app/src/App.tsx', '"docs/con virgolette.md"', 'docs/./DEPLOY.md', 'docs\\..\\x.md']) {
      expect(prove(f), f).toEqual(TUTTI);
    }
  });

  it('un nome simile a una regola ma diverso non la eredita', () => {
    expect(prove('app/src/adminX/Altro.tsx')).toEqual(TUTTI);
    expect(prove('app/index.html.bak')).toEqual(TUTTI);
    expect(prove('docs')).toEqual(TUTTI); // la cartella stessa non e' un file della regola docs/**
    expect(prove('scripts/pubblica.sh.bak')).toEqual(NESSUNO); // scripts/* : un altro script, non quello vero
  });
});

describe('combinazioni e opzioni', () => {
  it('l\'insieme chiede l\'unione delle prove dei singoli file', () => {
    expect(prove('app/src/admin/Campi.tsx', 'app/src/pagine/Home.tsx')).toEqual(TUTTI);
    expect(prove('app/src/admin/Campi.tsx', 'docs/DEPLOY.md', 'test/x.test.ts')).toEqual(SOLO_ADMIN);
    expect(prove('app/src/pagine/Home.tsx', 'e2e/e2e.ts', 'README.md')).toEqual(SOLO_PUBBLICO);
    expect(prove('e2e/e2e.ts', 'e2e/e2e_admin.ts')).toEqual(TUTTI);
  });

  it('nessun file cambiato -> nessuna prova nel browser', () => {
    const r = verificheMirate([]);
    expect({ e2e: r.e2e, e2eAdmin: r.e2eAdmin }).toEqual(NESSUNO);
    expect(r.motivo).toContain('nessun file cambiato');
    expect(verificheMirate(['', '  ', '\n'])).toMatchObject(NESSUNO);
  });

  it('--completo forza tutto, qualunque file ci sia', () => {
    for (const files of [[], ['README.md'], ['docs/DEPLOY.md', 'test/mvp.test.ts']]) {
      const r = verificheMirate(files, { completo: true });
      expect({ e2e: r.e2e, e2eAdmin: r.e2eAdmin }).toEqual(TUTTI);
      expect(r.motivo).toContain('completo');
    }
  });

  it('percorsi con ./ e doppie barre si normalizzano', () => {
    expect(prove('./app/src/admin/Campi.tsx')).toEqual(SOLO_ADMIN);
    expect(prove('app//src//pagine/Home.tsx')).toEqual(SOLO_PUBBLICO);
  });

  it('i gruppi dicono quale regola ha deciso per quali file', () => {
    const r = verificheMirate(['app/src/admin/Campi.tsx', 'app/src/admin/Partite.tsx', 'docs/DEPLOY.md', 'app/src/App.tsx']);
    expect(r.gruppi.map((g) => [g.regola.split(' ')[0], g.file.length])).toEqual([['area', 2], ['documenti', 1], ['percorso', 1]]);
    expect(r.motivo).toMatch(/area admin.*e2e admin.*documenti.*nessuna prova nel browser.*non previsto.*e2e pubblico \+ admin/);
  });

  it('le regole non hanno percorsi doppi che si contraddicono', () => {
    // ogni percorso elencato nelle regole viene classificato dalla regola che lo elenca (nessuna ombra da una regola precedente),
    // tranne i modelli con `*` (controllati con un file d'esempio)
    for (const r of REGOLE) {
      for (const p of r.percorsi.filter((x) => !x.includes('*'))) expect(classificaFile(p).regola, p).toBe(r.nome);
    }
  });
});

describe('rilevatore di trabocchi: su quali schermate', () => {
  const trab = (...files: string[]) => verificheMirate(files).trabocchi;

  it('un file di pagina o di admin ben identificabile -> solo le schermate di quella pagina', () => {
    expect(trab('app/src/pagine/Scheda.tsx')).toEqual(['scheda']);
    expect(trab('app/src/pagine/Home.tsx')).toEqual(['home']);
    expect(trab('app/src/pagine/Classifiche.tsx')).toEqual(['classifiche']);
    expect(trab('app/src/admin/Badge.tsx')).toEqual(['admin-badge']);
    expect(trab('app/src/admin/Stagioni.tsx', 'app/src/pagine/Info.tsx')).toEqual(['info', 'admin-stagioni']);
  });

  it('i file importati da piu\' pagine valgono per tutte le loro pagine', () => {
    expect(trab('app/src/pagine/Diretta.tsx')).toEqual(['home', 'partita']);
    expect(trab('app/src/pagine/Mvp.tsx')).toEqual(['home', 'partita']);
    expect(trab('app/src/admin/Campi.tsx')).toEqual(['admin-partite', 'admin-campi']); // Campi.tsx sta dentro SceltaCampo
    expect(trab('app/src/admin/PartitaAdmin.tsx')).toEqual(['admin-partite', 'admin-live']);
    expect(trab('app/src/admin/CartaEditor.tsx')).toEqual(['admin-giocatori']);
  });

  it.each([
    'app/src/ui/Figurina.tsx',
    'app/src/stili/ui.css',
    'app/src/lib/api.ts',
    'shared/moduli.ts',
    'functions/_middleware.ts',
    'app/index.html',
    'e2e/impianto.ts',
    'e2e/trabocchi.ts',
    'e2e/schermate_trabocchi.ts',
    'e2e/e2e.ts',
    'e2e/e2e_admin.ts',
    'e2e/live.ts',
    'package.json',
    'package-lock.json',
    'scripts/pubblica.sh',
    'scripts/verifiche_mirate.mjs',
    'scripts/seed_prova.sql',
    // nel dubbio: un file di pagina/admin che la tabella non conosce, o un percorso non previsto
    'app/src/admin/Admin.tsx',
    'app/src/admin/comuni.tsx',
    'app/src/admin/admin.css',
    'app/src/pagine/NuovaPagina.tsx',
    'app/src/App.tsx',
    'wrangler.toml',
  ])('file comune o dubbio %s -> TUTTE le schermate', (file) => {
    expect(trab(file)).toBe('tutte');
  });

  it('solo documenti, test o altri script -> nessuna schermata; nessun file -> nessuna', () => {
    expect(trab('docs/API.md', 'test/mvp.test.ts', 'scripts/controlla_produzione.sh')).toBe('nessuna');
    expect(trab('app/src/admin/NOTE.md')).toBe('nessuna');
    expect(verificheMirate([]).trabocchi).toBe('nessuna');
  });

  it('un solo file comune fra tanti di pagina basta per tutte; --completo forza tutte', () => {
    expect(trab('app/src/pagine/Scheda.tsx', 'app/src/ui/Figurina.tsx')).toBe('tutte');
    expect(verificheMirate(['docs/API.md'], { completo: true }).trabocchi).toBe('tutte');
    expect(verificheMirate([], { completo: true }).trabocchi).toBe('tutte');
  });

  it('il valore per gli e2e e il piano per gli umani', () => {
    expect(valoreTrabocchi('tutte')).toBe('tutte');
    expect(valoreTrabocchi('nessuna')).toBe('nessuna');
    expect(valoreTrabocchi(['home', 'scheda'])).toBe('home,scheda');
    const r = verificheMirate(['app/src/pagine/Scheda.tsx']);
    const righe = riassuntoTrabocchi(r).join('\n');
    expect(righe).toMatch(/CONTROLLA solo le schermate di scheda \(app\/src\/pagine\/Scheda\.tsx\)/);
    expect(righe).toMatch(/SALTA home, classifiche.*admin-live.*nessun file cambiato le riguarda/);
    expect(riassuntoTrabocchi(verificheMirate(['app/src/lib/api.ts'])).join('\n')).toMatch(/CONTROLLA tutte le schermate.*app\/src\/lib\/api\.ts/);
    expect(riassuntoTrabocchi(verificheMirate([]), {}).join('\n')).toMatch(/SALTA tutte/);
    expect(riassuntoTrabocchi(verificheMirate([], { completo: true }), { completo: true }).join('\n')).toMatch(/CONTROLLA tutte.*completo/);
  });

  it('ogni regola che accende una prova nel browser accende anche il rilevatore (o dice perche\' no)', () => {
    for (const r of REGOLE) {
      if (r.prove.e2e || r.prove.admin) expect(r.schermate, r.nome).not.toEqual([]);
      else expect(r.schermate, r.nome).toEqual([]);
    }
  });

  it('i gruppi della tabella e delle schermate esistono davvero (nessun refuso)', () => {
    for (const r of SCHERMATE_PER_FILE) for (const g of r.gruppi) expect(TUTTI_I_GRUPPI, g).toContain(g);
    // i gruppi scritti nelle schermate (letti dal testo: importare e2e/ da qui lo farebbe compilare senza la libreria DOM)
    const gruppiDi = (file: string, da?: string) => {
      const t = readFileSync(join(RADICE, file), 'utf8');
      return new Set([...t.slice(da ? t.indexOf(da) : 0).matchAll(/gruppo: '([^']+)'/g)].map((m) => m[1]));
    };
    const pubbliche = gruppiDi('e2e/schermate_trabocchi.ts');
    const admin = gruppiDi('e2e/schermate_trabocchi.ts', 'export const schermateAdmin');
    const live = gruppiDi('e2e/live.ts', 'export const schermateLive');
    for (const g of [...pubbliche, ...admin, ...live]) expect(TUTTI_I_GRUPPI, g).toContain(g);
    // e ogni gruppo ha almeno una schermata
    const tutti = new Set([...pubbliche, ...admin, ...live]);
    for (const g of TUTTI_I_GRUPPI) expect(tutti.has(g), g).toBe(true);
  });
});

describe.skipIf(!existsSync(join(RADICE, '.git')))('pubblica.sh --solo-piano --simula (a secco: non esegue niente)', () => {
  const piano = (simula: string, ...altre: string[]) => {
    const env = { ...process.env };
    delete env.CLOUDFLARE_API_TOKEN;
    delete env.CLOUDFLARE_ACCOUNT_ID;
    return execFileSync('bash', ['scripts/pubblica.sh', '--solo-piano', '--simula', simula, ...altre], { cwd: RADICE, encoding: 'utf8', env });
  };

  it('solo documenti: salta tutte e due le prove nel browser', () => {
    const u = piano('docs/DEPLOY.md README.md test/verifiche_mirate.test.ts');
    expect(u).toContain('e2e pubblico: SALTA');
    expect(u).toContain('e2e admin:    SALTA');
    expect(u).toContain('Sempre: tsc -b, build, vitest (tutti), migrazioni D1, deploy, controllo del sito vero');
    expect(u).toContain('non e\' stato eseguito niente');
  });

  it('solo admin: fa solo e2e admin', () => {
    const u = piano('app/src/admin/Campi.tsx e2e/e2e_admin.ts');
    expect(u).toContain('e2e pubblico: SALTA');
    expect(u).toContain('e2e admin:    FA');
  });

  it('file comune: fa tutte e due', () => {
    const u = piano('app/src/ui/Carta.tsx docs/DEPLOY.md');
    expect(u).toContain('e2e pubblico: FA');
    expect(u).toContain('e2e admin:    FA');
  });

  it('percorso sconosciuto: completo', () => {
    const u = piano('app/src/App.tsx');
    expect(u).toContain('e2e pubblico: FA');
    expect(u).toContain('e2e admin:    FA');
  });

  it('--completo: fa tutte e due anche con soli documenti', () => {
    const u = piano('README.md', '--completo');
    expect(u).toContain('e2e pubblico: FA');
    expect(u).toContain('e2e admin:    FA');
  });

  it('solo la scheda giocatore: il rilevatore controlla solo la scheda e lo dice', () => {
    const u = piano('app/src/pagine/Scheda.tsx');
    expect(u).toContain('e2e pubblico: FA');
    expect(u).toContain('e2e admin:    SALTA');
    expect(u).toContain('CONTROLLA solo le schermate di scheda');
    expect(u).toContain('SALTA home, classifiche');
    expect(u).toContain('schermate scelte: scheda');
  });

  it('pagina admin: solo le sue schermate; le due prove in parallelo solo se servono tutte e due', () => {
    const a = piano('app/src/admin/Badge.tsx');
    expect(a).toContain('schermate scelte: admin-badge');
    expect(a).not.toContain('in parallelo');
    const b = piano('app/src/admin/Badge.tsx app/src/pagine/Info.tsx');
    expect(b).toContain('schermate scelte: info,admin-badge');
    expect(b).toContain('in parallelo');
  });

  it('file comune e --completo: tutte le schermate, a 2 larghezze', () => {
    expect(piano('app/src/ui/Figurina.tsx')).toContain('schermate scelte: tutte (2 larghezze: 320 e 390 px)');
    expect(piano('README.md', '--completo')).toContain('schermate scelte: tutte');
  });

  it('solo documenti: nessuna schermata e nessun rilevatore', () => {
    const u = piano('docs/API.md');
    expect(u).toContain('rilevatore di trabocchi: SALTA tutte');
    expect(u).not.toContain('schermate scelte');
  });

  it("--simula senza --solo-piano e' rifiutato: una pubblicazione vera non si decide su file inventati", () => {
    expect(() => execFileSync('bash', ['scripts/pubblica.sh', '--simula', 'README.md'], { cwd: RADICE, encoding: 'utf8', stdio: 'pipe' })).toThrow();
  });
});
