import './admin.css'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ErroreApi } from '../lib/api'
import { cambiaTema } from '../lib/tema'
import { useApi } from '../lib/useCarica'
import { Link, useRotta, useTitolo } from '../router'
import { Caricamento, Carta, Errore, Icona, Intestazione, Marchio, PulsanteLink } from '../ui'
import { IconaAdmin, SpriteAdmin } from './comuni'
import { GiocatoriAdmin } from './Giocatori'
import { BadgeAdmin } from './Badge'
import { CampiAdmin } from './Campi'
import { StagioniAdmin } from './Stagioni'
import { ElencoPartite, NuovaPartita } from './Partite'
import { PartitaAdmin } from './PartitaAdmin'

// L'area admin sta in un pezzo a parte (React.lazy in App.tsx): chi guarda solo i turni non la scarica.
// Accesso: in produzione /admin e /api/admin/* stanno dietro Cloudflare Access; qui basta chiedere
// GET /api/admin/me: 401/403 = non sei admin (nessun form di password). In locale vale il bypass del backend.

const SEZIONI: { chiave: string; verso: string; nome: string; icona: 'i-pitch' | 'i-user' | 'i-pin' | 'a-badge' | 'a-cal' }[] = [
  { chiave: 'partite', verso: '/admin/partite', nome: 'Partite', icona: 'i-pitch' },
  { chiave: 'giocatori', verso: '/admin/giocatori', nome: 'Giocatori', icona: 'i-user' },
  { chiave: 'campi', verso: '/admin/campi', nome: 'Campi', icona: 'i-pin' },
  { chiave: 'badge', verso: '/admin/badge', nome: 'Badge', icona: 'a-badge' },
  { chiave: 'stagioni', verso: '/admin/stagioni', nome: 'Stagioni', icona: 'a-cal' },
]

// --- accesso -----------------------------------------------------------------------------------------------
// /admin sta dietro Cloudflare Access, che chiede il codice via email SOLO se il browser chiede la pagina al
// server. Se invece la SPA si trova nell'area admin senza sessione (link vecchio, sessione scaduta), /api/admin/me
// risponde con un rinvio al login (opaqueredirect) o 401/403: si fa UNA navigazione di pagina vera verso l'indirizzo
// corrente, cosi' Access mostra il login e poi riporta qui. Un flag in sessionStorage impedisce i giri a vuoto: al
// secondo rifiuto si mostra "Area riservata" con un pulsante che rifa' la navigazione piena.

const CHIAVE_TENTATIVO = 'tt_admin_accesso'
/** Un tentativo gia' fatto in questa scheda? Senza sessionStorage si presume di si': meglio non rischiare un ciclo. */
function tentativoFatto(): boolean {
  try {
    return sessionStorage.getItem(CHIAVE_TENTATIVO) === '1'
  } catch {
    return true
  }
}
function segnaTentativo(fatto: boolean) {
  try {
    if (fatto) sessionStorage.setItem(CHIAVE_TENTATIVO, '1')
    else sessionStorage.removeItem(CHIAVE_TENTATIVO)
  } catch {
    // niente sessionStorage: resta la protezione di tentativoFatto()
  }
}
/** Navigazione di pagina VERA verso la pagina in cui si e' (non la SPA): e' quella che Access intercetta. */
const accediDaCapo = () => location.assign(location.pathname + location.search)

/** Serve un accesso (e non e' un guasto): rinvio al login, 401/403, o rete irraggiungibile mentre si e' online. */
const servAccesso = (e: ErroreApi | null) =>
  !!e && (e.accesso || e.stato === 401 || e.stato === 403 || (e.stato === 0 && navigator.onLine !== false))

/** Guscio minimo, senza menu ne' elenchi: e' tutto cio' che si vede finche' /api/admin/me non ha risposto 200. */
function Attesa({ children }: { children: ReactNode }) {
  return (
    <div className="wrap adm">
      <main id="contenuto" tabIndex={-1} className="er">{children}</main>
    </div>
  )
}

function Riservata() {
  useTitolo('Area riservata')
  return (
    <div className="wrap adm">
      <header className="brand">
        <Link verso="/" className="mark" aria-label="Terzo Tempo, vai alla home"><Marchio /><b>Terzo Tempo</b></Link>
        <button className="tbtn" type="button" onClick={cambiaTema} aria-label="Cambia tema chiaro o scuro"><Icona id="i-theme" /></button>
      </header>
      <main id="contenuto" tabIndex={-1} className="er">
        <Intestazione kick="Terzo Tempo · Admin" titolo="Area riservata agli admin" />
        <Carta className="riservata">
          <p><strong>Non hai il permesso di entrare qui.</strong></p>
          <p>Questa parte del sito serve a gestire giocatori, partite e voti, e la vedono solo gli admin. Se sei un admin, accedi con il codice che ricevi via email al tuo indirizzo.</p>
          <div className="more">
            <button type="button" className="btn yes" onClick={accediDaCapo}><Icona id="i-lock" />Accedi con il codice via email</button>
            <PulsanteLink verso="/">Torna al sito</PulsanteLink>
          </div>
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
    if (id === undefined && sez === 'campi') return <CampiAdmin />
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
  // fotografia all'apertura: l'effetto qui sotto segna il tentativo, il disegno deve ricordare com'era PRIMA
  const [giaProvato] = useState(tentativoFatto)
  const accesso = servAccesso(me.errore)
  useEffect(() => {
    window.scrollTo(0, 0)
    main.current?.focus({ preventScroll: true })
  }, [percorso, me.dati])
  useEffect(() => {
    if (me.dati) segnaTentativo(false) // dentro: la prossima volta si potra' riprovare da capo
    else if (accesso && !giaProvato) {
      segnaTentativo(true)
      accediDaCapo()
    }
  }, [me.dati, accesso, giaProvato])

  // Il guscio (menu, elenchi) compare SOLO dopo /api/admin/me = 200.
  if (!me.dati) {
    if (accesso) return giaProvato ? <Riservata /> : <Attesa><Caricamento testo="Apro l'accesso con codice via email…" /></Attesa>
    if (me.errore) return <Attesa><Errore errore={me.errore} onRiprova={me.ricarica} /></Attesa>
    return <Attesa><Caricamento testo="Verifica accesso…" /></Attesa>
  }
  const attiva = segmenti[1] ?? 'partite'

  return (
    <>
      <SpriteAdmin />
      <a className="salta" href="#contenuto" onClick={(e) => { e.preventDefault(); main.current?.focus() }}>Vai al contenuto</a>
      <div className="wrap adm">
        <header className="brand">
          <Link verso="/admin/partite" className="mark" aria-label="Terzo Tempo, area admin"><Marchio /><b>Terzo Tempo</b></Link>
          <button className="tbtn" type="button" onClick={cambiaTema} aria-label="Cambia tema chiaro o scuro"><Icona id="i-theme" /></button>
        </header>
        <div className="admbar">
          <span className="etich">Area admin</span>
          <Link verso="/" className="indietro"><IconaAdmin id="a-back" />Torna al sito</Link>
        </div>
        <main id="contenuto" ref={main} tabIndex={-1} key={percorso} className="er">
          <Contenuto segmenti={segmenti} />
        </main>
      </div>
      <nav className="nav adm" aria-label="Sezioni admin">
        <div className="nav-in cinque">
          {SEZIONI.map((s) => (
            <Link key={s.chiave} verso={s.verso} aria-current={attiva === s.chiave ? 'page' : undefined}>
              {s.icona.startsWith('a-') ? <IconaAdmin id={s.icona as 'a-badge' | 'a-cal'} /> : <Icona id={s.icona as 'i-pitch' | 'i-user' | 'i-pin'} />}
              {s.nome}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
