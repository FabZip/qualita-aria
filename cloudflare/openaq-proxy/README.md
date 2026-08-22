# Proxy OpenAQ — Qualità aria

Questo Worker protegge `OPENAQ_API_KEY`: la chiave resta come Secret Cloudflare e non viene mai inviata alla PWA.

## Endpoint esposti

Il Worker non è un proxy generico. Espone solo le operazioni OpenAQ necessarie al progetto:

- `GET /health`
- `GET /v1/locations?pollutant=pm25&page=1`
- `GET /v1/latest?pollutant=pm25&page=1`
- `GET /v1/location?id=2178`
- `GET /v1/yearly?sensor=3920&year=2025`

Gli endpoint `locations` forzano `monitor=true`, `mobile=false` e `limit=1000`, quindi la base per l'app mondiale è costituita dai monitor di riferimento/stazionari.

Inquinanti accettati dal proxy: `pm25`, `pm10`, `no2`, `o3`, `so2`, `co`.

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

## Sicurezza

- la API key è letta esclusivamente da `env.OPENAQ_API_KEY`;
- sono consentite solo richieste `GET`;
- il browser di produzione consentito è `https://fabzip.github.io`;
- localhost e 127.0.0.1 sono ammessi per sviluppo;
- query e pagine sono validate e limitate;
- non è possibile scegliere arbitrariamente l'host o il path upstream.
