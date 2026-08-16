# Qualità dell'aria

PWA mobile per esplorare e confrontare la qualità dell'aria nel tempo.

## v0.1.1

- aggiunta visualizzazione a zone/heatmap interpolata sopra la cartografia
- mantenuti i punti delle stazioni sopra le zone colorate
- modalità **Confronto** trasformata in confronto Swipe reale con due mappe sovrapposte
- divisore verticale trascinabile e mappe sincronizzate per posizione e zoom
- modalità **Differenza** con aree verdi (miglioramento) e rosse (peggioramento)
- pulsante esplicito **Installa app** al posto del simbolo `+`
- migliorata la gestione cache/service worker per gli aggiornamenti su GitHub Pages
- nessun workflow GitHub Actions: il progetto è pensato per GitHub Pages `Deploy from a branch` su `main / root`

> I valori presenti in `data/rome-demo.json` sono sintetici e servono solo allo sviluppo dell'interfaccia. Le zone colorate sono un'interpolazione visuale dei punti demo, non una misura territoriale reale.

## Sorgenti previste

EEA, CAMS e OpenAQ. Le integrazioni reali verranno aggiunte mantenendo un formato interno normalizzato.
