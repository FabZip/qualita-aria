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


## Temperatura · ERA5-Land

La serie `0.3.x` introduce un modulo separato per la **temperatura dell'aria a 2 metri**.

Fonte:

- Copernicus **ERA5-Land**
- accesso tramite Open-Meteo Historical Weather API
- copertura usata dall'app: anni completi dal 1950 all'anno precedente
- risoluzione nativa: `0,1°`, circa 9–11 km
- attribuzione dati: Open-Meteo / Copernicus Climate Change Service

La vista temperatura usa un solo **anno** e tre metriche:

- **MED** — media annua della temperatura dell'aria a 2 m;
- **MIN** — temperatura minima assoluta dell'anno;
- **MAX** — temperatura massima assoluta dell'anno.

Il Worker usa le aggregazioni giornaliere Open-Meteo `temperature_2m_mean`,
`temperature_2m_min` e `temperature_2m_max`. Cambiare tra MED, MIN e MAX non
richiede un nuovo download perché le tre statistiche sono nello stesso payload.

Dopo pan/zoom il modulo aggiorna la zona visibile con il debounce condiviso di
2 secondi.

### Interpretazione

ERA5-Land è un **modello di rianalisi**, non una rete di termometri urbani.
La griglia è adatta a confronti climatici e territoriali ma non permette di
attribuire con affidabilità differenze di temperatura a una singola strada,
parco, albero o edificio.

### Resilienza e proxy

La via primaria è il Worker `qualita-aria-temperature`, con cache Cloudflare
di 30 giorni. Se il Worker è temporaneamente non disponibile o restituisce zero
celle, il frontend prova direttamente Open-Meteo con la stessa aggregazione.

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
