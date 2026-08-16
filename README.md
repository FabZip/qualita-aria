# Qualità dell'aria

PWA mobile per esplorare e confrontare la qualità dell'aria nel tempo.

## v0.1.3

Questa versione elimina il fallback ai dati demo: **tutto ciò che viene mostrato dalle fonti selezionabili proviene da fonti pubbliche reali**.

### Fonti attive

#### EEA · stazioni
- servizio ArcGIS ufficiale `AQ_Statistics_WM`
- area iniziale: Roma
- PM2.5, PM10, NO₂
- statistiche annuali 2013–2025
- marker delle stazioni con valore numerico
- heatmap grafica costruita a partire dalle stazioni visualizzate

#### ARPA Lazio · comune
- Open Data Lazio / ARPA
- dataset `Standard comunali della qualità dell'aria`
- Data API CKAN ufficiale
- Comune di Roma (codice ISTAT 058091)
- PM2.5, PM10, NO₂
- valore annuale MED con MIN e MAX
- anni configurati 2013–2023

La fonte ARPA comunale è una **valutazione modellistica** e non una misura puntuale di centralina.
Per questo la mappa usa un indicatore comunale e non finge posizioni di stazioni che il dataset non contiene.

### Confronto
Le modalità Mappa, Confronto Swipe e Differenza funzionano con entrambe le fonti.
Il confronto avviene sempre tra periodi della stessa fonte selezionata.

### Periodicità
Le due integrazioni reali attive in questa release sono annuali.
La successiva integrazione ARPA delle elaborazioni `medie mensili` sarà gestita separatamente, senza riutilizzare dati annuali come se fossero mensili.
