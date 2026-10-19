# EEA edge proxy

Versione `0.2.0`, necessaria per il frontend `0.7.19`.

La richiesta upstream UTD usa `countries: ["IT"]`, `cities: []` e l’etichetta dell’inquinante (`PM2.5`, `PM10`, `NO2`). Il nome città resta solo un’etichetta: la selezione geografica usa `bbox` e `year`, inoltrati sia a `/v1/utd/files` sia a `/v1/utd/file`. Il Worker recupera i metadati EEA dell’area e seleziona i file con codici stazione corrispondenti. Se il nome di un file non contiene codici riconoscibili, il file viene conservato e le osservazioni vengono filtrate nel browser. In quel caso il primo caricamento può richiedere più download.

Il catalogo non viene troncato: il limite di sicurezza è 2000 file, oltre il quale viene restituito un errore esplicito. Il download mantiene il limite di 40 MiB per file. La nuova cache `utd-country-urls-v2` esclude le vecchie risposte cittadine vuote; la cache binaria `utd-file-v2` usa l’URL effettivo del file. `/health` espone `utdSpatialSelection: true`.

Esempio di controllo dopo il deploy:

```bash
curl -sS 'https://qualita-aria-eea.fabzip.workers.dev/v1/utd/files?country=IT&city=Milano&pollutant=PM2.5&year=2026&bbox=8.67,45.1092,9.6948,45.8278'
```

La risposta riporta `meta.spatialSelection`, `meta.countryFileCount` e `meta.count`; questi distinguono il catalogo nazionale dai file selezionati per l’area.

Worker Cloudflare dedicato ai dati EEA di Qualità aria.

## Scopo

Il frontend non interroga più direttamente Discodata per ogni prima visita. Il Worker:

- interroga `AirQualityStatistics` per i dati annuali E1a;
- normalizza le stazioni in JSON;
- mantiene la risposta nella Cache API di Cloudflare;
- memorizza i metadati `Measurements` per il fallback UTD;
- memorizza l'elenco dei Parquet E2a/UTD;
- memorizza anche i file Parquet binari per 6 ore.

Gli anni recenti E1a hanno TTL 6 ore; gli anni consolidati 30 giorni.

## Deploy

```bash
cd cloudflare/eea-proxy
npx wrangler@latest deploy
```

Non sono richiesti secret.

Con il sottodominio Cloudflare già usato dal progetto, l'URL previsto è:

`https://qualita-aria-eea.fabzip.workers.dev`

Verifica:

```bash
curl https://qualita-aria-eea.fabzip.workers.dev/health
```
