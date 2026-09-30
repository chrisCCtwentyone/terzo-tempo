import type { ReactNode, Ref } from 'react'
import { LATO_ALTO, pedine as calcolaPedine, type Pedina } from '../lib/campo'
import { voto } from '../lib/formato'
import type { Badge, Partita } from '../lib/tipi'
import { Cart } from './Cart'
import { Figurina } from './Figurina'
import { Pallone } from './Icone'
import { Bollino } from './Bollino'
import { Voto } from './Voto'

type Props = {
  giocatori: Partita['giocatori']
  squadre: Partita['squadre']
  /** mostra il voto in pagella sulla pedina (solo a partita giocata) */
  conVoti?: boolean
  /** id del giocatore MVP: porta il bollino sulla pedina */
  mvpId?: number | null
  badge?: (id: number) => Badge[] | undefined
}

/** Il campo verde con le pedine alle posizioni salvate dall'admin (ripiego automatico solo se mancano: lib/campo.ts). */
export function Campo({ giocatori, squadre, conVoti = true, mvpId = null, badge }: Props) {
  const tutte: Pedina[] = [...calcolaPedine(giocatori, 'A'), ...calcolaPedine(giocatori, 'B')]
  return (
    <>
      <Terreno squadre={squadre}>
        {tutte.map(({ g, x, y }, i) => (
          <div key={g.giocatore_id} className="ped" style={{ left: `${x.toFixed(1)}%`, top: `${y.toFixed(1)}%` }} role="group" aria-label={descrivi(g, conVoti)}>
            <div className="pin att" style={{ '--i': i } as React.CSSProperties}>
              <span className="figw">
                <Figurina id={g.giocatore_id} nome={g.nome} z={34} decorativa badge={badge?.(g.giocatore_id)} />
                {(g.gol > 0 || g.autogol > 0) && (
                  <span className="balls" aria-hidden="true">
                    {Array.from({ length: g.gol }, (_, k) => <Pallone key={`g${k}`} />)}
                    {Array.from({ length: g.autogol }, (_, k) => <Pallone key={`o${k}`} autogol />)}
                  </span>
                )}
                {mvpId === g.giocatore_id && <Bollino z={28} />}
              </span>
              <Cart nome={g.nome} />
              {conVoti && <Voto v={g.voto_pagella} />}
            </div>
          </div>
        ))}
      </Terreno>
      <div className="legend" aria-hidden="true">
        <span><Pallone />Gol</span>
        <span><Pallone autogol />Autogol</span>
        {conVoti && <span><b className="voto mid" style={{ boxShadow: 'none', fontSize: 12 }}>6,5</b>Voto</span>}
      </div>
    </>
  )
}

/** Il terreno di gioco: campo verde con le righe, l'orientamento (A in alto) e i nomi delle squadre; le pedine sono i figli. */
export function Terreno({ squadre, children, ref, className = '' }: { squadre: Partita['squadre']; children?: ReactNode; ref?: Ref<HTMLDivElement>; className?: string }) {
  const nome = (c: 'A' | 'B') => squadre.find((s) => s.codice === c)?.nome ?? c
  const alto = LATO_ALTO
  return (
    <div className={`pitch ${className}`} role="group" aria-label="Formazioni sul campo" ref={ref}>
      <svg className="lines" viewBox="0 0 90 160" preserveAspectRatio="none" aria-hidden="true">
        <rect x="4" y="4" width="82" height="152" />
        <path d="M4 80h82" />
        <circle cx="45" cy="80" r="11" />
        <circle cx="45" cy="80" r="1" style={{ fill: 'var(--pline)' }} />
        <rect x="24" y="4" width="42" height="18" />
        <rect x="34" y="4" width="22" height="7" />
        <rect x="24" y="138" width="42" height="18" />
        <rect x="34" y="149" width="22" height="7" />
        <path d="M37 22a9 9 0 0 0 16 0M37 138a9 9 0 0 1 16 0" />
      </svg>
      <span className="tag a">{nome(alto)}</span>
      <span className="tag b">{nome(alto === 'A' ? 'B' : 'A')}</span>
      {children}
    </div>
  )
}

function descrivi(g: Partita['giocatori'][number], conVoti: boolean) {
  const p = [g.nome]
  if (g.gol > 0) p.push(`${g.gol} gol`)
  if (g.autogol > 0) p.push(`${g.autogol} autogol`)
  if (conVoti) p.push(g.voto_pagella === null ? 'voto non disponibile' : `voto ${voto(g.voto_pagella)}`)
  return p.join(', ')
}
