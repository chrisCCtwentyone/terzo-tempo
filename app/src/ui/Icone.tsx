/** Icone e pallone: un solo <Sprite/> nella pagina (in App), poi si richiamano per id con <use>. */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="ball" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10.5" style={{ fill: 'var(--bf,#fff)' }} stroke="#1a1712" strokeWidth="2" />
          <path d="M12 7.2l4 2.9-1.5 4.7h-5L8 10.1z" fill="#1a1712" />
          <path d="M12 7.2V2M16 10.1l5-1.6M14.5 14.8l3 4.2M9.5 14.8l-3 4.2M8 10.1L3 8.5" stroke="#1a1712" strokeWidth="1.6" fill="none" />
        </symbol>
        <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></symbol>
        <symbol id="i-rank" viewBox="0 0 24 24"><path d="M3 21V12h5v9zM9.5 21V4h5v17zM16 21v-6h5v6z" /></symbol>
        <symbol id="i-pitch" viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="16" rx="1" /><path d="M12 4v16" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7z" /></symbol>
        <symbol id="i-theme" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10.5" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.7" r="1.2" fill="currentColor" /></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></symbol>
      </defs>
    </svg>
  )
}

export type IdIcona = 'i-home' | 'i-rank' | 'i-pitch' | 'i-user' | 'i-theme' | 'i-check' | 'i-arrow' | 'i-target' | 'i-lock'

export const Icona = ({ id }: { id: IdIcona }) => (
  <svg className="ico" aria-hidden="true">
    <use href={`#${id}`} />
  </svg>
)

/** Pallone da calcio: gol, oppure autogol (rosso). Decorativo: il testo accanto dice cosa e'. */
export const Pallone = ({ autogol = false, size }: { autogol?: boolean; size?: number }) => (
  <svg className={autogol ? 'ball og' : 'ball'} style={size ? { width: size, height: size } : undefined} aria-hidden="true">
    <use href="#ball" />
  </svg>
)
