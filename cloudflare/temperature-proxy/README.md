# Proxy ambientale

Worker Cloudflare dei moduli temperatura e aggiornamento eventi arborei di Qualità aria.

La fonte temperatura è indipendente dalla fonte dell'inquinante.

- ARPA Lazio → rete micro-meteorologica fisica ARPA Lazio.
- EEA → ARPA Lazio nel Lazio; fuori dalla sua copertura, stazioni fisiche
  NOAA/NCEI Global Summary of the Year (GSOY), con fallback Meteostat
  limitato a provider osservativi.
- OpenAQ → nessun overlay temperatura.

`/v1/observed` non usa mai ERA5-Land come fallback: se non sono disponibili
stazioni fisiche con dati annuali sufficienti, restituisce zero stazioni.

Il fallback Meteostat individua stazioni WMO/ICAO attraverso il catalogo
NOAA/NCEI GSOD. I dump giornalieri vengono accettati soltanto quando `temp`,
`tmin` e `tmax` dichiarano provider presenti nella allowlist osservativa.
Provider modellistici, previsioni e interpolazioni vengono scartati.

Le statistiche annuali sono:
- MIN = media delle minime giornaliere;
- MEDIA = media delle medie giornaliere;
- MAX = media delle massime giornaliere.

Copertura minima delle serie osservate: 75%.

## Deploy

### Eventi arborei dinamici

Il Worker espone:

- `GET /v1/trees/events?city=roma&year=2026` per il frontend;
- `POST /v1/trees/refresh` per avviare una scansione manuale autenticata;
- `POST /v1/trees/review` per confermare, correggere o rifiutare un evento;
- un `scheduled()` handler eseguito il primo giorno di ogni mese alle 03:00 UTC.

Gli eventi sono conservati in Cloudflare D1. Le pagine con più interventi o formulazioni ambigue vengono archiviate come `automatic_pending` e non incidono sui totali. Soltanto eventi con quantità nota e stato `completed` o `emergency_completed` vengono sommati dal frontend.

Prima del primo deploy:

```bash
cd cloudflare/temperature-proxy
cp wrangler.toml.example wrangler.toml
npx wrangler@latest d1 create qualita-aria-tree-events
```

Copiare il `database_id` restituito da Wrangler dentro `wrangler.toml`, quindi:

```bash
npx wrangler@latest d1 migrations apply qualita-aria-tree-events --remote
npx wrangler@latest secret put TREE_ADMIN_TOKEN
npx wrangler@latest deploy
```

Per aggiornare un database D1 già esistente dalla versione proxy `0.7.0`, applicare prima la nuova migrazione delle coordinate e poi distribuire il Worker:

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest d1 migrations apply qualita-aria-tree-events --remote
npx wrangler@latest deploy
```

La migrazione `0002_tree_event_coordinates.sql` non elimina eventi: aggiunge i campi geografici. Durante ogni refresh il Worker geocodifica in sequenza al massimo otto indirizzi ancora privi di coordinate, valida che il risultato ricada nell'area di Roma e salva il risultato in D1. Le richieste sono distanziate di almeno 1,1 secondi; il browser non interroga direttamente il servizio di geocodifica.

### Forzare manualmente l'aggiornamento arboreo

Il token amministrativo **non serve all'app e non serve al cron mensile**. È richiesto soltanto per avviare manualmente una scansione o revisionare un evento. Conservarlo in un password manager e non inserirlo in Git, `wrangler.toml`, README o script versionati.

Per forzare un aggiornamento senza lasciare il token nella cronologia della shell:

```bash
read -rsp "Token: " ARIA_TREE_TOKEN
echo
curl -X POST \
  -H "Authorization: Bearer $ARIA_TREE_TOKEN" \
  https://qualita-aria-temperature.fabzip.workers.dev/v1/trees/refresh
unset ARIA_TREE_TOKEN
```

Alla richiesta `Token:` incollare il valore configurato con `wrangler secret put TREE_ADMIN_TOKEN`: durante l'inserimento non vengono visualizzati caratteri. Una risposta con `"ok": true` conferma la scansione; `discovered` indica le pagine individuate, `inserted` i nuovi eventi, `updated` quelli già presenti e ricontrollati, `errors` gli errori incontrati.

Per verificare senza token ciò che leggerà la PWA:

```bash
curl "https://qualita-aria-temperature.fabzip.workers.dev/v1/trees/events?city=roma&year=2026"
```

Se il token viene perso o esposto, generarne uno nuovo e sostituirlo:

```bash
openssl rand -hex 32
npx wrangler@latest secret put TREE_ADMIN_TOKEN
```

Il nuovo valore sostituisce immediatamente il precedente. Non è necessario modificare o ripubblicare il frontend.

Esempio di revisione manuale:

```bash
read -rsp "Token: " ARIA_TREE_TOKEN
echo
curl -X POST \
  -H "Authorization: Bearer $ARIA_TREE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sourceKey":"IDS1551137","validation":"manual_confirmed","status":"emergency_completed","eventType":"decrement","quantity":8,"locationName":"Roma"}' \
  https://qualita-aria-temperature.fabzip.workers.dev/v1/trees/review
unset ARIA_TREE_TOKEN
```

Il file `data/trees.json` rimane il dataset consolidato di fallback se D1 o il proxy non sono raggiungibili.

Il modulo eventi arborei del Worker è identificato dalla versione proxy `0.8.0`.

### Pubblicazione Worker

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```


## 0.3.8

Per EEA fuori dal Lazio il Worker usa il layer stazioni ufficiale NCEI
Global Summary of the Year e legge direttamente TMIN, TAVG e TMAX annuali.
Quando GSOY non copre una stazione fisica, usa Meteostat solo con dati
osservativi e copertura annuale di almeno il 75%. OpenAQ non usa alcun overlay
temperatura.
