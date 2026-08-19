# Qualità dell'aria

## v0.1.7

Questa release corregge il problema dei `503` ARPA eliminando la dipendenza
runtime dal DataStore API di Open Data Lazio.

### ARPA Lazio

L'app legge direttamente i file annuali ufficiali pubblicati da ARPA Lazio:

- 2021-2025: XLSX
- 2013-2020: CSV
- 2024 dispone anche del CSV Open Data Lazio come fallback

Anni disponibili: **2013-2025**.

Il browser estrae la riga del Comune di Roma (`ISTAT 058091`) e usa i campi
`MIN`, `MED`, `MAX` di PM2.5, PM10 e NO2.

Non viene più chiamato `datastore_search` per la fonte ARPA.

### Visualizzazione ARPA

Il perimetro amministrativo del Comune di Roma viene caricato separatamente
dal dato ambientale. Questo consente alla diagnostica di distinguere:

- errore nel file ARPA;
- errore nella geometria;
- errore di rendering.

Quando ARPA viene selezionata, la mappa esegue `fitBounds` sul vero confine
del Comune di Roma. Il poligono resta quindi geograficamente stabile a ogni zoom.

### EEA

EEA continua a usare Discodata con statistiche annuali di stazione.

### Diagnostica

Il pannello mostra ora per ARPA:

- file effettivamente usato;
- formato CSV/XLSX;
- numero righe ricevute;
- presenza del record Roma;
- MIN/MED/MAX;
- stato geometria;
- numero di feature del perimetro;
- conferma `runtimeApi: false`.
