# Temperature proxy

Worker Cloudflare per il modulo temperatura della PWA Qualità aria.

Fonte: Open-Meteo Historical Weather API, modello `ERA5-Land`.

Il Worker espone due modalità:

- `/v1/temperature`: griglia della zona visibile per la fonte dedicata Temperatura;
- `/v1/temperature/points`: temperature annuali sulle coordinate richieste,
  usate per sovrapporre i pallini temperatura alle mappe degli inquinanti.

Per ogni punto/cella restituisce:

- **MED**: temperatura media annua;
- **MIN**: temperatura minima assoluta dell'anno;
- **MAX**: temperatura massima assoluta dell'anno.

Le tre metriche derivano dalle aggregazioni giornaliere Open-Meteo
`temperature_2m_mean`, `temperature_2m_min` e `temperature_2m_max`.

Il batch puntuale accetta fino a 40 coordinate per richiesta. Le risposte
storiche sono conservate nella Cache API Cloudflare per 30 giorni.

## Deploy

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```

URL:

`https://qualita-aria-temperature.fabzip.workers.dev`
