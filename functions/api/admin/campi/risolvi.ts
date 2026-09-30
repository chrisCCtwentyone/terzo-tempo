/**
 * POST /api/admin/campi/risolvi   { link }  ->  { nome?, lat?, lng?, url_indicazioni, link_finale }
 * Apre il link "Condividi" di Google Maps (segue i redirect a mano, solo verso host in lista: vedi functions/lib/maps.ts)
 * e ne ricava nome e posizione. Non scrive niente. Il nome puo' mancare: l'admin lo scrive a mano.
 */
import { MAX_LINK_CAMPO } from '../../../lib/costanti';
import { fetchDiProva, risolviLink } from '../../../lib/maps';
import { ErroreApi, json, leggiOggetto, perMetodo } from '../../../lib/risposta';

export const onRequest = perMetodo({
  POST: async ({ env, request }) => {
    const c = await leggiOggetto(request);
    if (typeof c.link !== 'string' || !c.link.trim()) throw new ErroreApi(400, 'link: incolla il link di Google Maps (tipo https://maps.app.goo.gl/...)');
    if (c.link.length > MAX_LINK_CAMPO) throw new ErroreApi(400, `link: testo di al massimo ${MAX_LINK_CAMPO} caratteri`);
    const f = fetchDiProva(request, env) ?? ((url, init) => fetch(url, init));
    return json(await risolviLink(c.link, f));
  },
});
