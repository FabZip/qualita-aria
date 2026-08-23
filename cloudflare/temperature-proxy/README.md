# Temperature proxy

Worker Cloudflare per il modulo temperatura della PWA Qualità aria.

Fonte: Open-Meteo Historical Weather API, modello `ERA5-Land`.

Il Worker riceve bounding box e anno, genera fino a 25 punti sulla zona
visibile ed effettua una singola richiesta batch a Open-Meteo usando:

- `temperature_2m_mean`
- `temperature_2m_min`
- `temperature_2m_max`

Per ogni cella restituisce:

- **MED**: media annua;
- **MIN**: minimo annuale;
- **MAX**: massimo annuale.

La risposta aggregata viene conservata nella Cache API Cloudflare per 30 giorni.

## Deploy

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```

URL:

`https://qualita-aria-temperature.fabzip.workers.dev`
