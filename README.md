# Lettura a vista

Esercizi di solfeggio cantato nel browser: spartiti generati per livello, tonica e cadenza, metronomo con cursore, verifica in tempo reale di intonazione e ritmo dal microfono, riascolto di traccia e voce, storico dei risultati. Installabile come app (PWA), funziona offline.

Nessuna dipendenza da compilare: è una pagina statica. Per provarla in locale: `npx http-server -c-1` e apri `/?sim=1` per una voce simulata senza microfono.

Test della valutazione: `node tests/eval.mjs`.

Spartiti disegnati con [VexFlow](https://www.vexflow.com) (MIT).
