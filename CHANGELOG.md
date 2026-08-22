# Changelog

Questo file registra le modifiche funzionali dell'app. Da questa release deve essere aggiornato insieme a ogni incremento di versione.

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
