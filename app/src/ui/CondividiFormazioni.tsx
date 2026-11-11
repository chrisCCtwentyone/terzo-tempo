import { useState } from 'react'
import { creaImmagineFormazioni } from '../lib/immagine_formazioni'
import type { Partita } from '../lib/tipi'
import { Pulsante } from './Pulsanti'

function scarica(file: File) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** "Condividi formazioni": genera l'immagine nel browser e apre il menu Condividi del telefono; se non c'e', la scarica. */
export function CondividiFormazioni({ partita }: { partita: Pick<Partita, 'id' | 'data_ora' | 'campo' | 'squadre' | 'giocatori'> }) {
  const [attesa, setAttesa] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function condividi() {
    setAttesa(true)
    setErrore(null)
    try {
      const nome = `formazioni-terzo-tempo-${partita.id}.png`
      const file = new File([await creaImmagineFormazioni(partita)], nome, { type: 'image/png' })
      if (!navigator.canShare?.({ files: [file] })) return scarica(file)
      try {
        await navigator.share({ files: [file], title: 'Formazioni Terzo Tempo' })
      } catch (e) {
        // NotAllowedError: il tocco e' "scaduto" mentre si preparava l'immagine (Safari): si scarica e basta
        if (e instanceof DOMException && e.name === 'NotAllowedError') scarica(file)
        else throw e
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setErrore('Non sono riuscito a preparare l’immagine. Riprova.')
    } finally {
      setAttesa(false)
    }
  }

  return (
    <div className="condividi-form">
      <Pulsante variante="ghost" className="blocco" onClick={condividi} disabled={attesa} aria-busy={attesa}>
        {attesa ? 'Preparo l’immagine…' : 'Condividi formazioni'}
      </Pulsante>
      {errore && <p className="errore-inline" role="alert">{errore}</p>}
    </div>
  )
}
