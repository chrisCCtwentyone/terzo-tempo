import './admin.css'
import { useEffect, useRef } from 'react'
import { ErroreApi } from '../lib/api'
import { cambiaTema } from '../lib/tema'
import { useApi } from '../lib/useCarica'
import { Link, useRotta, useTitolo } from '../router'
import { Caricamento, Carta, Errore, Icona, Intestazione, Pallone, PulsanteLink } from '../ui'
import { IconaAdmin, SpriteAdmin } from './comuni'
import { GiocatoriAdmin } from './Giocatori'
import { BadgeAdmin } from './Badge'
import { StagioniAdmin } from './Stagioni'
import { ElencoPartite, NuovaPartita } from './Partite'
import { PartitaAdmin } from './PartitaAdmin'

// L'area admin sta in un pezzo a parte (React.lazy in App.tsx): chi guarda solo i turni non la scarica.
// Accesso: in produzione /admin e /api/admin/* stanno dietro Cloudflare Access; qui basta chiedere
// GET /api/admin/me: 401/403 = non sei admin (nessun form di password). In locale vale il bypass del backend.

const SEZIONI: { chiave: string; verso: string; nome: string; icona: 'i-pitch' | 'i-user' | 'a-badge' | 'a-cal' }[] = [
  { chiave: 'partite', verso: '/admin/partite', nome: 'Partite', icona: 'i-pitch' },
  { chiave: 'giocatori', verso: '/admin/giocatori', nome: 'Giocatori', icona: 'i-user' },
  { chiave: 'badge', verso: '/admin/badge', nome: 'Badge', icona: 'a-badge' },
  { chiave: 'stagioni', verso: '/admin/stagioni', nome: 'Stagioni', icona: 'a-cal' },
]

function Riservata() {
  useTitolo('Area riservata')
  return (
    <div className="wrap adm">
      <header className="brand">
        <Link verso="/" className="mark" aria-label="Terzo Tempo, vai alla home"><Pallone size={26} /><b>Terzo Tempo</b></Link>
        <button className="tbtn" type="button" onClick={cambiaTema} aria-label="Cambia tema chiaro o scuro"><Icona id="i-theme" /></button>
      </header>
      <main id="contenuto" tabIndex={-1} className="er">
        <Intestazione kick="Terzo Tempo · Admin" titolo="Area riservata agli admin" />
        <Carta className="riservata">
          <p><strong>Non hai il permesso di entrare qui.</strong></p>
          <p>Questa parte del sito serve a gestire giocatori, partite e voti, e la vedono solo gli admin. Se sei un admin, accedi con il tuo indirizzo email e ricarica la pagina.</p>
          <div className="more"><PulsanteLink verso="/">Torna al sito</PulsanteLink></div>
        </Carta>
      </main>
    </div>
  )
}

function Contenuto({ segmenti }: { segmenti: string[] }) {
  const [, sez, id, ...resto] = segmenti
  if (resto.length === 0) {
    if (sez === undefined || (sez === 'partite' && id === undefined)) return <ElencoPartite />
    if (sez === 'partite' && id === 'nuova') return <NuovaPartita />
    if (sez === 'partite' && /^\d+$/.test(id)) return <PartitaAdmin key={id} id={Number(id)} />
    if (id === undefined && sez === 'giocatori') return <GiocatoriAdmin />
    if (id === undefined && sez === 'badge') return <BadgeAdmin />
    if (id === undefined && sez === 'stagioni') return <StagioniAdmin />
  }
  return (
    <>
      <Intestazione kick="Admin" titolo="Pagina non trovata" />
      <Carta className="vuota"><p>Questa pagina dell'area admin non esiste.</p><div className="more"><PulsanteLink verso="/admin/partite">Vai alle partite</PulsanteLink></div></Carta>
    </>
  )
}

export default function Admin() {
  useTitolo('Area admin')
  const { percorso, segmenti } = useRotta()
  const me = useApi<{ email: string | null }>('/api/admin/me')
  const main = useRef<HTMLElement>(null)
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [percorso, me.dati])

  const rifiutato = me.errore && (me.errore.stato === 401 || me.errore.stato === 403)
  if (rifiutato) return <Riservata />
  const attiva = segmenti[1] ?? 'partite'

  return (
    <>
      <SpriteAdmin />
      <a className="salta" href="#contenuto" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Vai al contenuto</a>
      <div className="wrap adm">
        <header className="brand">
          <Link verso="/admin/partite" className="mark" aria-label="Terzo Tempo, area admin"><Pallone size={26} /><b>Terzo Tempo</b></Link>
          <button className="tbtn" type="button" onClick={cambiaTema} aria-label="Cambia tema chiaro o scuro"><Icona id="i-theme" /></button>
        </header>
        <div className="admbar">
          <span className="etich">Area admin</span>
          <Link verso="/" className="indietro"><IconaAdmin id="a-back" />Torna al sito</Link>
        </div>
        <main id="contenuto" ref={main} tabIndex={-1} key={percorso} className="er">
          {me.dati ? <Contenuto segmenti={segmenti} /> : me.errore ? <Errore errore={me.errore as ErroreApi} onRiprova={me.ricarica} /> : <Caricamento testo="Controllo l'accesso…" />}
        </main>
      </div>
      <nav className="nav adm" aria-label="Sezioni admin">
        <div className="nav-in">
          {SEZIONI.map((s) => (
            <Link key={s.chiave} verso={s.verso} aria-current={attiva === s.chiave ? 'page' : undefined}>
              {s.icona.startsWith('a-') ? <IconaAdmin id={s.icona as 'a-badge' | 'a-cal'} /> : <Icona id={s.icona as 'i-pitch' | 'i-user'} />}
              {s.nome}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
