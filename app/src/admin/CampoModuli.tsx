import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { moduliPer } from '../../../shared/moduli'
import { pedine as automatiche } from '../lib/campo'
import type { Badge, Codice, Partita } from '../lib/tipi'
import { Cart, Figurina, Scelta, Terreno } from '../ui'
import { CODICI, agganciaA, casellaVerso, dentroMeta, impostaModulo, moduloDi, muoviInCasella, occupanti, squadraDi, type Freccia, type Riga } from './logica'

type Trascina = { id: number; c: Codice; pid: number; x: number; y: number; dx: number; dy: number; mosso: boolean }

const FRECCE = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']

/**
 * Il campo dell'admin: la squadra sceglie un modulo e i giocatori stanno sulle CASELLE del modulo
 * (posizioni ancorate, non libere). Si trascina col dito (pointer events, touch-action: none): al rilascio
 * la pedina si aggancia alla casella piu' vicina della SUA meta' campo; se e' occupata i due si scambiano.
 * Da tastiera: Invio/Spazio seleziona una pedina, poi le frecce la spostano di casella (o Invio su un'altra pedina).
 */
export function CampoModuli({ righe, squadre, onCambia, badge }: {
  righe: Riga[]
  squadre: Partita['squadre']
  onCambia: (r: Riga[]) => void
  badge?: (id: number) => Badge[] | undefined
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [drag, setDrag] = useState<Trascina | null>(null)
  const [annuncio, setAnnuncio] = useState('')
  const nomeSq = (c: Codice) => squadre.find((s) => s.codice === c)?.nome ?? c
  const dati = CODICI.map((c) => ({ c, n: squadraDi(righe, c).length, o: occupanti(righe, c) }))
  const nomeDi = (id: number) => righe.find((r) => r.giocatore_id === id)?.nome ?? ''

  function sposta(c: Codice, id: number, casella: number) {
    const dopo = muoviInCasella(righe, c, id, casella)
    if (dopo === righe) return
    const o = occupanti(righe, c)!
    const altroG = o.chi[casella]
    onCambia(dopo)
    setAnnuncio(`${nomeDi(id)} va in ${o.caselle[casella].ruolo}${altroG ? `, scambia con ${altroG.nome}` : ''}.`)
  }

  function attiva(c: Codice, id: number) {
    const selezionato = sel !== null ? righe.find((r) => r.giocatore_id === sel) : null
    const o = occupanti(righe, c)
    if (selezionato && selezionato.giocatore_id !== id && selezionato.squadra === c && o) {
      sposta(c, selezionato.giocatore_id, o.chi.findIndex((r) => r?.giocatore_id === id))
      setSel(null)
    } else setSel(sel === id ? null : id)
  }

  const percento = (e: PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }
  }

  function giu(e: PointerEvent<HTMLDivElement>, c: Codice, id: number, x: number, y: number) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = percento(e)
    setDrag({ id, c, pid: e.pointerId, x, y, dx: x - p.x, dy: y - p.y, mosso: false })
  }
  function muovi(e: PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pid) return
    const p = percento(e)
    const { x, y } = dentroMeta(drag.c, p.x + drag.dx, p.y + drag.dy)
    setDrag({ ...drag, x, y, mosso: drag.mosso || Math.hypot((x - drag.x) * 9, (y - drag.y) * 16) > 6 })
  }
  function su(e: PointerEvent<HTMLDivElement>) {
    if (!drag || e.pointerId !== drag.pid) return
    const d = drag
    setDrag(null)
    if (!d.mosso) return attiva(d.c, d.id)
    const o = occupanti(righe, d.c)
    if (o) {
      sposta(d.c, d.id, agganciaA(o.caselle, d.x, d.y))
      setSel(null)
    }
  }

  function tasto(e: KeyboardEvent<HTMLDivElement>, c: Codice, id: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      attiva(c, id)
    } else if (e.key === 'Escape') setSel(null)
    else if (FRECCE.includes(e.key)) {
      e.preventDefault()
      const o = occupanti(righe, c)
      if (!o) return
      const verso = casellaVerso(o.caselle, o.chi.findIndex((r) => r?.giocatore_id === id), e.key as Freccia)
      if (verso !== null) sposta(c, id, verso)
    }
  }

  return (
    <>
      {dati.map(({ c, n, o }) => (
        <div key={c} className="modulo-sq">
          <p className={`ph ${c === 'A' ? 'a' : 'b'}`}>{nomeSq(c)} · {n} {n === 1 ? 'giocatore' : 'giocatori'}</p>
          {n === 0 && <p className="note">Nessun giocatore in questa squadra: assegnali nella sezione Squadre.</p>}
          {n > 0 && moduliPer(n).length > 0 && (
            <Scelta
              etichetta={`Modulo ${nomeSq(c)}`}
              voci={[{ valore: 'auto', etichetta: 'Automatico' }, ...moduliPer(n).map((m) => ({ valore: m, etichetta: m }))]}
              valore={moduloDi(righe, c) ?? 'auto'}
              onScegli={(m) => { setSel(null); onCambia(impostaModulo(righe, c, m === 'auto' ? null : m)) }}
            />
          )}
          {n > 0 && moduliPer(n).length === 0 && (
            <p className="avviso" role="note">Con {n} giocatori non c'è nessun modulo (ci sono da 5 a 8 giocatori): le pedine restano nella disposizione automatica.</p>
          )}
          {n > 0 && moduliPer(n).length > 0 && !o && <p className="note">Scegli un modulo per posizionare i giocatori sulle caselle: adesso la disposizione è automatica.</p>}
        </div>
      ))}

      <Terreno squadre={squadre} ref={ref} className="edita">
        {dati.map(({ c, o }) =>
          o
            ? (
              <div key={c}>
                {o.caselle.map((k, i) => (
                  <span key={i} className={`cas${drag?.c === c ? ' vivo' : ''}${drag?.c === c && agganciaA(o.caselle, drag.x, drag.y) === i ? ' bersaglio' : ''}`} style={{ left: `${k.x}%`, top: `${k.y}%` }} aria-hidden="true" />
                ))}
                {o.chi.map((r, i) => {
                  if (!r) return null
                  const k = o.caselle[i]
                  const inDrag = drag?.id === r.giocatore_id
                  const x = inDrag ? drag!.x : k.x
                  const y = inDrag ? drag!.y : k.y
                  return (
                    <div
                      key={r.giocatore_id}
                      className={`ped mov${inDrag ? ' trascina' : ''}${sel === r.giocatore_id ? ' sel' : ''}`}
                      style={{ left: `${x}%`, top: `${y}%` }}
                      role="button"
                      tabIndex={0}
                      aria-pressed={sel === r.giocatore_id}
                      aria-label={`${r.nome}, ${k.ruolo}, ${nomeSq(c)}. Trascina su un'altra casella oppure premi Invio e usa le frecce.`}
                      onPointerDown={(e) => giu(e, c, r.giocatore_id, k.x, k.y)}
                      onPointerMove={muovi}
                      onPointerUp={su}
                      onPointerCancel={() => setDrag(null)}
                      onKeyDown={(e) => tasto(e, c, r.giocatore_id)}
                      onClick={(e) => { if (e.detail === 0) attiva(c, r.giocatore_id) }}
                      onBlur={() => { if (sel === r.giocatore_id && !drag) setSel(null) }}
                    >
                      <div className="pin">
                        <span className="figw">
                          <Figurina id={r.giocatore_id} nome={r.nome} z={34} decorativa badge={badge?.(r.giocatore_id)} />
                          {k.ruolo === 'portiere' && <span className="pt" aria-hidden="true">P</span>}
                        </span>
                        <Cart nome={r.nome} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
            : (
              <div key={c}>
                {automatiche(righe, c).map(({ g, x, y }) => (
                  <div key={g.giocatore_id} className="ped" style={{ left: `${x}%`, top: `${y}%` }} role="group" aria-label={`${g.nome}, ${nomeSq(c)}, disposizione automatica`}>
                    <div className="pin">
                      <span className="figw"><Figurina id={g.giocatore_id} nome={g.nome} z={34} decorativa badge={badge?.(g.giocatore_id)} /></span>
                      <Cart nome={g.nome} />
                    </div>
                  </div>
                ))}
              </div>
            ),
        )}
      </Terreno>
      <p className="note">
        <b>P</b> = portiere. Trascina una pedina sulla casella di un altro giocatore: si scambiano. Da tastiera: Invio sulla pedina, poi le frecce (o Invio su un'altra pedina).
        {dati.some((d) => d.o) && ` ${nomeSq('A')} e ${nomeSq('B')} restano ciascuna nella propria metà campo.`}
      </p>
      <p className="sr" role="status" aria-live="polite">{annuncio}</p>
    </>
  )
}
