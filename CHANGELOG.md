# Changelog

Questo file registra le modifiche funzionali dell'app. Da questa release deve essere aggiornato insieme a ogni incremento di versione.

## [0.3.1] - 2026-08-23

### Correzioni mappa

- Corretta un'espressione MapLibre non valida nel layer `air-points`: `zoom` era annidato dentro `case`, mentre MapLibre lo consente solo come input diretto di `interpolate` o `step`.
- Corretta la stessa struttura nei layer `air-labels`, `diff-points` e `diff-labels`.
- Il caricamento della mappa non si interrompe più durante `addAirLayers()`, permettendo l'inizializzazione dei layer temperatura.

### Correzioni temperatura

- Inizializzate correttamente `temperatureCache` e `temperatureInflight` nello stato applicativo.
- Gli errori del modulo temperatura aggiornano ora la diagnostica corrente invece di lasciare visibile l'ultima diagnostica EEA.
- In caso di errore temperatura vengono nascosti i layer temperatura e mostrato uno stato vuoto coerente.

### Versioning

- Aggiornata l'app a `0.3.1` build `34`.

## [0.3.0] - 2026-08-23

### Temperatura

- Avviata la serie `0.3.x`, dedicata alle temperature.
- Aggiunta la fonte `Temperatura · ERA5-Land`.
- La temperatura resta separata dalle sorgenti di qualità dell'aria.
- Fonte reale: Copernicus ERA5-Land tramite Open-Meteo Historical Weather API.
- Variabile: temperatura dell'aria a 2 metri.
- Anni disponibili nell'interfaccia: dal 1950 all'ultimo anno completo.
- Aggiunta selezione del mese.
- Aggiunte metriche `Temperatura media`, `Temperatura massima` e `Temperatura minima`.
- La stessa risposta mensile contiene tutte le metriche, quindi cambiare metrica non richiede un nuovo download.
- La vista temperatura usa celle di griglia invece di stazioni, per non confondere dati modellati e misure puntuali.
- Aggiunti popup con media, minima e massima del mese.
- Aggiunta legenda termica `Freddo → Caldo`.
- Confronto e Differenza sono temporaneamente disabilitati nel modulo temperatura; verranno estesi nella serie 0.3.x.
- Gli alberi restano esplicitamente fuori dalla 0.3.x e sono riservati alla futura serie 0.4.x.

### Proxy temperatura

- Aggiunto Worker Cloudflare dedicato `qualita-aria-temperature`.
- Il Worker genera una griglia fino a 25 punti nella bounding box visibile.
- Una singola richiesta batch recupera le temperature orarie ERA5-Land via Open-Meteo.
- Il Worker aggrega i valori in media, minima e massima mensili.
- Cache Cloudflare di 30 giorni per i mesi storici completi.
- Nessuna API key richiesta.
- Aggiunta diagnostica con risoluzione, passo di campionamento, cache edge, durata proxy e durata upstream.

### Navigazione

- Il refresh temperatura usa il debounce condiviso di 2 secondi dopo pan/zoom.
- La vista viene limitata a bounding box di massimo 4° × 4° per evitare richieste eccessive.
- Il modulo parte dalla posizione corrente della mappa e non la ricentra automaticamente dopo il caricamento.

### Versioning

- Aggiornata l'app a `0.3.0` build `33`.

## [0.2.14] - 2026-08-23

### Proxy EEA e prestazioni

- Aggiunto un Worker Cloudflare dedicato `qualita-aria-eea`.
- Le statistiche annuali E1a non vengono più richieste direttamente a Discodata quando il proxy è disponibile.
- Il Worker normalizza le stazioni e memorizza la risposta nella Cache API Cloudflare.
- TTL E1a: 6 ore per l'anno più recente, 30 giorni per gli anni consolidati.
- Anche i risultati vuoti vengono memorizzati, evitando di ripetere query lente prima del fallback UTD.
- Aggiunto endpoint proxy per i metadati `Measurements`, con cache di 24 ore.
- Elenco file E2a/UTD memorizzato per 6 ore.
- File Parquet E2a/UTD memorizzati come binari nella Cache API per 6 ore.
- Il frontend conserva il fallback diretto a Discodata se il nuovo Worker non è raggiungibile.
- La diagnostica EEA espone `edgeCache`, `proxyDurationMs` e `upstreamMs`.

### Correzioni UTD

- Corretto un errore della 0.2.13 nella diagnostica della cache UTD: `fromEntry()` usava una variabile `allRows` non definita.
- Il fallback UTD preferisce il nuovo proxy EEA e mantiene temporaneamente compatibilità con le vecchie route EEA presenti nel Worker OpenAQ.
- I metadati UTD vengono recuperati dal proxy EEA quando disponibile.

### Versioning

- Aggiornata l'app a `0.2.14` build `32`.

## [0.2.13] - 2026-08-23

### Prestazioni EEA

- Aggiunta cache spaziale per le statistiche annuali E1a validate.
- La query Discodata usa una bounding box agganciata a una griglia geografica; piccoli pan nella stessa zona riutilizzano i dati già caricati e filtrano le stazioni localmente.
- La griglia si adatta alla dimensione della viewport: più fine nelle viste cittadine e più ampia nelle viste continentali.
- Ridotte le colonne richieste a `AirQualityStatistics` ai soli campi utilizzati dall'app, diminuendo il payload JSON.
- Richieste EEA validate identiche e simultanee condividono la stessa Promise invece di duplicare la chiamata HTTP.
- Aggiunti `queryBoundingBox`, `spatialGridDegrees`, `cache` e `durationMs` alla diagnostica EEA.

### Prestazioni EEA UTD

- I Parquet E2a/UTD non sono più memorizzati per singola viewport.
- Il dataset preliminare viene elaborato una sola volta per `città + anno + inquinante` durante la sessione.
- Gli spostamenti successivi filtrano localmente le stazioni già elaborate sulla bounding box visibile.
- Anche i metadati EEA dei sampling point sono memorizzati per città, anno e inquinante.
- Richieste UTD simultanee identiche condividono la stessa elaborazione.
- Ridotto il numero massimo di dataset UTD mantenuti in memoria a 20 per contenere l'uso di RAM.

### Versioning

- Aggiornata l'app a `0.2.13` build `31`.

## [0.2.12] - 2026-08-22

### EEA · area visibile

- Il capoluogo selezionato resta il punto di partenza della vista EEA.
- Dopo uno spostamento o uno zoom manuale, EEA ricalcola la query usando la bounding box realmente visibile.
- Il refresh parte solo dopo 2 secondi senza ulteriori movimenti.
- La cache EEA distingue le diverse bounding box visualizzate.
- Cambiando esplicitamente area o città viene azzerato il viewport dinamico e la mappa torna al capoluogo scelto.
- Il fallback preliminare UTD viene filtrato sulla bounding box visibile e non viene attribuito a zone che non contengono più il capoluogo selezionato.

### Refresh mappa

- Introdotto un unico debounce di 2 secondi per pan/zoom su tutte le mappe.
- Rimosso il vecchio refresh OpenAQ a 220 ms, evitando richieste duplicate.
- I movimenti programmati dall'app, come il centraggio su un capoluogo, non generano un secondo download.
- I rendering avviati da uno spostamento manuale non ricentrano automaticamente la mappa.

### EEA UTD / Parquet

- Corretto il caricamento di `hyparquet`: la versione `1.26.0` viene ora importata tramite l'entry ESM jsDelivr `+esm`.
- Migliorata la diagnostica quando la libreria Parquet non può essere caricata.

### Versioning

- Aggiornata l'app a `0.2.12` build `30`.

## [0.2.11] - 2026-08-22

### EEA · dati preliminari UTD

- Aggiunto il fallback ufficiale EEA `E2a / UTD` per l'anno più recente quando la statistica annuale `E1a` validata non è disponibile.
- L'app continua a dare priorità ai dati annuali validati `E1a`.
- Il fallback UTD è attivo inizialmente per le città italiane selezionate nella fonte EEA.
- I file Parquet UTD vengono richiesti tramite il Cloudflare Worker esistente, senza dipendere dal CORS del servizio EEA.
- Aggiunta lettura Parquet nel browser tramite `hyparquet` e `hyparquet-compressors`, con versioni bloccate per supportare i principali codec Parquet.
- Le osservazioni con `Validity` negativa vengono escluse.
- Per ogni sampling point viene selezionata la serie con maggiore copertura tra aggregazione giornaliera, oraria e variabile.
- Una media annuale preliminare viene visualizzata solo con copertura almeno del 75%.
- I sampling point UTD vengono collegati ai metadati ufficiali EEA della tabella `Measurements`.
- I record preliminari sono marcati `◐ Preliminare UTD`; quelli validati `✓ Validato E1a`.
- Popup, elenco stazioni e confronto mantengono visibile lo stato di validazione.

### Proxy Cloudflare

- Aggiunti `/v1/eea/utd/files` e `/v1/eea/utd/file`.
- Il Worker accetta soltanto indici di file restituiti direttamente dall'API EEA, evitando proxy verso URL arbitrari.
- Aggiornato health check Worker alla versione `0.4.0` con `eeaUtd: true`.

### Versioning

- Aggiornata l'app a `0.2.11` build `29`.

## [0.2.10] - 2026-08-22

### EEA

- Corretta la selezione delle città quando la query EEA restituisce zero stazioni.
- La mappa viene centrata immediatamente sulla città selezionata, prima del completamento della query.
- Un risultato EEA con zero righe viene ora trattato come risultato valido e non come errore applicativo.
- Se non esistono statistiche annuali P1Y per la selezione, la UI mostra `—` come media e un messaggio esplicito invece di `0,0 µg/m³`.

### OpenAQ

- Nascosto il selettore ridondante `Periodo / Ultimo dato disponibile`.
- Rimane visibile soltanto il controllo `Recenza` con 7, 15 e 30 giorni.

### Versioning

- Aggiornata l'app a `0.2.10` build `28`.
- Aggiornati service worker e riferimenti cache-busting.
- Aggiornato il README con il comportamento temporale OpenAQ.

## [0.2.9] - 2026-08-22

### EEA · selezione geografica Italia

- La select `Area EEA` contiene ora solo `Italia` ed `Europa`.
- `Italia` è l'area predefinita.
- Quando si seleziona `Italia` compare una seconda select `Città`.
- `Roma` è la città selezionata di default.
- Aggiunto l'elenco locale dei capoluoghi e co-capoluoghi italiani.
- La query Discodata viene limitata a una finestra geografica di circa 40 km attorno alla città selezionata.
- La cache EEA distingue ora anche la città, evitando di riutilizzare risultati di un altro capoluogo.
- Se si seleziona `Europa`, la select `Città` viene nascosta.

### Versioning

- Aggiornata l'app a `0.2.9` build `27`.
- Aggiornati i riferimenti cache-busting di `app.js`, `openaq-world.js`, `version.json` e service worker.
- La patch incorpora anche la correzione `0.2.8` sulla conservazione della posizione della mappa OpenAQ, perché il branch `main` risultava ancora alla `0.2.7`.

## [0.2.8] - 2026-08-22

### OpenAQ

- La mappa mantiene centro, zoom, rotazione e inclinazione quando si cambia inquinante o recenza.
- Entrando in OpenAQ da una vista già sufficientemente ravvicinata, la camera non viene modificata.
- Se lo zoom corrente è inferiore al limite OpenAQ, viene aumentato solo fino al `minZoom` mantenendo invariato il centro.
- Il ripristino della camera sopprime il relativo `moveend`, evitando una seconda chiamata API non necessaria.

## [0.2.7] - 2026-08-22

### Documentazione e versioning

- Riscritto `README.md` come documentazione stabile dell'app, senza note di release.
- Creato `CHANGELOG.md`.
- Aggiornata la versione applicativa a `0.2.7` build `25`.
- Aggiornato il valore di fallback mostrato nel footer.
- Aggiornati cache name e riferimenti versionati del service worker.
- La patch è cumulativa e incorpora anche le modifiche della 0.2.6 che non risultavano pubblicate su `main`.

## [0.2.6] - 2026-08-22

> Patch preparata ma non risultava pubblicata sul branch `main`; le modifiche sono state incorporate nella 0.2.7.

### OpenAQ per area visibile

- Sostituito il caricamento mondiale con richieste basate sulla bounding box visibile.
- Impostato un limite allo zoom-out per evitare richieste che coprano l'intero pianeta.
- Aggiornamento dati OpenAQ su `moveend`.
- Aggiunta recenza selezionabile: 7, 15 o 30 giorni.
- Aggiunta suddivisione automatica delle bounding box troppo dense.
- Aggiunta protezione contro dataset parziali: se l'area resta troppo densa, l'app richiede di aumentare lo zoom.
- Nascosto il controllo mensile per EEA e ARPA finché non viene implementata una vera aggregazione mensile.
- Il controllo temporale OpenAQ viene usato come selettore di recenza.

## [0.2.5] - 2026-08-22

### Mappa

- Riordinate heatmap e marker sotto le etichette geografiche del basemap.
- Rese nuovamente leggibili città, Paesi e strade.
- Aumentato leggermente lo zoom iniziale della vista OpenAQ.

## [0.2.4] - 2026-08-22

### OpenAQ

- Aggiunta la fonte `OpenAQ · Mondo`.
- Aggiunti PM2.5 e PM10 con unità omogenee in µg/m³.
- Mostrati monitor fissi classificati come reference monitor.
- Aggiunto filtro iniziale sui dati recenti.
- Disabilitati temporaneamente Confronto e Differenza per OpenAQ.
- Preparati endpoint proxy per lo storico annuale dei sensori.

## [0.2.3] - 2026-08-22

### Infrastruttura OpenAQ

- Aggiunto client frontend per il proxy OpenAQ.
- Aggiunto Cloudflare Worker con secret `OPENAQ_API_KEY`.
- Aggiunti CORS, allowlist degli endpoint e cache.
- La API key OpenAQ non viene mai salvata nel frontend o nel repository.

## [0.2.2] - 2026-08-22

### Elenco stazioni

- Reso cliccabile l'elenco stazioni.
- Il click centra la mappa sulla stazione selezionata.
- Aggiunto supporto tastiera con Invio e Spazio.
- Il comportamento è compatibile con la modalità Confronto.

## [0.2.1] - 2026-08-22

### Elenco stazioni

- Aggiunta ricerca per nome, codice e Paese.
- Aggiunto autocompletamento.
- Aggiunta paginazione reale a 12 stazioni per pagina.
- La paginazione funziona anche con dataset EEA europei numerosi.

## [0.2.0] - 2026-08-22

### Versioning

- Avviata la serie di versioni `0.2.x`.

## [0.1.16] - 2026-08-22

### EEA

- Estesa la fonte EEA da Roma a Italia ed Europa.
- Aggiunto selettore area EEA.
- Aggiunta paginazione delle query Discodata.
- Migliorata la resa della heatmap a scala europea.

## [0.1.15] - 2026-08-22

### ARPA Lazio

- Aggiunto grafico storico annuale ARPA in modalità Confronto.
- Visualizzati MIN, MED e MAX dal 2013 al 2025.
- Aggiunto caricamento concorrente controllato dei file annuali.

## [0.1.14] - 2026-08-22

### Confronto

- Aggiunti indicatori di andamento: aumento, diminuzione e stabilità.

## [0.1.13] - 2026-08-22

### Confronto

- L'elenco mostra i valori dei due periodi affiancati.
- Gestite le stazioni presenti in un solo periodo tramite valore mancante.

## [0.1.12] - 2026-08-22

### ARPA Lazio

- Stabilizzata la lettura dei file ufficiali CSV/XLSX.
- Corretta la conversione dei valori mancanti per evitare falsi zeri.
- Aggiunto fallback posizionale per MIN, MED e MAX nei fogli XLSX.
- Confermata la distinzione tra valutazione comunale e stazione di misura.
