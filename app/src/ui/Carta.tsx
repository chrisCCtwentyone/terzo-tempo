import type { ReactNode } from 'react'

/** La carta con grana e ombra stampata. `att` = entra "attaccandosi" (con ritardo `i`). */
export function Carta({ children, className = '', att = false, i = 0 }: { children: ReactNode; className?: string; att?: boolean; i?: number }) {
  return (
    <div className={`card ${att ? 'att' : ''} ${className}`} style={att ? ({ '--i': i } as React.CSSProperties) : undefined}>
      {children}
    </div>
  )
}

/** Intestazione di pagina: sopratitolo + titolo grande con la sottolineatura rossa. */
export const Intestazione = ({ kick, titolo }: { kick: string; titolo: string }) => (
  <div className="hd">
    <p className="kick">{kick}</p>
    <h1>{titolo}</h1>
  </div>
)

/** Titolo di sezione col rombo giallo. */
export const Sezione = ({ children, id }: { children: ReactNode; id?: string }) => (
  <h2 className="sec" id={id}>
    <i aria-hidden="true" />
    {children}
  </h2>
)
