/**
 * Le regole di scripts/verifiche_mirate.mjs: da quali file cambiati dipendono le prove nel browser di pubblica.sh.
 * Un caso per ogni regola, piu' il giro completo per ogni percorso non previsto (nel dubbio si prova) e la prova a secco
 * dello script vero (`pubblica.sh --solo-piano --simula`, che non esegue niente).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classificaFile, REGOLE, verificheMirate } from '../scripts/verifiche_mirate.mjs';

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

  it("--simula senza --solo-piano e' rifiutato: una pubblicazione vera non si decide su file inventati", () => {
    expect(() => execFileSync('bash', ['scripts/pubblica.sh', '--simula', 'README.md'], { cwd: RADICE, encoding: 'utf8', stdio: 'pipe' })).toThrow();
  });
});
