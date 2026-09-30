import { lazy, Suspense, useEffect, useRef } from 'react'
import { cambiaTema } from './lib/tema'
import { Classifiche } from './pagine/Classifiche'
import { Giocatori } from './pagine/Giocatori'
import { Home } from './pagine/Home'
import { Info } from './pagine/Info'
import { NonTrovata } from './pagine/NonTrovata'
import { Partita } from './pagine/Partita'
import { Partite } from './pagine/Partite'
import { Scheda } from './pagine/Scheda'
import { Link, useRotta } from './router'
import { Caricamento, Icona, Marchio, Sprite, type IdIcona } from './ui'

// L'area admin e' un pezzo a parte: chi guarda solo i turni non la scarica.
const Admin = lazy(() => import('./admin/Admin'))

const SEZIONI: { chiave: string; verso: string; nome: string; icona: IdIcona }[] = [
  { chiave: '', verso: '/', nome: 'Home', icona: 'i-home' },
  { chiave: 'classifiche', verso: '/classifiche', nome: 'Classifiche', icona: 'i-rank' },
  { chiave: 'partite', verso: '/partite', nome: 'Partite', icona: 'i-pitch' },
  { chiave: 'giocatori', verso: '/giocatori', nome: 'Giocatori', icona: 'i-user' },
  { chiave: 'info', verso: '/info', nome: 'Info', icona: 'i-info' },
]

/** Quale pagina per questi segmenti dell'URL; sconosciuto = "non trovata". */
function Pagina({ segmenti }: { segmenti: string[] }) {
  const [sez, id, ...resto] = segmenti
  if (resto.length > 0) return <NonTrovata />
  switch (sez) {
    case undefined: return <Home />
    case 'classifiche': return id ? <NonTrovata /> : <Classifiche />
    case 'partite': return id ? <Partita id={id} /> : <Partite />
    case 'giocatori': return id ? <Scheda id={id} /> : <Giocatori />
    case 'info': return id ? <NonTrovata /> : <Info />
    default: return <NonTrovata />
  }
}

/** Posizione nel "giro" delle schermate, per far scorrere le pagine avanti o indietro. */
const rango = (segmenti: string[]) => (Math.max(0, SEZIONI.findIndex((s) => s.chiave === (segmenti[0] ?? ''))) + 1) * 10 + segmenti.length

export function App() {
  const { percorso, segmenti } = useRotta()
  const prec = useRef({ percorso, rango: rango(segmenti), verso: 'er' })
  if (prec.current.percorso !== percorso) {
    const r = rango(segmenti)
    prec.current = { percorso, rango: r, verso: r >= prec.current.rango ? 'er' : 'el' }
  }
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [percorso])
  const attiva = segmenti[0] ?? ''

  // L'area admin ha barra e navigazione proprie: niente header, navigazione e piede del sito pubblico.
  if (attiva === 'admin') {
    return (
      <>
        <Sprite />
        <Suspense fallback={<div className="wrap"><Caricamento testo="Carico l'area admin…" /></div>}><Admin /></Suspense>
      </>
    )
  }

  return (
    <>
      <Sprite />
      <a className="salta" href="#contenuto" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Vai al contenuto</a>
      <div className="wrap">
        <header className="brand">
          <Link verso="/" className="mark" aria-label="Terzo Tempo, vai alla home"><Marchio /><b>Terzo Tempo</b></Link>
          <button className="tbtn" type="button" onClick={cambiaTema} aria-label="Cambia tema chiaro o scuro"><Icona id="i-theme" /></button>
        </header>
        <main id="contenuto" ref={main} tabIndex={-1} key={percorso} className={prec.current.verso}>
          <Pagina segmenti={segmenti} />
        </main>
        <footer className="pie">
          {/* Link NORMALE, non del router: e' una navigazione di pagina vera, cosi' Cloudflare Access chiede il codice */}
          <a href="/admin" className="admin-cta">
            <Icona id="i-lock" />
            <span className="txt"><b>Area admin</b><small>Solo per gli admin · accesso con codice via email</small></span>
            <Icona id="i-arrow" />
          </a>
          <p className="credits">
            <span className="nw">Terzo Tempo · sviluppato da</span>{' '}
            <span className="nw">
              <a href="https://github.com/chrisCCtwentyone" target="_blank" rel="noopener noreferrer">chrisCCtwentyone</a>
              {' '}· <a href="https://github.com/chrisCCtwentyone/terzo-tempo" target="_blank" rel="noopener noreferrer">codice su GitHub</a>
            </span>
          </p>
        </footer>
      </div>
      <nav className="nav pub" aria-label="Schermate">
        <div className="nav-in cinque">
          {SEZIONI.map((s) => (
            <Link key={s.chiave} verso={s.verso} aria-current={attiva === s.chiave ? 'page' : undefined}>
              <Icona id={s.icona} />{s.nome}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
