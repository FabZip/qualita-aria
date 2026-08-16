# Qualità dell'aria

PWA mobile per esplorare e confrontare la qualità dell'aria nel tempo.

## v0.1.4

Correzioni principali:

- EEA spostata dal layer ArcGIS `Exceedance` a **EEA Discodata**
- query sulla tabella `AirQualityDataFlows.latest.AirQualityStatistics`
- filtro annuale `P1Y`
- PM2.5, PM10 e NO₂
- nessun filtro rigido di copertura che possa eliminare silenziosamente tutte le stazioni
- pannello **Diagnostica dati ricevuti** con numero di record, stazioni utilizzate e record di esempio
- ARPA Lazio: rimosso il cerchio in pixel che cambiava area geografica con lo zoom
- ARPA Lazio: visualizzazione del territorio di Roma tramite poligoni geografici
- il colore del perimetro ARPA indica l'ambito territoriale del dato, non una concentrazione uniforme
- CO₂ chiarito separatamente: non è incluso nei dataset di qualità dell'aria usati qui

## Fonti

### EEA
Statistiche annuali di stazione da Discodata:
`AirQualityDataFlows.latest.AirQualityStatistics`

Aggregazione usata: `P1Y` (media annuale).

### ARPA Lazio
Dataset Open Data Lazio:
`Standard comunali della qualità dell'aria`.

Il valore visualizzato è `MED`; MIN e MAX sono mostrati nel dettaglio.

## Diagnostica

Aprire **Diagnostica dati ricevuti** nell'app per vedere, per la selezione corrente:

- fonte
- anno
- inquinante
- codice inquinante
- aggregazione
- record ricevuti
- stazioni utilizzate
- record di esempio / metadati
- per ARPA, numero di poligoni territoriali caricati
