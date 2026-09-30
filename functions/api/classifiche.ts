/** GET /api/classifiche?stagione=<id>|sempre (default: sempre). */
import { leggiStagione } from '../lib/partite';
import { json, perMetodo } from '../lib/risposta';
import { classifiche, totaliStagione } from '../lib/statistiche';

export const onRequest = perMetodo({
  GET: async ({ env, request }) => {
    const stagione = await leggiStagione(env.DB, new URL(request.url).searchParams.get('stagione'));
    return json({ stagione, ...classifiche(await totaliStagione(env.DB, stagione?.id ?? null)) });
  },
});
