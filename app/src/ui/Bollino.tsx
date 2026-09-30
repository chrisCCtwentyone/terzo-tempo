/** Il bollino MVP che timbra (animazione in CSS, spenta con prefers-reduced-motion). */
export const Bollino = ({ z, testo = 'MVP', sotto }: { z?: number; testo?: string; sotto?: string }) => (
  <span className="stamp" role="img" aria-label={sotto ? `${testo} ${sotto}` : testo} style={z ? ({ '--s': `${z}px` } as React.CSSProperties) : undefined}>
    <span>
      {testo}
      {sotto && <small>{sotto}</small>}
    </span>
  </span>
)
