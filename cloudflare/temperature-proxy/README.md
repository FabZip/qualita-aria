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
- MIN = temperatura minima assoluta registrata nell'anno;
- MEDIA = media delle medie giornaliere;
- MAX = temperatura massima assoluta registrata nell'anno.

Copertura minima delle serie osservate: 75%.

## Deploy

### Eventi arborei dinamici

Il Worker espone:

- `GET /v1/trees/events?city=roma&year=2026` per il frontend;
- `POST /v1/trees/refresh` per avviare una scansione manuale autenticata;
- `POST /v1/trees/review` per confermare, correggere o rifiutare un evento;
- `POST /v1/trees/location-reports` per le segnalazioni geografiche;
- `POST /v1/trees/event-reports` per le segnalazioni sui dati dell’evento;
- un refresh completo ogni lunedì alle 03:00 UTC e lo smaltimento della sola coda geografica ogni giorno alle 03:30 UTC.

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

Il token amministrativo **non serve all'app e non serve ai cron automatici**. È richiesto soltanto per avviare manualmente una scansione o revisionare un evento. Conservarlo in un password manager e non inserirlo in Git, `wrangler.toml`, README o script versionati.

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

Il Worker è identificato dalla versione proxy `0.9.5`.

### Pubblicazione Worker

Nei progetti già configurati, aggiornare anche il file locale `wrangler.toml` (normalmente escluso da Git per proteggere gli identificativi dell'ambiente):

```toml
[triggers]
crons = ["0 3 * * 1", "30 3 * * *"]
```

Poi distribuire il Worker:

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```

Al termine Wrangler deve mostrare entrambi gli schedule: `0 3 * * 1` e `30 3 * * *`. Non sono richieste migrazioni D1 né modifiche a `TREE_ADMIN_TOKEN`.

## 0.9.5

Gli eventi dinamici privi di coordinate possono ricevere una segnalazione non
geografica tramite `POST /v1/trees/event-reports`. Queste segnalazioni riusano
l’archivio esistente con un indice località riservato e non richiedono una nuova
migrazione. Nel pannello amministrativo è possibile correggere titolo, data,
località, tipo, stato e quantità oppure escludere l’evento dalla pubblicazione.
Le revisioni diventano `manual_confirmed` o `manual_rejected` e vengono preservate
dall’upsert settimanale. La password `TREE_ADMIN_PASSWORD` è richiesta per ogni
singola decisione. Il filtro esclude inoltre notizie prive di quantità arboree
esplicite e rimuove i falsi positivi già individuati.

## 0.9.3

Il trigger settimanale continua a scansionare le fonti e aggiornare D1. Il nuovo
trigger quotidiano richiama soltanto `geocodePendingTreeEvents`, smaltendo fino
a otto località senza scaricare nuovamente le pagine comunali. Il lunedì i due
trigger restano indipendenti. Non sono richieste migrazioni D1.

## 0.9.2

Il refresh combina le pagine correnti del portale con un massimo di venti
avvisi già presenti in D1, scelti a partire dal `last_checked_at` più vecchio.
Questo impedisce che gli avvisi usciti dalla prima pagina conservino per sempre
un parsing precedente o incompleto. Il limite complessivo resta di quaranta
pagine per esecuzione. Non sono richieste migrazioni D1.

## 0.9.1

Aggiunge `GET /v1/trees/geocode?q=...`, una ricerca Nominatim limitata al
riquadro geografico di Roma e usata esclusivamente dal correttore delle
segnalazioni. Non sono richieste nuove migrazioni D1.

## 0.9.0

Introduce segnalazioni pubbliche delle posizioni, override geografici approvati
e geometrie GeoJSON per strade e aree. La migrazione
`0004_tree_location_reports.sql` crea le tabelle delle segnalazioni e delle
correzioni e rimette in coda le località già geocodificate per acquisirne la
geometria. Le operazioni amministrative richiedono a ogni richiesta il secret
`TREE_ADMIN_PASSWORD`; la password non deve essere inserita nel repository.

Configurazione:

```bash
npx wrangler@latest secret put TREE_ADMIN_PASSWORD
npx wrangler@latest secret put REPORT_HASH_SALT
```

`REPORT_HASH_SALT` serve esclusivamente a pseudonimizzare l'indirizzo IP usato
per il limite di cinque segnalazioni al giorno.

## 0.8.5

Ogni avviso arboreo conserva tutte le ubicazioni documentate nella pagina e le
relative coordinate. Il client riceve un unico evento con più marker e può
inquadrarli insieme senza suddividere artificialmente la quantità complessiva.
La migrazione `0003_tree_event_locations.sql` aggiunge i campi JSON necessari.
Una nuova scansione corregge anche i vecchi luoghi troncati a `P`.

## 0.8.4

Il parser degli eventi arborei riconosce correttamente indirizzi abbreviati come
`P.co` e `P.za`, le entità HTML tipografiche e le quantità espresse con `n°`.
Quando una nuova scansione corregge il luogo di un evento già presente, le
coordinate precedenti vengono annullate e ricalcolate. La geocodifica prova
anche una variante senza il tipo di luogo e accetta soltanto risultati entro
l'area di Roma. Non sono richieste nuove migrazioni D1.

## 0.8.3

Le temperature annuali espongono il minimo assoluto, la media delle temperature
medie giornaliere e il massimo assoluto. NOAA/NCEI GSOY usa `EMNT`, `TAVG` ed
`EMXT`; ARPA Lazio, Meteostat ed ERA5-Land applicano la stessa semantica ai
valori giornalieri. Le chiavi cache includono la versione dell'aggregazione per
non riutilizzare risposte calcolate con la precedente media degli estremi.


## 0.3.8

Per EEA fuori dal Lazio il Worker usa il layer stazioni ufficiale NCEI
Global Summary of the Year e legge direttamente EMNT, TAVG ed EMXT annuali.
Quando GSOY non copre una stazione fisica, usa Meteostat solo con dati
osservativi e copertura annuale di almeno il 75%. OpenAQ non usa alcun overlay
temperatura.
