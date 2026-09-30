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

/** Un indirizzo dell'area admin (/admin, /admin/..., con query o hash). */
const versoAdmin = (verso: string) => /^\/admin(?:[/?#]|$)/.test(verso)
const dentroAdmin = () => /^\/admin(?:\/|$)/.test(location.pathname)

/**
 * Entrare in /admin DA FUORI dell'area admin e' sempre una navigazione di pagina vera: solo cosi' il browser chiede
 * /admin al server e Cloudflare Access puo' intercettarla e mostrare il login. Una navigazione della SPA non
 * arriverebbe mai al server: si vedrebbe il guscio dell'admin e poi un fetch verso l'API rimandato al login di Access
 * (redirect cross-origin bloccato: "server irraggiungibile"). Fra le pagine dell'admin invece si resta nella SPA.
 */
export const daPaginaVera = (verso: string) => versoAdmin(verso) && !dentroAdmin()

export function vai(verso: string, opzioni?: { sostituisci?: boolean }) {
  if (daPaginaVera(verso)) {
    location.assign(verso)
    return
  }
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
    if (daPaginaVera(verso)) return // lo lascia al browser: navigazione vera verso il server
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
