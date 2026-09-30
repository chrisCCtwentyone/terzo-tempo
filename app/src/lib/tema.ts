// Tema chiaro / "album di notte": di base segue il sistema; la scelta a mano si ricorda
// (comodita' del singolo telefono, quindi localStorage con try/catch).
const CHIAVE = 'tt_tema'

/** Colore della barra del browser / dello schermo intero per tema: e' --paper di stili/tokens.css (un test li confronta). */
export const COLORE_TEMA = { light: '#f2e9d0', dark: '#12162a' } as const

/**
 * Le due <meta name="theme-color"> di index.html hanno un `media` che segue il SISTEMA. Se l'utente sceglie a mano un tema diverso
 * da quello del sistema, il colore della barra deve seguire il tema dell'app: si scrive lo stesso colore in tutte e due.
 */
function coloraBarra(tema: 'light' | 'dark') {
  for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', COLORE_TEMA[tema])
}

export function applicaTemaSalvato() {
  try {
    const t = localStorage.getItem(CHIAVE)
    if (t === 'light' || t === 'dark') {
      document.documentElement.setAttribute('data-theme', t)
      coloraBarra(t)
    }
  } catch {
    // storage non disponibile: resta il tema del sistema
  }
}

export function cambiaTema() {
  const r = document.documentElement
  const t = r.getAttribute('data-theme')
  const scuro = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
  const nuovo = scuro ? 'light' : 'dark'
  r.setAttribute('data-theme', nuovo)
  coloraBarra(nuovo)
  try {
    localStorage.setItem(CHIAVE, nuovo)
  } catch {
    // niente da fare: vale per questa visita
  }
}
