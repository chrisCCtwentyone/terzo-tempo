import { classeVoto, voto } from '../lib/formato'

/** Il voto in pagella (verde, giallo, rosso); `null` = "n.d.", mai un valore di ripiego. */
export const Voto = ({ v }: { v: number | null }) => (
  <span className={`voto ${classeVoto(v)}`} aria-label={v === null ? 'voto non disponibile' : `voto ${voto(v)}`}>
    {voto(v)}
  </span>
)
