/**
 * Simulatore di Cloudflare Access per le prove nel browser: un piccolo proxy davanti a `wrangler pages dev`
 * (senza bypass) che si comporta come Access davanti al sito vero:
 *  - modo 'completo': /admin* e /api/admin* rispondono 302 verso una pagina di login su un ALTRO sito
 *    (localhost invece di 127.0.0.1, l'indirizzo del sito: cross-origin, come *.cloudflareaccess.com);
 *  - modo 'solo-api': la pagina /admin* passa (sessione "scaduta" a meta' uso) ma /api/admin* rimanda al login.
 * Il resto passa al sito. Conta le richieste, cosi' le prove possono dire quante navigazioni di pagina
 * sono partite e se la SPA ha chiamato l'API.
 */
import http from 'node:http'

export type Simulato = { porta: number; stato: { documentiAdmin: number; apiAdmin: number; login: number }; chiudi: () => void }

export function avviaAccessSimulato(porta: number, portaSito: number, modo: 'completo' | 'solo-api'): Promise<Simulato> {
  const stato = { documentiAdmin: 0, apiAdmin: 0, login: 0 }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', `http://127.0.0.1:${porta}`)
    if (u.pathname.startsWith('/cdn-cgi/access/login')) {
      stato.login++
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!doctype html><meta charset="utf-8"><title>Login simulato</title><h1>Login simulato di Access</h1>')
      return
    }
    const pagina = /^\/admin(\/|$)/.test(u.pathname)
    const api = u.pathname.startsWith('/api/admin')
    if (pagina) stato.documentiAdmin++
    if (api) stato.apiAdmin++
    if (api || (pagina && modo === 'completo')) {
      res.writeHead(302, { Location: `http://localhost:${porta}/cdn-cgi/access/login/simulato?redirect_url=${encodeURIComponent(u.pathname)}` })
      res.end()
      return
    }
    const su = http.request({ host: 'localhost', port: portaSito, path: req.url, method: req.method, headers: { ...req.headers, host: `localhost:${portaSito}` } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers)
      r.pipe(res)
    })
    su.on('error', () => {
      res.writeHead(502)
      res.end()
    })
    req.pipe(su)
  })
  return new Promise((ok) => server.listen(porta, '127.0.0.1', () => ok({ porta, stato, chiudi: () => server.close() })))
}
