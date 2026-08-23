# Temperature proxy

Worker Cloudflare per il modulo temperatura della PWA Qualità aria.

Fonte: Open-Meteo Historical Weather API, modello `ERA5-Land`, variabile `temperature_2m`.

Il Worker riceve bounding box, anno e mese, genera una griglia limitata a 25 punti,
effettua una singola richiesta batch a Open-Meteo, calcola media/minima/massima
delle temperature orarie e salva il JSON aggregato nella Cache API per 30 giorni.

## Deploy

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```

URL previsto:

`https://qualita-aria-temperature.fabzip.workers.dev`

Verifica:

```bash
curl https://qualita-aria-temperature.fabzip.workers.dev/health
```
