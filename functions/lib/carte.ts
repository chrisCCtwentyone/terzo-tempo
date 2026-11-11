/** Riconosce il tipo di un'immagine dai primi byte (magic bytes): del tipo dichiarato dal client non ci si fida. */

const inizia = (b: Uint8Array, firma: number[], da = 0) => firma.every((v, i) => b[da + i] === v);

export function tipoImmagine(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (inizia(b, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (inizia(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (inizia(b, [0x52, 0x49, 0x46, 0x46]) && inizia(b, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'; // "RIFF"....WEBP
  return null;
}
