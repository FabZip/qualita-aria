# Proxy ambientale 0.11.0 — calendari Roma / app 0.8.3

Applicare **0013_tree_calendar_intervals.sql prima del deploy**. Il Worker importa le tabelle dei 15 Municipi dalla scheda ufficiale `INF1520290` (`pagina=2..16`), conservando il periodo dei lavori, il link all'atto e la pagina del calendario. Solo piantumazioni e abbattimenti espliciti; gli abbattimenti eventuali sono sconosciuti, potature e messe in sicurezza generiche escluse. Date invalide diagnosticate, quantità non dedotte, indirizzi generici senza geocodifica fittizia. Fonte Ambiente aggiunta alla scansione degli avvisi.

```bash
npx wrangler d1 migrations apply qualita-aria-tree-events --remote --config ./wrangler.toml
npx wrangler deploy --config ./wrangler.toml
```

Cron UTC: `0 3 * * *` avvisi, `10 3 * * *` calendari, `30 3 * * *` geocodifica progressiva. I calendari richiedono al massimo 15 fetch HTML in gruppi di 3 e un batch D1, senza geocoder nella stessa invocazione. `POST /v1/trees/refresh?scope=calendars` forza il solo calendario, con lo stesso Bearer `TREE_ADMIN_TOKEN` già previsto; senza `scope` resta il refresh degli avvisi. Non cambiare account, database o secret.

`GET /v1/trees/events` include `eventEndDate`, `sourceKind`, `calendarUrl` e metadati `calendarSync`. Gli intervalli sono selezionati anche nell'anno sovrapposto. I vecchi fallback automatici pubblicazione/esecuzione vengono disambiguati alla lettura; le date manuali sono preservate. Nell'API amministrativa `eventEndDate` è opzionale, se omesso conserva il valore esistente; stringa vuota lo cancella. Validazione ISO e fine non precedente all'inizio, anche per le singole parti della divisione. Provenienza calendario ereditata dal record server, senza fidarsi del client. Le esclusioni e le revisioni manuali sopravvivono agli upsert.

Verifiche: 22 file di test, migrazioni SQLite reali, regressioni API/editor, sintassi e dry-run Wrangler 4.166.0. La prima importazione verificata del 21 novembre 2026 comprende 13 interventi ancora nel periodo programmato, non necessariamente con inizio futuro. Geocodifica progressiva nei successivi aggiornamenti; nessuna conversione automatica da programmato a eseguito. Le sezioni seguenti descrivono le release precedenti.


Distribuzione verificata il 21 novembre 2026: migrazione 0013 applicata, Worker 0.11.0 online e prima importazione dei 15 calendari completata senza errori. API pubblica: 305 eventi Roma 2026, di cui 13 da calendario ancora nel periodo programmato; i due figli manuali di `IDS1677374` restano separati con un abbattimento ciascuno. L'importazione iniziale usa gli stessi upsert del Worker su HTML ufficiali appena verificati, senza leggere secret. La geocodifica prosegue con il cron dedicato.

# Proxy ambientale 0.10.1 — app 0.8.2

La validazione amministrativa non richiede più località nel record originale già presente: eventi automatici incompleti possono essere divisi, corretti o rimossi. Ogni nuovo intervento e ogni modifica salvata continuano a richiedere almeno una località valida; gli errori delle parti indicano il numero dell'intervento. Per gli originali importati dal catalogo locale è consentita una snapshot senza località, che viene conservata solo come originale escluso della divisione/rimozione; un aggiornamento pubblicato viene validato integralmente.

Caso verificato in sola lettura: `IDS1677374` ha `locationName: ""` e `locations: []`. Prima la validazione di questi campi bloccava la divisione prima di esaminare le parti e prima di qualsiasi scrittura. Ora il test locale crea due figli con gli indirizzi piazza San Saturnino / via Avigliana, quantità 1 ciascuno e tipo `decrement`, mantenendo la fonte originale.

Nessuna nuova migrazione: resta necessaria la `0012` di 0.10.0. Deploy con `npx wrangler deploy --config ./wrangler.toml`; `/health` atteso `0.10.1`. Nessuna modifica ai secret o alle configurazioni reali. Database remoto letto, non modificato durante lo sviluppo.

Verifiche 0.10.1: suite di 21 file superata, sintassi frontend/Worker valida, dry-run Wrangler 4.166.0 riuscito (124,64 KiB; gzip 28,86 KiB). Nessun deploy eseguito nello sviluppo.

# Proxy ambientale 0.10.0 — amministrazione Alberi 0.8.0

Nuovo endpoint autenticato con `TREE_ADMIN_PASSWORD` (Bearer), senza usare il token dei cron:

- `GET /v1/trees/admin/events?city=roma&year=2026`: editor di tutti gli eventi attivi del Comune/anno, con `adminSchemaVersion: 3`, versione `updated_at` e legame `parent_source_key`;
- `POST /v1/trees/admin/events`: `action` è `update_event`, `split_event` o `delete_event`, con `sourceKey` ed `expectedUpdatedAt` del record caricato. Per gli eventi del catalogo locale non ancora presenti in D1, l'editor invia una snapshot `original` validata dal server e importa il record solo al salvataggio;
- `split_event` accetta `parts` (da 2 a 20, massimo 100 località complessive): ogni parte ha titolo, Comune/anno, data, località, tipo, stato e quantità. Il server impone URL e pubblicazione della fonte originale, anche in successive revisioni dei figli. Il frontend applica il Comune/anno scelto ai nuovi interventi, che restano modificabili individualmente in seguito.

Migrazione **`0012_tree_admin_event_split.sql` necessaria prima del deploy**: aggiunge `parent_source_key`, `split_parent` e `tree_admin_audit`. Nessun record esistente viene cancellato. Il precedente editor segnalazioni resta disponibile; il nuovo endpoint richiede schema 3.

`delete_event` conserva una tombstone `manual_rejected`; il crawler ignora la chiave nei ricontrolli. Se una fonte ha record esclusi o un originale suddiviso, non introduce automaticamente nuove chiavi per lo stesso URL; altri record già esistenti della fonte restano distinti. Le correzioni manuali dei record attivi restano preservate dagli upsert. Gli originali suddivisi non possono essere riapprovati attraverso le vecchie API di revisione. La fusione frontend rispetta le tombstone anche per eventi del catalogo locale e non deduplica i figli manuali sulla sola fonte.

La scrittura usa una transazione D1 `batch`: audit, esclusione dell'originale e inserimenti sono atomici. Un controllo sulla versione del record anche dentro la transazione rifiuta modifiche concorrenti; un fallimento non lascia figli parziali. Una seconda richiesta di divisione non duplica gli eventi. La geocodifica è successiva e limitata a otto tentativi complessivi per richiesta; gli altri punti restano in coda. Nessuna quantità viene derivata dal numero di indirizzi.

Distribuzione (account e database da verificare prima di operare):

```bash
cd cloudflare/temperature-proxy
npx wrangler whoami
npx wrangler d1 list
npx wrangler d1 migrations list qualita-aria-tree-events --remote --config ./wrangler.toml
npx wrangler d1 migrations apply qualita-aria-tree-events --remote --config ./wrangler.toml
npx wrangler deploy --config ./wrangler.toml
```

`/health` deve restituire `0.10.0`. Nessuna rotazione di `TREE_ADMIN_PASSWORD` o `TREE_ADMIN_TOKEN`. Non è richiesto un refresh completo per usare l'editor.

Verifiche locali: suite di 21 file, SQLite con tutte le migrazioni, test delle API autorizzate e non autorizzate, quantità/tipi, divisioni invalide, rollback, richieste duplicate, versioni obsolete, geocodifica limitata, esclusioni dopo upsert e fusione del catalogo. Browser con funzioni frontend e Worker reali su SQLite in memoria, Nominatim e conferme native simulati: divisione 5 piantumazioni/2 abbattimenti con fonte comune e coordinate distinte, modifica quantità e rimozione persistente; layout a 390 px. Dry-run Wrangler 4.166.0 riuscito: binding `TREE_DB` e `TREE_SYNC_ENABLED`, 124,43 KiB (gzip 28,79 KiB). Non sono state effettuate scritture su D1 remoto o distribuzioni.

# Proxy ambientale 0.9.14

Gli avvisi misti vengono suddivisi per tipo di intervento e contesto del testo. Il contenuto di `<article>` evita interferenze di menu e metadati. Il comunicato reale `IDS1658896` del XIV Municipio produce abbattimenti entro il 30 ottobre nelle tre località (quantità complessiva non certa) e 19 piantumazioni in via Bitossi senza data lavori dichiarata. I blocchi non separabili restano `unknown`/`automatic_pending`; gli interventi misti non diventano automaticamente consuntivi completati.

`GET /v1/trees/location-reports` espone `adminSchemaVersion: 2` e tutti i dati dell'evento. `update_event` e `delete_event` sono consentiti anche per segnalazioni di posizione, sempre con `TREE_ADMIN_PASSWORD`. Sono modificabili titolo, Comune supportato, anno, data lavori, Municipio/zona, elenco delle località, tipo, stato, quantità complessiva, URL della fonte, data pubblicazione e descrizione. Identificativi, cronologia tecnica e identità del segnalante non vengono riscritti. Le correzioni manuali non vengono sovrascritte dall'indicizzazione successiva.

`GET /v1/trees/events` aggiunge `eventDate`, `sourcePublishedAt`, `dateType`, `description`, `availableYears` e `manualRevisions`: il frontend distingue date lavori/pubblicazione, scopre gli anni degli eventi corretti e non ripristina dal catalogo locale record spostati o esclusi manualmente. Il pannello frontend richiede lo schema 2 per evitare salvataggi contro un Worker vecchio.

Distribuzione (nessuna nuova migrazione né modifica ai secret):

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy --config ./wrangler.toml
```

La versione attesa su `/health` è `0.9.14`. Dopo il deploy, un refresh con `TREE_ADMIN_TOKEN` o i cron recuperano progressivamente gli avvisi prima scartati; possono servire più passaggi. Il deploy non forza da solo una scansione e non modifica le segnalazioni presenti.

# Proxy ambientale 0.9.13

Gli avvisi futuri senza quantità esplicita vengono conservati come `planned`/`automatic_pending`, senza contribuire ai totali eseguiti. Le date supportano anche intervalli e giorni multipli. Ogni refresh ricontrolla fino a quattro link della prima pagina di ciascuna fonte (i primi due e altri a rotazione), continua il backfill e riserva fino a otto dettagli al ricontrollo degli avvisi già acquisiti, mantenendo il limite complessivo di 40 dettagli. L'HTML degli archivi è riutilizzato soltanto all'interno dello stesso refresh.

`update_event` ricalcola immediatamente la posizione dell'evento corretto, fino a otto località; le altre restano in coda. Le coordinate e gli override precedenti vengono cancellati solo se cambia l'elenco delle località. I risultati sono vincolati all'area della città; nessun risultato significa nessun puntatore. Gli errori di rete restano ritentabili. Le revisioni manuali già salvate senza alcuna coordinata vengono riprese dopo almeno 24 ore dal precedente tentativo, dando precedenza agli eventi mai completati. Il frontend ricarica elenco e mappa al termine della revisione; `GET /v1/trees/events` usa `Cache-Control: no-store`.

Distribuire usando esplicitamente la configurazione locale che contiene il binding `TREE_DB` e i due cron:

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy --config ./wrangler.toml
```

Non servono nuove migrazioni né modifiche a `TREE_ADMIN_TOKEN` o `TREE_ADMIN_PASSWORD`. Dopo il deploy, un refresh manuale accelera il recupero degli avvisi e delle correzioni precedenti; può richiedere più esecuzioni. I nuovi campi `recentPagesChecked` e `recentSourceErrors` distinguono il controllo delle prime pagine dall'avanzamento storico. La versione attesa su `/health` è `0.9.13`.

# Proxy ambientale 0.9.12

La release 0.9.12 rende affidabile la scansione progressiva: i cursori avanzano soltanto dopo l’elaborazione riuscita dei dettagli e le pagine con più di 40 link vengono riprese tramite offset e firma persistenti. Corregge inoltre classificazione delle date future, riconoscimento delle quantità, distribuzione del budget fra le fonti e area geografica delle segnalazioni di Guidonia Montecelio. Richiede la migrazione `0011_tree_source_cursor_offsets.sql`.

# Proxy ambientale 0.9.11

La release 0.9.11 scandisce progressivamente gli archivi dell'anno corrente di Roma e Guidonia, una pagina per fonte a ogni esecuzione, conservando i cursori in D1. Vengono così recuperati anche gli avvisi pubblicati in precedenza ma con interventi programmati fino al 31 dicembre. Il refresh completo viene eseguito ogni giorno alle 03:00 UTC e restituisce lo stato di avanzamento di ciascuna fonte.

# Proxy ambientale 0.9.10

La release 0.9.10 suddivide le schede con più blocchi `Ubicazione` in record distinti, associando a ciascuno data, quantità e località del relativo blocco. Il primo record conserva la chiave storica della pagina; i successivi ricevono un suffisso stabile e condividono la stessa fonte. Il salvataggio è parametrizzato per Comune ed è utilizzabile anche per Guidonia Montecelio. Non sono previste nuove migrazioni dopo la `0009_retry_guidonia_geocoding.sql`.

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

- `GET /v1/trees/events?city=roma&year=2026` e `GET /v1/trees/events?city=guidonia-montecelio&year=2024` per il frontend;
- `POST /v1/trees/refresh` per avviare una scansione manuale autenticata;
- `POST /v1/trees/review` per confermare, correggere o rifiutare un evento;
- `POST /v1/trees/location-reports` per le segnalazioni geografiche;
- `POST /v1/trees/event-reports` per le segnalazioni sui dati dell’evento;
- un refresh completo ogni giorno alle 03:00 UTC e lo smaltimento della sola coda geografica ogni giorno alle 03:30 UTC.

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

Il Worker è identificato dalla versione proxy `0.9.13`.

### Pubblicazione Worker

Nei progetti già configurati, aggiornare anche il file locale `wrangler.toml` (normalmente escluso da Git per proteggere gli identificativi dell'ambiente):

```toml
[triggers]
crons = ["0 3 * * *", "10 3 * * *", "30 3 * * *"]
```

Poi distribuire il Worker:

```bash
cd cloudflare/temperature-proxy
npx wrangler@latest deploy
```

Al termine Wrangler deve mostrare entrambi gli schedule: `0 3 * * *` e `30 3 * * *`. Applicare prima le migrazioni `0010_tree_source_cursors.sql` e `0011_tree_source_cursor_offsets.sql`; la seconda permette di riprendere senza perdite una pagina archivio con più di 40 link. Non sono richieste modifiche a `TREE_ADMIN_TOKEN`.

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
