import { voto as fv, media as fm } from '../lib/formato'

/**
 * Grafico dei voti in pagella, SVG a mano (niente librerie). `voti` in ordine
 * cronologico; `mediaGenerale` (se c'e') e' la riga tratteggiata.
 */
export function GraficoVoti({ voti, mediaGenerale }: { voti: number[]; mediaGenerale: number | null }) {
  if (voti.length === 0) return null
  const x0 = 30, x1 = 326, top = 24, base = 124
  const minimo = Math.min(5, Math.floor(Math.min(...voti, mediaGenerale ?? 10)))
  const X = (i: number) => (voti.length === 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (voti.length - 1))
  const Y = (v: number) => base - ((v - minimo) / (10 - minimo)) * (base - top)
  const righe = Array.from({ length: 10 - minimo }, (_, k) => minimo + 1 + k)
  const ultimo = voti.length - 1
  const percorso = voti.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="chart" viewBox="0 0 340 150" role="img" aria-label={`Voti in pagella delle ultime ${voti.length} partite, dalla meno recente: ${voti.map(fv).join(', ')}`}>
      {righe.map((v) => (
        <g key={v}>
          <line className="gl" x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} />
          <text x={x0 - 8} y={Y(v) + 4} textAnchor="end">{v}</text>
        </g>
      ))}
      {mediaGenerale !== null && (
        <>
          <line className="avg" x1={x0} x2={x1} y1={Y(mediaGenerale)} y2={Y(mediaGenerale)} />
          <text className="avt" x={x0 + 4} y={Y(mediaGenerale) - 6}>media {fm(mediaGenerale)}</text>
        </>
      )}
      {voti.length > 1 && <path className="ln" pathLength="1" d={percorso} />}
      {voti.map((v, i) => (
        <circle key={i} className={i === ultimo ? 'pt last' : 'pt'} cx={X(i).toFixed(1)} cy={Y(v).toFixed(1)} r={i === ultimo ? 7 : 5} />
      ))}
      <text className="lv" x={Math.min(X(ultimo), x1 - 14)} y={Y(voti[ultimo]) - 13} textAnchor="middle">{fv(voti[ultimo])}</text>
    </svg>
  )
}
