import { useEffect, useRef, useState } from 'react'

/** true per un istante quando `valore` cambia (non al primo disegno): serve al punteggio che "salta". Con prefers-reduced-motion l'animazione e' spenta in CSS. */
export function useSalto(valore: number) {
  const prima = useRef(valore)
  const [salta, setSalta] = useState(false)
  useEffect(() => {
    if (prima.current === valore) return
    prima.current = valore
    setSalta(true)
    const t = setTimeout(() => setSalta(false), 700)
    return () => clearTimeout(t)
  }, [valore])
  return salta
}
