// Tema chiaro / "album di notte": di base segue il sistema; la scelta a mano si ricorda
// (comodita' del singolo telefono, quindi localStorage con try/catch).
const CHIAVE = 'tt_tema'

export function applicaTemaSalvato() {
  try {
    const t = localStorage.getItem(CHIAVE)
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t)
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
  try {
    localStorage.setItem(CHIAVE, nuovo)
  } catch {
    // niente da fare: vale per questa visita
  }
}
