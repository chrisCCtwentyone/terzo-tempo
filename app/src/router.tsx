import { useEffect, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

// Router minimo basato sull'URL (History API): i link si condividono cosi' come sono.
// Snapshot = percorso + query; l'hash (#voto-mvp) non fa ri-renderizzare.

const EVENTO = 'tt:navigazione'
const url = () => location.pathname + location.search
const iscrivi = (cb: () => void) => {
  addEventListener('popstate', cb)
  addEventListener(EVENTO, cb)
  return () => {
    removeEventListener('popstate', cb)
    removeEventListener(EVENTO, cb)
  }
}

export const useUrl = () => useSyncExternalStore(iscrivi, url, () => '/')

export function vai(verso: string, opzioni?: { sostituisci?: boolean }) {
  history[opzioni?.sostituisci ? 'replaceState' : 'pushState'](null, '', verso)
  dispatchEvent(new Event(EVENTO))
}

/** Percorso e parametri dell'URL corrente. */
export function useRotta() {
  const u = useUrl()
  const [percorso, query = ''] = u.split('?')
  return { percorso, segmenti: percorso.split('/').filter(Boolean), parametri: new URLSearchParams(query) }
}

/** Link interno: click normale = navigazione senza ricaricare; cmd/ctrl/tasto centrale restano del browser. */
export function Link({ verso, onClick, ...resto }: { verso: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const clic = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    vai(verso)
  }
  return <a href={verso} onClick={clic} {...resto} />
}

/** Titolo della scheda del browser (utile anche quando si condivide il link). */
export function useTitolo(titolo: string) {
  useEffect(() => {
    document.title = `${titolo} · Terzo Tempo`
  }, [titolo])
}
