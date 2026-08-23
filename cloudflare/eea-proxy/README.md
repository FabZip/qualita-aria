# EEA edge proxy

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
