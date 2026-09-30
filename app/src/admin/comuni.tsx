// Pezzi comuni delle schermate admin: esito delle scritture, conferma nella pagina, campi, contatori.
import { useId, useState, type ReactNode } from 'react'
import { ErroreApi } from '../lib/api'
import { Icona, Pallone, Pulsante } from '../ui'

// ---- esito delle scritture: "Salvataggio…", "Salvato", errore testuale ----

export type Esito = { fase: 'fermo' | 'salvo' | 'ok' | 'errore'; testo: string }

const frase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.')

/**
 * `esegui` mostra "salvataggio…", poi l'esito. Se la scrittura fallisce ritorna null e
 * l'errore del server (o la spiegazione di `spiega`) resta scritto: chi chiama NON
 * azzera i dati inseriti, quindi non si perde niente.
 */
export function useEsito() {
  const [esito, setEsito] = useState<Esito>({ fase: 'fermo', testo: '' })
  async function esegui<T>(cosa: string, f: () => Promise<T>, fatto: string | ((r: T) => string), spiega?: (e: ErroreApi) => string | undefined): Promise<T | null> {
    setEsito({ fase: 'salvo', testo: cosa })
    try {
      const r = await f()
      setEsito({ fase: 'ok', testo: typeof fatto === 'function' ? fatto(r) : fatto })
      return r
    } catch (e) {
      const er = e instanceof ErroreApi ? e : new ErroreApi(0, 'Qualcosa è andato storto. Riprova.')
      setEsito({ fase: 'errore', testo: frase(spiega?.(er) ?? er.message) })
      return null
    }
  }
  return { esito, esegui, occupato: esito.fase === 'salvo', azzera: () => setEsito({ fase: 'fermo', testo: '' }) }
}

export function EsitoScrittura({ esito }: { esito: Esito }) {
  if (esito.fase === 'fermo') return null
  if (esito.fase === 'errore') return <p className="esito errore" role="alert">{esito.testo}</p>
  return (
    <p className={`esito ${esito.fase}`} role="status">
      {esito.fase === 'salvo' ? <Pallone /> : <Icona id="i-check" />}
      <span>{esito.fase === 'salvo' ? `${esito.testo}…` : esito.testo}</span>
    </p>
  )
}

// ---- conferma nella pagina (mai confirm()) ----

export function Conferma({ domanda, conferma, onConferma, onAnnulla, occupato, pericolo = false }: {
  domanda: ReactNode
  conferma: string
  onConferma: () => void
  onAnnulla: () => void
  occupato?: boolean
  pericolo?: boolean
}) {
  return (
    <div className="conferma" role="group" aria-label="Conferma">
      <p>{domanda}</p>
      <div className="azioni">
        <Pulsante variante={pericolo ? 'no' : 'yes'} onClick={onConferma} disabled={occupato} aria-busy={occupato}>{occupato ? 'Attendi…' : conferma}</Pulsante>
        <Pulsante onClick={onAnnulla} disabled={occupato}>Annulla</Pulsante>
      </div>
    </div>
  )
}

// ---- campi di un modulo ----

export function Fld({ etichetta, aiuto, errore, children }: {
  etichetta: string
  aiuto?: string
  errore?: string | null
  /** riceve gli attributi da mettere sul controllo (id, aria-describedby, aria-invalid) */
  children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode
}) {
  const id = useId()
  const nota = errore ? `${id}-e` : aiuto ? `${id}-a` : undefined
  return (
    <div className="fld">
      <label htmlFor={id}>{etichetta}</label>
      {children({ id, 'aria-describedby': nota, 'aria-invalid': errore ? true : undefined })}
      {errore ? <p className="err" id={`${id}-e`}>{errore}</p> : aiuto ? <p className="note" id={`${id}-a`}>{aiuto}</p> : null}
    </div>
  )
}

// ---- contatore con + e - grandi ----

export function Contatore({ etichetta, valore, onCambia, max = 99, autogol = false }: {
  etichetta: string
  valore: number
  onCambia: (v: number) => void
  max?: number
  autogol?: boolean
}) {
  return (
    <div className={`cnt${autogol ? ' og' : ''}`} role="group" aria-label={etichetta}>
      <button type="button" aria-label={`Uno in meno: ${etichetta}`} disabled={valore <= 0} onClick={() => onCambia(valore - 1)}>−</button>
      <output aria-label={`${etichetta}: ${valore}`}>{valore}</output>
      <button type="button" aria-label={`Uno in più: ${etichetta}`} disabled={valore >= max} onClick={() => onCambia(valore + 1)}>+</button>
    </div>
  )
}

// ---- livello segreto: controllo a 5 passi ----

const BLOCCO = '5 = il più forte, 1 = il più debole'

export function ScalaLivello({ valore, onCambia }: { valore: number | null; onCambia: (v: number | null) => void }) {
  return (
    <div className="lvl-box">
      <div className="lvl" role="radiogroup" aria-label="Livello segreto">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={valore === n} className={valore !== null && n <= valore ? 'pieno' : ''} onClick={() => onCambia(valore === n ? null : n)}>
            <span className="sr">Livello </span>{n}
          </button>
        ))}
      </div>
      <p className="note">{valore === null ? 'Nessun livello assegnato' : `Livello ${valore}`} · {BLOCCO}. Tocca di nuovo il livello scelto per toglierlo.</p>
      <p className="segreto"><IconaAdmin id="a-lock" />Visibile solo agli admin: non compare mai nel sito pubblico.</p>
    </div>
  )
}

/** Sprite delle icone solo admin (le altre stanno in ui/Icone). */
export function SpriteAdmin() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="a-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></symbol>
        <symbol id="a-badge" viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" /></symbol>
        <symbol id="a-cal" viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></symbol>
        <symbol id="a-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
        <symbol id="a-back" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6" /></symbol>
      </defs>
    </svg>
  )
}

export const IconaAdmin = ({ id }: { id: 'a-lock' | 'a-badge' | 'a-cal' | 'a-plus' | 'a-back' }) => (
  <svg className="ico" aria-hidden="true"><use href={`#${id}`} /></svg>
)
