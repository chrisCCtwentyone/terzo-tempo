/** Icone, pallone e logo: un solo <Sprite/> nella pagina (in App), poi si richiamano per id con <use>. */
export function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="ball" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10.5" style={{ fill: 'var(--bf,#fff)' }} stroke="#1a1712" strokeWidth="2" />
          <path d="M12 7.2l4 2.9-1.5 4.7h-5L8 10.1z" fill="#1a1712" />
          <path d="M12 7.2V2M16 10.1l5-1.6M14.5 14.8l3 4.2M9.5 14.8l-3 4.2M8 10.1L3 8.5" stroke="#1a1712" strokeWidth="1.6" fill="none" />
        </symbol>
        <symbol id="logo" viewBox="0 0 512 512">
          <rect width="512" height="512" fill="#ffc629"/>
          <g transform="translate(18 18) rotate(-6 256 256)"><rect x="106" y="56" width="300" height="400" rx="10" fill="#1c1915"/></g>
          <g transform="rotate(-6 256 256)">
            <rect x="106" y="56" width="300" height="400" rx="10" fill="#fbf6e6" stroke="#1c1915" strokeWidth="16" strokeLinejoin="round"/>
            <rect x="138" y="90" width="236" height="236" fill="#1f4fd1" stroke="#1c1915" strokeWidth="12"/>
            <clipPath id="logo-ritaglio"><circle cx="256" cy="208" r="96"/></clipPath>
            <circle cx="256" cy="208" r="96" fill="#fff"/>
            <g clipPath="url(#logo-ritaglio)" fill="#1c1915" stroke="#1c1915" strokeLinejoin="round">
              <path d="M256.0 176.3L256.0 107.2" strokeWidth="5.8" fill="none" strokeLinecap="round"/>
              <path d="M286.1 198.2L351.9 176.9" strokeWidth="5.8" fill="none" strokeLinecap="round"/>
              <path d="M274.6 233.6L315.2 289.5" strokeWidth="5.8" fill="none" strokeLinecap="round"/>
              <path d="M237.4 233.6L196.8 289.5" strokeWidth="5.8" fill="none" strokeLinecap="round"/>
              <path d="M225.9 198.2L160.1 176.9" strokeWidth="5.8" fill="none" strokeLinecap="round"/>
              <polygon points="256.0,176.3 286.1,198.2 274.6,233.6 237.4,233.6 225.9,198.2" strokeWidth="3.48"/>
              <polygon points="297.2,151.3 287.8,122.3 312.4,104.4 337.1,122.3 327.7,151.3" strokeWidth="3.48"/>
              <polygon points="322.7,229.7 347.3,211.7 372.0,229.7 362.5,258.6 332.1,258.6" strokeWidth="3.48"/>
              <polygon points="256.0,278.1 280.7,296.0 271.2,325.0 240.8,325.0 231.3,296.0" strokeWidth="3.48"/>
              <polygon points="189.3,229.7 179.9,258.6 149.5,258.6 140.0,229.7 164.7,211.7" strokeWidth="3.48"/>
              <polygon points="214.8,151.3 184.3,151.3 174.9,122.3 199.6,104.4 224.2,122.3" strokeWidth="3.48"/>
            </g>
            <circle cx="256" cy="208" r="96" fill="none" stroke="#1c1915" strokeWidth="10.6"/>
            <rect x="138" y="352" width="236" height="60" fill="#d42a20" stroke="#1c1915" strokeWidth="12"/>
            <rect x="168" y="374" width="176" height="16" fill="#ffc629"/>
          </g>
        </symbol>
        <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></symbol>
        <symbol id="i-rank" viewBox="0 0 24 24"><path d="M3 21V12h5v9zM9.5 21V4h5v17zM16 21v-6h5v6z" /></symbol>
        <symbol id="i-pitch" viewBox="0 0 24 24"><rect x="2.5" y="4" width="19" height="16" rx="1" /><path d="M12 4v16" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7z" /></symbol>
        <symbol id="i-theme" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10.5" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.7" r="1.2" fill="currentColor" /></symbol>
        <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 11v6" /><circle cx="12" cy="7.6" r="1.1" fill="currentColor" /></symbol>
        <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21.5s-7-6.3-7-11.7a7 7 0 0 1 14 0c0 5.4-7 11.7-7 11.7z" /><circle cx="12" cy="9.8" r="2.6" /></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></symbol>
      </defs>
    </svg>
  )
}

export type IdIcona = 'i-home' | 'i-rank' | 'i-pitch' | 'i-user' | 'i-theme' | 'i-check' | 'i-arrow' | 'i-target' | 'i-lock' | 'i-info' | 'i-pin'

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

/**
 * Il marchio: la figurina del logo (docs/logo/logo-figurina.svg, stessi tratti del `<symbol id="logo">` qui sopra: un test li
 * confronta) in piccolo, per l'intestazione. Inline, niente <img>: la CSP non ne ha bisogno e l'immagine e' gia' in pagina.
 * Decorativo: accanto c'e' sempre il nome scritto.
 */
export const Marchio = ({ grande = false }: { grande?: boolean }) => (
  <svg className={grande ? 'logo grande' : 'logo'} aria-hidden="true" focusable="false">
    <use href="#logo" />
  </svg>
)
