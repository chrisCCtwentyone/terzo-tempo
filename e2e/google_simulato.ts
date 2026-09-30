/**
 * Un "Google Maps" finto per le prove nel browser (niente rete vera): un piccolo server su localhost al quale il server del sito
 * (wrangler pages dev, avviato con --binding GOOGLE_MAPS_PROVA=http://localhost:<porta>) spedisce le richieste che farebbe verso
 * Google per aprire i link "Condividi". Vale solo in locale: vedi `fetchDiProva` in functions/lib/maps.ts.
 *
 * Il server del sito decide gli host da una lista esatta e RI-VALIDA ogni Location sugli indirizzi veri di Google; qui arriva
 * l'host originale nell'intestazione X-Host-Simulato. Quindi la prova esercita tutta la difesa anti-SSRF: se il server
 * seguisse un redirect verso un host fuori lista, qui si vedrebbe arrivare una richiesta con quell'host (`fuoriLista`).
 *
 * Link di prova (nomi e coordinate di fantasia):
 *   maps.app.goo.gl/EsCentro     -> pagina del posto con nome, @ e !3d!4d (coordinate del posto)
 *   maps.app.goo.gl/EsApp        -> maps.google.com?q=<Nome, indirizzo>: il nome c'e' solo nel testo di ?q (forma dell'app)
 *   maps.app.goo.gl/EsSenzaNome  -> www.google.com/maps?cid=1, che non dice niente: nome da scrivere a mano
 *   maps.app.goo.gl/EsConsenso   -> consent.google.com?continue=<pagina del posto>
 *   maps.app.goo.gl/EsFuori      -> https://evil.example/ (host fuori lista)
 *   maps.app.goo.gl/EsNonEsiste  -> 404
 */
import http from 'node:http'

const AMMESSI = new Set(['maps.app.goo.gl', 'goo.gl', 'www.google.com', 'google.com', 'maps.google.com', 'www.google.it', 'google.it', 'consent.google.com'])

export const PAGINA_CENTRO = 'https://www.google.com/maps/place/Centro+Sportivo+Esempio+E2E/@44.2,10.2,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d44.1234567!4d10.7654321?entry=tts'

export type GoogleSimulato = { porta: number; richieste: string[]; fuoriLista: () => string[]; chiudi: () => void }

export function avviaGoogleSimulato(porta: number): Promise<GoogleSimulato> {
  const richieste: string[] = []
  const server = http.createServer((req, res) => {
    const host = String(req.headers['x-host-simulato'] ?? '')
    const u = new URL(req.url ?? '/', 'http://localhost')
    richieste.push(`${host}${u.pathname}`)
    const vai = (stato: number, dove?: string) => {
      res.writeHead(stato, dove ? { Location: dove, 'Content-Length': '0' } : { 'Content-Length': '0' })
      res.end()
    }
    if (host === 'maps.app.goo.gl') {
      switch (u.pathname) {
        case '/EsCentro': return vai(302, PAGINA_CENTRO)
        case '/EsApp': return vai(302, 'https://maps.google.com?q=Polisportiva+Senza+Coordinate,+Via+Finta+1,+00000+Nessunluogo,+Italy&ftid=0x0:0x0&entry=gps&g_st=com.google.maps.preview.copy')
        case '/EsSenzaNome': return vai(302, 'https://www.google.com/maps?cid=1')
        case '/EsConsenso': return vai(302, `https://consent.google.com/m?continue=${encodeURIComponent(PAGINA_CENTRO)}&gl=IT&hl=it`)
        case '/EsFuori': return vai(302, 'https://evil.example/steal')
        default: return vai(404)
      }
    }
    if (host === 'www.google.com' && u.pathname === '/maps') return vai(200)
    return vai(404)
  })
  return new Promise((ok) =>
    server.listen(porta, '127.0.0.1', () =>
      ok({ porta, richieste, fuoriLista: () => richieste.filter((r) => !AMMESSI.has(r.split('/')[0])), chiudi: () => server.close() }),
    ),
  )
}
