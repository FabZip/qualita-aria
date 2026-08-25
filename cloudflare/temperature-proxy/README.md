# Temperature proxy

Worker Cloudflare del modulo temperatura di Qualità aria.

La fonte temperatura è indipendente dalla fonte dell'inquinante.

- ARPA Lazio → rete micro-meteorologica fisica ARPA Lazio.
- EEA → ARPA Lazio nel Lazio; fuori dalla sua copertura, stazioni fisiche
  NOAA/NCEI Global Summary of the Year (GSOY).
- Globale / modalità Temperatura → Copernicus ERA5-Land.

`/v1/observed` non usa mai ERA5-Land come fallback: se non sono disponibili
stazioni fisiche con dati annuali sufficienti, restituisce zero stazioni.

Le statistiche annuali sono:
- MIN = media delle minime giornaliere;
- MEDIA = media delle medie giornaliere;
- MAX = media delle massime giornaliere.

Copertura minima delle serie osservate: 75%.

## Deploy

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```


## 0.3.6

Per EEA fuori dal Lazio il Worker usa il layer stazioni ufficiale NCEI
Global Summary of the Year e legge direttamente TMIN, TAVG e TMAX annuali.
OpenAQ non usa più alcun overlay temperatura.
