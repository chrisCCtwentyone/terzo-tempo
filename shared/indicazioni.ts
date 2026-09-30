/**
 * L'indirizzo che apre Google Maps sulle INDICAZIONI stradali verso un campo (app di Google Maps sul telefono se
 * c'e', altrimenti il sito, direttamente sulle indicazioni). In UN punto: il server lo costruisce per le API
 * (functions/lib/maps.ts) e il browser dell'admin lo usa per l'anteprima "Indicazioni".
 *
 * Sempre costruito qui, mai copiato da un testo dell'utente: il risultato e' SEMPRE https://www.google.com/maps/dir/...
 */

export const PREFISSO_INDICAZIONI = 'https://www.google.com/maps/dir/?api=1&destination=';

const cifre = (n: number) => n.toFixed(7).replace(/\.?0+$/, '');

/** Con coordinate: destination=lat,lng. Senza: il nome codificato. Senza nessuno dei due: null. */
export function indicazioni(d: { nome?: string | null; lat?: number | null; lng?: number | null }): string | null {
  if (typeof d.lat === 'number' && typeof d.lng === 'number' && Number.isFinite(d.lat) && Number.isFinite(d.lng)) {
    return `${PREFISSO_INDICAZIONI}${cifre(d.lat)},${cifre(d.lng)}`;
  }
  if (d.nome && d.nome.trim()) return PREFISSO_INDICAZIONI + encodeURIComponent(d.nome.trim());
  return null;
}
