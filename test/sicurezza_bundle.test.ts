/**
 * Nessun segreto nel bundle che va a tutti i browser (app/dist). Si esegue dopo `vite build`
 * (npm run build, scripts/pubblica.sh la fanno prima dei test); senza build non c'e' niente da controllare.
 *
 * "livello_segreto" e' ammesso SOLO nel pezzo dell'area admin (Admin-*.js, caricato a parte): il bundle
 * pubblico non lo deve nominare nemmeno come parola. Il dominio Zero Trust e l'AUD di Access non sono
 * segreti, ma non hanno motivo di stare nel browser: il frontend non verifica niente.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RADICE = join(import.meta.dirname, '..');
const DIST = join(RADICE, 'app', 'dist');
const file = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? file(join(dir, e.name)) : [join(dir, e.name)]));

describe.skipIf(!existsSync(DIST))('bundle di produzione (app/dist)', () => {
  const tutti = existsSync(DIST) ? file(DIST) : [];
  const testuali = tutti.filter((f) => /\.(js|css|html|map|json|txt)$/.test(f));
  const contenuto = (f: string) => readFileSync(f, 'utf8');
  const toml = readFileSync(join(RADICE, 'wrangler.toml'), 'utf8');
  const aud = /ACCESS_AUD = "([0-9a-f]{64})"/.exec(toml)?.[1] ?? '';
  const dominio = /ACCESS_TEAM_DOMAIN = "([^"]+)"/.exec(toml)?.[1] ?? '';
  const idDatabase = /database_id = "([^"]+)"/.exec(toml)?.[1] ?? '';

  it('ci sono file da controllare', () => {
    expect(testuali.length).toBeGreaterThan(3);
    expect(aud).toMatch(/^[0-9a-f]{64}$/);
    expect(dominio.length).toBeGreaterThan(5);
    expect(idDatabase.length).toBeGreaterThan(20);
  });

  it('nessun nome di variabile o valore di configurazione del backend', () => {
    for (const f of testuali) {
      const t = contenuto(f);
      for (const parola of ['EMAIL_AUTORIZZATE', 'ACCESS_AUD', 'ACCESS_TEAM_DOMAIN', 'DEV_ADMIN_BYPASS', 'CLOUDFLARE_API_TOKEN', 'cfut_', 'cfat_', 'Cf-Access-Jwt-Assertion', 'CF_Authorization', 'cloudflareaccess.com']) {
        expect(t, `${f}: "${parola}"`).not.toContain(parola);
      }
      expect(t, `${f}: AUD di Access`).not.toContain(aud);
      expect(t, `${f}: dominio Zero Trust`).not.toContain(dominio);
      expect(t, `${f}: database_id`).not.toContain(idDatabase);
    }
  });

  it('nessuna email, nessun token, nessuna chiave privata', () => {
    for (const f of testuali) {
      const t = contenuto(f);
      expect(t, f).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
      expect(t, f).not.toMatch(/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./); // JWT
      expect(t, f).not.toMatch(/\b(gh[pousr]_|sk-ant-|AKIA)[A-Za-z0-9_-]{16,}/);
      const email = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g) ?? [];
      // ammessi solo gli esempi delle etichette (nessuno, oggi)
      expect(email.filter((e) => !/@(example\.(org|com)|prova\.invalid)$/.test(e)), f).toEqual([]);
    }
  });

  it('il livello segreto sta solo nel pezzo admin, mai nel bundle pubblico', () => {
    const pubblici = testuali.filter((f) => /\.js$/.test(f) && !/[\\/]Admin-[^\\/]+\.js$/.test(f));
    expect(pubblici.length).toBeGreaterThan(0);
    for (const f of pubblici) expect(contenuto(f), f).not.toMatch(/livello_segreto|livello segreto/i);
  });

  it('niente source map (rivelerebbero il codice sorgente e i commenti)', () => {
    expect(tutti.filter((f) => f.endsWith('.map'))).toEqual([]);
    for (const f of testuali.filter((x) => x.endsWith('.js'))) expect(contenuto(f), f).not.toMatch(/sourceMappingURL/);
  });

  it('niente file inattesi nella cartella pubblicata (env, sql, tsv, pdf, backup, sorgenti)', () => {
    for (const f of tutti) expect(f, f).not.toMatch(/\.(env|sql|tsv|csv|sqlite|pdf|bak|orig|ts|tsx|toml|md)$|\.dev\.vars|(^|[\\/])\.git|wrangler|package/i);
  });

  it('nessuna risorsa esterna (URL http) nell\'HTML e nei CSS, tranne gli spazi dei nomi SVG', () => {
    for (const f of testuali.filter((x) => /\.(html|css)$/.test(x))) {
      const t = contenuto(f).replace(/http:\/\/www\.w3\.org\/\d+\/svg/g, '');
      expect(t, f).not.toMatch(/(src|href)=["']?https?:\/\//);
      expect(t, f).not.toMatch(/url\(["']?https?:\/\//);
      expect(t, f).not.toMatch(/@import\s+["']?https?:/);
    }
  });

  it('nessun script inline nella pagina (la CSP non li ammette)', () => {
    const html = contenuto(join(DIST, 'index.html'));
    for (const m of html.matchAll(/<script\b[^>]*>/g)) expect(m[0]).toMatch(/\bsrc=/);
    expect(html).not.toMatch(/<style\b|\sstyle=|\son[a-z]+=/i);
  });
});
