# Qualità dell'aria

PWA mobile-first per esplorare dati reali sulla qualità dell'aria su una mappa interattiva, confrontare periodi storici quando la fonte lo consente e distinguere chiaramente tra misure di stazione e valutazioni territoriali.

L'app è pubblicata come sito statico su GitHub Pages e usa un Cloudflare Worker come proxy sicuro per OpenAQ, così la API key non viene mai esposta nel browser.

## Fonti dati

### EEA · stazioni

La fonte EEA utilizza le statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei.

Aree disponibili:

- **Italia** — mostra una seconda selezione **Città** con i capoluoghi e co-capoluoghi italiani; **Roma** è selezionata di default.
- **Europa**

Quando l'area è **Italia**, il capoluogo selezionato determina la posizione iniziale della mappa. Se l'utente sposta o ingrandisce la mappa, dopo **2 secondi senza ulteriori movimenti** la query EEA viene aggiornata usando la bounding box effettivamente visibile. La finestra geografica non rappresenta il confine amministrativo del comune o della provincia.

Inquinanti attivi:

- PM2.5
- PM10
- NO₂

Per le statistiche annuali l'app usa in via prioritaria i dati **E1a validati**. Per l'anno più recente, se la statistica annuale validata non è ancora disponibile per una città italiana, può usare come fallback le osservazioni **E2a / UTD preliminari** del servizio ufficiale EEA e calcolare una media annuale provvisoria.

I dati UTD sono sempre marcati con **◐ Preliminare UTD** e non vengono presentati come equivalenti ai dati **✓ Validati E1a**. Le medie UTD vengono mostrate solo quando la serie scelta raggiunge almeno il 75% di copertura dell'anno.

La visualizzazione sfumata attorno alle stazioni è una rappresentazione grafica dei punti misurati e non una superficie modellata continua.

## ARPA Lazio · comune

La fonte ARPA Lazio utilizza le valutazioni comunali annuali ufficiali per il Comune di Roma.

L'app legge direttamente i file annuali pubblicati da ARPA Lazio e ricava, quando disponibili:

- MIN
- MED
- MAX

per:

- PM2.5
- PM10
- NO₂

Il colore applicato al perimetro del Comune indica l'ambito territoriale della valutazione. Non implica che la concentrazione sia uniforme in ogni punto del territorio.

## OpenAQ · area visibile

OpenAQ viene usato per estendere la copertura oltre l'Europa.

Per evitare richieste mondiali troppo grandi, i dati vengono caricati solo per la bounding box attualmente visibile sulla mappa.

Caratteristiche:

- zoom-out limitato per impedire una vista dell'intero pianeta;
- caricamento con debounce condiviso: dopo `moveend` l'app attende 2 secondi senza altri movimenti prima di aggiornare i dati;
- monitor fissi classificati come reference monitor;
- esclusione dei sensori mobili;
- recenza selezionabile: 7, 15 o 30 giorni;
- suddivisione automatica della bounding box in quadranti quando una zona contiene troppe location;
- nessun risultato parziale silenzioso: nelle aree ancora troppo dense viene richiesto di aumentare lo zoom;
- cache Cloudflare per ridurre richieste duplicate.

Inquinanti OpenAQ attivi:

- PM2.5
- PM10

NO₂ non è ancora attivo nella vista OpenAQ perché i dati possono essere espressi con unità diverse; l'app evita di mescolare valori non omogenei sulla stessa scala.

## Modalità di visualizzazione

### Mappa

Mostra i dati della fonte, dell'inquinante e del periodo selezionati.

Le stazioni sono ricercabili e l'elenco è paginato. Selezionando una stazione dall'elenco, la mappa viene centrata sulla relativa posizione.

Gli aggiornamenti provocati da pan e zoom sono centralizzati: l'app aspetta **2 secondi dopo l'ultimo movimento** prima di ricaricare. Questo evita richieste ripetute mentre l'utente sta ancora esplorando la mappa. Per EEA e OpenAQ la nuova richiesta usa l'area visibile; ARPA Lazio mantiene invece il proprio ambito comunale perché la fonte attuale riguarda Roma.

Per ridurre la latenza EEA, le richieste passano da un **Worker Cloudflare dedicato**. Le statistiche annuali E1a vengono memorizzate nella Cache API del Worker e quindi possono essere riutilizzate anche dopo un reload o da un'altra sessione. Il browser mantiene inoltre una cache spaziale locale: piccoli spostamenti dentro la stessa cella non generano una nuova richiesta.

Per i dati preliminari UTD, il Worker memorizza sia l'elenco dei file sia i **Parquet binari per 6 ore**. Il browser li elabora una sola volta per **città + anno + inquinante** durante la sessione e poi filtra localmente la viewport.

### Confronto

Per le fonti storiche compatibili, mostra due periodi sincronizzati tramite divisore swipe.

L'elenco riporta entrambi i valori e indica se il valore è aumentato, diminuito o rimasto stabile.

### Differenza

Calcola la variazione tra due periodi sulle entità presenti in entrambi i dataset.

Per OpenAQ il confronto è temporaneamente disabilitato: la vista attuale rappresenta l'ultimo dato disponibile entro una finestra di recenza e non sarebbe corretto confrontare direttamente misure acquisite in momenti differenti.

## Periodi temporali

EEA e ARPA sono attualmente collegati a dataset annuali, quindi il selettore mensile non viene mostrato.

L'aggregazione mensile potrà essere aggiunta usando flussi dati dedicati. Questo sarà anche uno dei presupposti per un confronto OpenAQ temporalmente omogeneo.

OpenAQ non mostra un selettore anno/periodo, perché la vista rappresenta sempre l'ultimo dato disponibile. Mostra invece soltanto la **recenza massima** accettata:

- 7 giorni
- 15 giorni
- 30 giorni

## Interpretazione dei dati

L'app distingue tra:

- **stazioni misurate**, rappresentate come punti;
- **valutazioni territoriali**, rappresentate sul relativo perimetro amministrativo.

La heatmap serve esclusivamente a facilitare la lettura spaziale dei punti e non deve essere interpretata come interpolazione scientifica o modello atmosferico.

CO₂ non è incluso: è un gas serra e richiede fonti dedicate diverse dai dataset di qualità dell'aria usati nell'app. CO e CO₂ sono sostanze differenti.


## Temperatura · fonti indipendenti

Il selettore `Fonte inquinante` continua a scegliere esclusivamente il backend
della qualità dell'aria. La temperatura viene caricata separatamente.

| Fonte inquinante | Visualizzazione inquinante | Fonte temperatura nelle viste inquinante |
| --- | --- | --- |
| ARPA Lazio | visualizzazione ARPA esistente | rete micro-meteorologica fisica ARPA Lazio |
| EEA | visualizzazione EEA esistente | ARPA Lazio nel Lazio, poi stazioni fisiche NOAA/NCEI GHCN-Daily |
| Globale · OpenAQ | visualizzazione OpenAQ esistente | celle Copernicus ERA5-Land |

Il recupero degli inquinanti resta separato dal recupero delle temperature:
`fetchEeaRows`, `fetchArpaRows` e il client OpenAQ non vengono usati per
calcolare o localizzare la temperatura.

### ARPA Lazio

Nelle viste ARPA la temperatura usa esclusivamente la rete micro-meteorologica
fisica ARPA Lazio.

I marker:

- sono `🌡`;
- hanno dimensione fissa durante lo zoom;
- sono collocati alle coordinate pubblicate della stazione;
- mostrano nell'ordine `MIN · MEDIA · MAX`;
- non generano aree circolari o superfici termiche.

Il Worker legge i file annuali pubblicati da ARPA Lazio e usa soltanto serie
con almeno il 75% dei giorni validi.

### EEA

La temperatura non proviene dal dataset EEA.

Nel Lazio viene data priorità alla rete micro-meteorologica ARPA Lazio. Negli
altri territori vengono cercate stazioni meteorologiche fisiche nel dataset
osservazionale NOAA/NCEI GHCN-Daily.

SCIA/ISPRA resta una priorità per l'Italia, ma questa release non effettua
richieste automatiche verso SCIA perché non è stato integrato un endpoint
machine-to-machine con condizioni di riuso adatte alla PWA. Non viene
sostituito con ERA5-Land: se non ci sono stazioni fisiche con dati annuali
sufficienti, l'overlay può risultare vuoto.

### Globale · OpenAQ

La visualizzazione dell'inquinante OpenAQ resta invariata.

La temperatura usa ERA5-Land. Nelle viste dedicate agli inquinanti non viene
aggiunta una seconda heatmap: ERA5-Land compare soltanto tramite marker `▦`
associati alle celle climatiche.

Il popup dichiara esplicitamente:

- `Cella ERA5-Land`;
- `Tipo: Rielaborazione climatica`;
- risoluzione circa 9 km;
- fonte temperatura Copernicus ERA5-Land.

Il confronto OpenAQ resta disabilitato perché gli ultimi dati hanno timestamp
eterogenei; la logica dell'inquinante non viene modificata.

### Modalità Temperatura

`Temperatura` è una modalità indipendente accanto a `Mappa`, `Confronto` e
`Differenza`: non è più una voce del selettore delle fonti inquinanti.

La modalità usa ERA5-Land e permette di scegliere quale statistica colora la
mappa:

- **MIN** — media annuale delle temperature minime giornaliere;
- **MEDIA** — media annuale delle temperature medie giornaliere;
- **MAX** — media annuale delle temperature massime giornaliere.

Cliccando una cella vengono mostrati tutti e tre i valori.

## PWA

L'app può essere installata dal browser tramite il pulsante **Installa app**.

Il service worker conserva la shell applicativa per migliorare caricamento e resilienza, mentre i dati ambientali reali vengono richiesti dalla rete e non vengono sostituiti da dati simulati offline.

## Architettura

Frontend:

- HTML, CSS e JavaScript
- MapLibre GL JS
- hyparquet per la lettura browser dei file EEA UTD in formato Parquet
- SheetJS per i file XLSX ARPA
- GitHub Pages

Dati e servizi:

- EEA Discodata
- elenco locale dei capoluoghi italiani per delimitare le query EEA
- file ufficiali ARPA Lazio
- OpenAQ API v3
- Cloudflare Worker per proteggere la API key OpenAQ e applicare cache, filtri e limiti geografici
