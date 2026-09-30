import { media, numero } from '../lib/formato'
import { useBadge } from '../lib/listone'
import { CATEGORIE, type Categoria, type Classifiche as Dati, type Stagione } from '../lib/tipi'
import { useApi } from '../lib/useCarica'
import { useRotta, useTitolo, vai } from '../router'
import { Attesa, Carta, Errore, Intestazione, Riga, Scelta } from '../ui'

const SEMPRE = 'sempre' // valore del parametro dell'API e dell'URL
const TUTTE = 'Tutte le stagioni' // come si chiama per gli utenti
const MAX_PILLOLE = 4 // oltre, il selettore diventa una tendina

// Etichetta, unita' sotto il valore, colore della barra, formato del valore e scala della barra (null = relativa al primo).
const CAT: Record<Categoria, { etichetta: string; unita: string; colore: string; formato: (v: number) => string; scala: number | null }> = {
  gol: { etichetta: 'Gol', unita: 'gol', colore: 'var(--red)', formato: (v) => numero(v), scala: null },
  presenze: { etichetta: 'Presenze', unita: 'presenze', colore: 'var(--green)', formato: (v) => numero(v), scala: null },
  media_voto: { etichetta: 'Media voto', unita: 'media', colore: 'var(--k4)', formato: media, scala: 10 },
  mvp: { etichetta: 'MVP', unita: 'MVP', colore: 'var(--yellow)', formato: (v) => numero(v), scala: null },
  pct_vittorie: { etichetta: '% vittorie', unita: 'vittorie', colore: 'var(--blue)', formato: (v) => `${numero(v, 1)}%`, scala: 100 },
}

function nota(cat: Categoria, minimo: number): string | null {
  switch (cat) {
    case 'gol': return 'Non compare chi non ha segnato.'
    case 'presenze': return 'Presenza = in campo, con una squadra, in una partita giocata.'
    case 'media_voto': return minimo > 0 ? `Solo chi ha almeno ${minimo} partite con il voto in pagella.` : null
    case 'mvp': return 'Conta solo il voto chiuso con un vincitore: una parità non ancora decisa non dà MVP a nessuno.'
    case 'pct_vittorie': return `${minimo > 0 ? `Solo chi ha almeno ${minimo} presenze. ` : ''}Vittoria = più gol della squadra avversaria: il pareggio non conta.`
  }
}

function Elenco({ dati, cat }: { dati: Dati; cat: Categoria }) {
  const badge = useBadge()
  const c = CAT[cat]
  const righe = dati[cat]
  const max = righe.length ? righe[0].valore : 1
  const filtrata = dati.minimo_partite > 0 && (cat === 'media_voto' || cat === 'pct_vittorie')
  const spiegazione = nota(cat, dati.minimo_partite)
  return (
    <>
      {spiegazione && <p className="note">{spiegazione}</p>}
      {righe.length === 0 ? (
        <Carta className="vuota">{filtrata ? `Ancora nessuno con almeno ${dati.minimo_partite} partite.` : 'Ancora nessun dato per questo periodo.'}</Carta>
      ) : (
        <ol className="list" style={{ '--bc': c.colore } as React.CSSProperties}>
          {righe.map((r, i) => (
            <Riga key={r.giocatore_id} i={i} pos={r.posizione} id={r.giocatore_id} nome={r.nome} badge={badge(r.giocatore_id)} verso={`/giocatori/${r.giocatore_id}`}
              barra={c.scala ? (r.valore / c.scala) * 100 : (r.valore / max) * 100}
              valore={c.formato(r.valore)} unita={c.unita}
              nota={!r.attivo ? <em className="tu">Non attivo</em> : undefined} />
          ))}
        </ol>
      )}
    </>
  )
}

export function Classifiche() {
  useTitolo('Classifiche')
  const { parametri } = useRotta()
  const stagioni = useApi<{ stagioni: Stagione[] }>('/api/stagioni')
  const elenco = stagioni.dati?.stagioni ?? []
  const aperta = elenco.find((s) => s.aperta)
  // periodo dall'URL (condivisibile); senza, la stagione aperta se c'e', altrimenti tutte le stagioni
  const periodo = parametri.get('stagione') ?? (stagioni.dati ? (aperta ? String(aperta.id) : SEMPRE) : null)
  const cat = (CATEGORIE as readonly string[]).includes(parametri.get('cat') ?? '') ? (parametri.get('cat') as Categoria) : 'gol'
  const carico = useApi<Dati>(periodo === null ? null : `/api/classifiche?stagione=${encodeURIComponent(periodo)}`)

  const scegli = (p: string, c: Categoria) => vai(`/classifiche?stagione=${encodeURIComponent(p)}&cat=${c}`, { sostituisci: true })
  // un solo controllo: ogni stagione col suo nome (la piu' recente per prima, come le manda l'API), poi "Tutte le stagioni"
  const voci = [...elenco.map((s) => ({ valore: String(s.id), etichetta: s.nome })), { valore: SEMPRE, etichetta: TUTTE }]

  return (
    <>
      <Intestazione kick={`Terzo Tempo · ${carico.dati ? (carico.dati.stagione?.nome ?? TUTTE) : 'Classifiche'}`} titolo="Classifiche" />
      {stagioni.errore && <Errore errore={stagioni.errore} onRiprova={stagioni.ricarica} />}
      {stagioni.caricando && <Carta className="vuota">Carico le stagioni…</Carta>}
      {periodo !== null && (
        <>
          {elenco.length > MAX_PILLOLE ? (
            <select className="tendina" aria-label="Periodo" value={periodo} onChange={(e) => scegli(e.target.value, cat)}>
              {voci.map((v) => <option key={v.valore} value={v.valore}>{v.etichetta}</option>)}
            </select>
          ) : (
            <Scelta etichetta="Periodo" voci={voci} valore={periodo} onScegli={(p) => scegli(p, cat)} scorri />
          )}
          <Scelta etichetta="Classifica" voci={CATEGORIE.map((c) => ({ valore: c, etichetta: CAT[c].etichetta }))} valore={cat} onScegli={(c) => scegli(periodo, c)} />
          <Attesa carico={carico} testo="Carico la classifica…" figli={(d) => <Elenco dati={d} cat={cat} />} />
        </>
      )}
    </>
  )
}
