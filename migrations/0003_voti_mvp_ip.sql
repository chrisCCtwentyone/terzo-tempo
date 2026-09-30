-- Freno agli abusi del voto MVP: al massimo N voti per rete e per partita
-- (LIMITE_VOTI_PER_IP in functions/lib/costanti.ts).
--
-- `hash_ip` NON e' l'indirizzo IP: e' un pezzetto (16 bit) di un hash SHA-256 di
-- partita+indirizzo. Con 65.536 valori possibili ogni valore corrisponde a migliaia
-- di indirizzi diversi: serve a contare i voti "della stessa rete", non a
-- riconoscere una persona, e da qui nessuno risale all'indirizzo. NULL nei voti
-- registrati prima di questa migrazione (non contano per il limite).
ALTER TABLE voti_mvp ADD COLUMN hash_ip TEXT;
CREATE INDEX voti_mvp_per_rete ON voti_mvp (partita_id, hash_ip);
