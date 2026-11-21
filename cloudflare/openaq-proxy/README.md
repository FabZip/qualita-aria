# Proxy OpenAQ — Qualità aria

Versione preparata: `0.4.3`. `/v1/viewport/latest` supporta PM2.5, PM10, NO₂, O₃, SO₂ e CO; normalizza ppm/ppb in µg/m³ usando 25 °C e 1 atm (24,45 L/mol). Le unità non riconosciute vengono escluse. Distribuire questa versione insieme al frontend `0.7.29`.

Questo Worker protegge `OPENAQ_API_KEY`: la chiave resta come Secret Cloudflare e non viene mai inviata alla PWA.

## Endpoint esposti

Il Worker non è un proxy generico. Espone solo le operazioni OpenAQ necessarie al progetto:

- `GET /health`
- `GET /v1/viewport/latest?pollutant=pm25&bbox=12,41,13,42&datetime_min=2026-10-13T22:00:00.000Z`
- `GET /v1/world/latest?pollutant=pm25&max_age_hours=72`
- `GET /v1/locations?pollutant=pm25&page=1`
- `GET /v1/latest?pollutant=pm25&page=1`
- `GET /v1/location?id=2178`
- `GET /v1/yearly?sensor=3920&year=2025`
- `GET /v1/years?sensor=3920&from_year=2020&to_year=2025`

Gli endpoint `locations` forzano `monitor=true`, `mobile=false` e `limit=1000`, quindi la base per l'app mondiale è costituita dai monitor di riferimento/stazionari.

Inquinanti accettati dal proxy: `pm25`, `pm10`, `no2`, `o3`, `so2`, `co`.

La vista OpenAQ può passare `datetime_min` a `/v1/viewport/latest`. L’opzione `Oggi` usa la mezzanotte locale convertita in ISO; il Worker convalida la data e restituisce soltanto l’ultima misura successiva a quella soglia per ogni stazione.

Nota scientifica: OpenAQ usa unità diverse a seconda del parametro. PM2.5 e PM10 sono esposti normalmente in µg/m³; NO₂/O₃/SO₂/CO possono essere in ppm. La PWA non deve confrontare direttamente valori con unità diverse.

## Deploy

Dalla root del repository:

```bash
cd cloudflare/openaq-proxy
npx wrangler@latest login
npx wrangler@latest secret put OPENAQ_API_KEY
npx wrangler@latest deploy
```

Quando Wrangler chiede il valore del secret, incolla la API key OpenAQ. Non salvarla in file versionati.

Il deploy restituisce un URL simile a:

```text
https://qualita-aria-openaq.<tuo-subdomain>.workers.dev
```

Inseriscilo in:

```text
data/openaq-proxy.json
```

impostando:

```json
{
  "enabled": true,
  "base_url": "https://qualita-aria-openaq.<tuo-subdomain>.workers.dev"
}
```

Non aggiungere la API key al JSON.

## Test

```bash
curl https://qualita-aria-openaq.<tuo-subdomain>.workers.dev/health
curl "https://qualita-aria-openaq.<tuo-subdomain>.workers.dev/v1/locations?pollutant=pm25&page=1"
```

La risposta `/health` deve contenere:

```json
{
  "ok": true,
  "openaqConfigured": true
}
```

## Cache

- `latest`: 15 minuti
- elenco `locations`: 24 ore
- dettaglio `location`: 24 ore
- aggregato `yearly`: 6 ore per l'anno corrente, 7 giorni per gli anni conclusi

Il Worker aggiunge `X-Proxy-Cache: HIT` o `MISS` alle risposte.

`/v1/world/latest` unisce lato Worker l’anagrafica dei monitor reference-grade con l’ultimo dato del parametro, così la API key resta segreta e la PWA riceve già un dataset mondiale compatto. La vista mondiale usa per ora PM2.5 e PM10 in µg/m³.

## Sicurezza

- la API key è letta esclusivamente da `env.OPENAQ_API_KEY`;
- sono consentite solo richieste `GET`;
- il browser di produzione consentito è `https://fabzip.github.io`;
- localhost e 127.0.0.1 sono ammessi per sviluppo;
- query e pagine sono validate e limitate;
- non è possibile scegliere arbitrariamente l'host o il path upstream.

## Catalogo parametri — correzione 0.4.3

Gli ID OpenAQ identificano inquinante **e unità**, non soltanto l'inquinante. La ricerca `/v1/viewport/latest` e `/v1/locations` usa `parameters_id` con elenco separato da virgole, supportato dal contratto ufficiale, e seleziona i sensori di tutte le varianti:

| Inquinante | µg/m³ | ppm | ppb |
| --- | --- | --- | --- |
| PM10 | 1 | — | — |
| PM2.5 | 2 | — | — |
| NO₂ | 5 | 7 | 15 |
| CO | 4 | 8 | 102 |
| SO₂ | 6 | 9 | 101 |
| O₃ | 3 | 10 | 32 |

Fonte verificata il 21 novembre 2026: [catalogo ufficiale OpenAQ](https://github.com/openaq/openaq-db/blob/526918cc9549815ccfa0f4d30a9221260e36fb0e/openaqdb/lookups/measurands.sql). Il catalogo API `/v3/parameters` richiede una API key (401 senza chiave); non sono state lette o modificate credenziali per questa verifica. Il supporto della lista ID è verificato nel [sorgente API ufficiale](https://github.com/openaq/openaq-api/blob/main/openaq_api/v3/models/queries.py), classe `ParametersQuery`.

Gli ID ppm precedenti erano validi, ma escludevano stazioni che riportano i gas in µg/m³ o ppb. La vista sceglie l'ultima misura del gas per stazione e normalizza a µg/m³ secondo l'unità del sensore. Le risposte esterne e la cache interna per stazione usano nuove chiavi, evitando di riutilizzare risultati precedenti incompleti. Il campo metadata `id` resta compatibile; `ids` esplicita tutte le varianti cercate. L'endpoint legacy `/v1/latest` continua a esporre la singola variante ppm per i gas; non è usato dalla vista frontend, che usa `/v1/viewport/latest`.

Verifica: `node --test tests/*.test.mjs`, con fixture per sei inquinanti, quattro periodi, unità µg/m³/ppm/ppb e sensori estranei esclusi. I test simulano OpenAQ e non certificano la disponibilità dei dati reali in una città o il deploy remoto.

Verifica pacchetto del 21 novembre 2026: `wrangler 4.166.0 deploy --dry-run --config ./wrangler.jsonc` riuscito (36,57 KiB, gzip 8,77 KiB), senza deploy remoto.
