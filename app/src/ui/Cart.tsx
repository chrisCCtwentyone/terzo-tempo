/** Il cartellino col nome "Cognome I.": intero, con testo piu' piccolo se lungo e ellissi se ancora non basta. */
export const Cart = ({ nome, className = '' }: { nome: string; className?: string }) => (
  <span className={`cart${nome.length > 11 ? ' lungo' : ''} ${className}`} aria-hidden="true">{nome}</span>
)
