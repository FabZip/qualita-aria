# Qualità dell'aria

PWA mobile-first per esplorare dati reali sulla qualità dell'aria su una mappa interattiva, confrontare periodi storici quando la fonte lo consente e distinguere chiaramente tra misure di stazione e valutazioni territoriali.

L'app è pubblicata come sito statico su GitHub Pages e usa un Cloudflare Worker come proxy sicuro per OpenAQ, così la API key non viene mai esposta nel browser.

## Fonti dati

### EEA · stazioni

La fonte EEA utilizza le statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei.

Aree disponibili:

- **Italia** — mostra una seconda selezione **Città** con i capoluoghi e co-capoluoghi italiani; **Roma** è selezionata di default.
- **Europa**

Quando l'area è **Italia**, il capoluogo selezionato determina la posizione iniziale della mappa. Se l'utente sposta o ingrandisce la mappa, dopo **2 secondi senza ulteriori movimenti** la query EEA viene aggiornata usando la bounding box effettivamente visibile. La finestra geografica non rappresenta il confine amministrativo del comune o della provincia.

Inquinanti attivi:

- PM2.5
- PM10
- NO₂

Per le statistiche annuali l'app usa in via prioritaria i dati **E1a validati**. Per l'anno più recente, se la statistica annuale validata non è ancora disponibile per una città italiana, può usare come fallback le osservazioni **E2a / UTD preliminari** del servizio ufficiale EEA e calcolare una media annuale provvisoria.

I dati UTD sono sempre marcati con **◐ Preliminare UTD** e non vengono presentati come equivalenti ai dati **✓ Validati E1a**. Le medie UTD vengono mostrate solo quando la serie scelta raggiunge almeno il 75% di copertura dell'anno.

La visualizzazione sfumata attorno alle stazioni è una rappresentazione grafica dei punti misurati e non una superficie modellata continua.

## ARPA Lazio · comune

La fonte ARPA Lazio utilizza le valutazioni comunali annuali ufficiali per il Comune di Roma.

L'app legge direttamente i file annuali pubblicati da ARPA Lazio e ricava, quando disponibili:

- MIN
- MED
- MAX

per:

- PM2.5
- PM10
- NO₂

Il colore applicato al perimetro del Comune indica l'ambito territoriale della valutazione. Non implica che la concentrazione sia uniforme in ogni punto del territorio.

## OpenAQ · area visibile

OpenAQ viene usato per estendere la copertura oltre l'Europa.

Per evitare richieste mondiali troppo grandi, i dati vengono caricati solo per la bounding box attualmente visibile sulla mappa.

Caratteristiche:

- zoom-out limitato per impedire una vista dell'intero pianeta;
- caricamento con debounce condiviso: dopo `moveend` l'app attende 2 secondi senza altri movimenti prima di aggiornare i dati;
- monitor fissi classificati come reference monitor;
- esclusione dei sensori mobili;
- recenza selezionabile: 7, 15 o 30 giorni;
- suddivisione automatica della bounding box in quadranti quando una zona contiene troppe location;
- nessun risultato parziale silenzioso: nelle aree ancora troppo dense viene richiesto di aumentare lo zoom;
- cache Cloudflare per ridurre richieste duplicate.

Inquinanti OpenAQ attivi:

- PM2.5
- PM10

NO₂ non è ancora attivo nella vista OpenAQ perché i dati possono essere espressi con unità diverse; l'app evita di mescolare valori non omogenei sulla stessa scala.

## Modalità di visualizzazione

### Mappa

Mostra i dati della fonte, dell'inquinante e del periodo selezionati.

Le stazioni sono ricercabili e l'elenco è paginato. Selezionando una stazione dall'elenco, la mappa viene centrata sulla relativa posizione.

Gli aggiornamenti provocati da pan e zoom sono centralizzati: l'app aspetta **2 secondi dopo l'ultimo movimento** prima di ricaricare. Questo evita richieste ripetute mentre l'utente sta ancora esplorando la mappa. Per EEA e OpenAQ la nuova richiesta usa l'area visibile; ARPA Lazio mantiene invece il proprio ambito comunale perché la fonte attuale riguarda Roma.

Per ridurre la latenza EEA, le richieste passano da un **Worker Cloudflare dedicato**. Le statistiche annuali E1a vengono memorizzate nella Cache API del Worker e quindi possono essere riutilizzate anche dopo un reload o da un'altra sessione. Il browser mantiene inoltre una cache spaziale locale: piccoli spostamenti dentro la stessa cella non generano una nuova richiesta.

Per i dati preliminari UTD, il Worker memorizza sia l'elenco dei file sia i **Parquet binari per 6 ore**. Il browser li elabora una sola volta per **città + anno + inquinante** durante la sessione e poi filtra localmente la viewport.

### Confronto

Per le fonti storiche compatibili, mostra due periodi sincronizzati tramite divisore swipe.

L'elenco riporta entrambi i valori e indica se il valore è aumentato, diminuito o rimasto stabile.

### Differenza

Calcola la variazione tra due periodi sulle entità presenti in entrambi i dataset.

Per OpenAQ il confronto è temporaneamente disabilitato: la vista attuale rappresenta l'ultimo dato disponibile entro una finestra di recenza e non sarebbe corretto confrontare direttamente misure acquisite in momenti differenti.

## Periodi temporali

EEA e ARPA sono attualmente collegati a dataset annuali, quindi il selettore mensile non viene mostrato.

L'aggregazione mensile potrà essere aggiunta usando flussi dati dedicati. Questo sarà anche uno dei presupposti per un confronto OpenAQ temporalmente omogeneo.

OpenAQ non mostra un selettore anno/periodo, perché la vista rappresenta sempre l'ultimo dato disponibile. Mostra invece soltanto la **recenza massima** accettata:

- 7 giorni
- 15 giorni
- 30 giorni

## Interpretazione dei dati

L'app distingue tra:

- **stazioni misurate**, rappresentate come punti;
- **valutazioni territoriali**, rappresentate sul relativo perimetro amministrativo.

La heatmap serve esclusivamente a facilitare la lettura spaziale dei punti e non deve essere interpretata come interpolazione scientifica o modello atmosferico.

## Temperatura · stazioni fisiche nelle fonti osservazionali

Il selettore `Fonte inquinante` continua a scegliere esclusivamente EEA,
ARPA Lazio o Globale · OpenAQ.

I cerchi e le etichette numeriche dell'inquinante non vengono più mostrati
sulla mappa: su mobile il campo cromatico resta leggibile e i valori puntuali
rimangono nell'elenco sotto la mappa.

### ARPA Lazio

La temperatura usa la rete micro-meteorologica fisica ARPA Lazio. I marker
`🌡` hanno dimensione fissa e restano alle coordinate reali delle postazioni.

### EEA

La temperatura non viene ricavata da EEA. Nel Lazio viene data priorità ad
ARPA Lazio. Fuori dal Lazio vengono cercate stazioni fisiche nel layer
NOAA/NCEI **Global Summary of the Year (GSOY)**.

GSOY fornisce direttamente TMIN (Mean Min Temp), TAVG (Annual Mean Temp) e
TMAX (Mean Max Temp). Sono mostrate soltanto stazioni con coordinate e tutti e
tre i valori annuali.

Una stazione fisica può non essere disponibile nel solo GSOY per un certo
anno quando il servizio annuale non pubblica la tripla completa TMIN / TAVG /
TMAX. In questo caso l'app tenta il fallback osservativo descritto sotto, senza
sostituire la stazione con dati a celle.

Quando GSOY non pubblica la tripla annuale, il Worker cerca le stazioni fisiche
WMO/ICAO nel catalogo NOAA/NCEI GSOD e usa i dump giornalieri Meteostat. Ogni
valore viene accettato soltanto se le colonne di provenienza di temperatura
media, minima e massima indicano esclusivamente provider osservativi. Fonti
modellistiche, previsioni e interpolazioni sono escluse. La stazione viene
mostrata solo con almeno il 75% dei giorni validi nell'anno.

Per Bari 2025 questo fallback restituisce le stazioni fisiche `BARI` (WMO
16270, ICAO LIBD) e `GIOIA DEL COLLE` (WMO 16312, ICAO LIBV), entrambe con
copertura osservativa superiore al 98%.

Per Firenze 2025 restituisce `FIRENZE` (WMO 16170, ICAO LIRQ) con copertura
osservativa del 98,4%, oltre a `CIMONE MOUNTAIN` quando compresa nell'area
visibile.

I dati Meteostat richiedono attribuzione; nell'app vengono mantenuti il nome
della fonte, i codici WMO/ICAO, i provider osservativi usati e la percentuale
di copertura.

### Globale · OpenAQ

OpenAQ mostra esclusivamente l'inquinante. Non vengono caricati marker, celle o
heatmap ERA5-Land.

### Modalità Temperatura

La modalità/tab `Temperatura` è stata rimossa completamente dall'interfaccia.
Non viene più inizializzata la visualizzazione ERA5-Land a celle/superficie.

## PWA

L'app può essere installata dal browser tramite il pulsante **Installa app**.

Il service worker conserva la shell applicativa per migliorare caricamento e resilienza, mentre i dati ambientali reali vengono richiesti dalla rete e non vengono sostituiti da dati simulati offline.

## Splash screen A.R.I.A.

All'inizio di una nuova sessione viene mostrata la splash approvata di **A.R.I.A. — Analisi e Rappresentazione degli Indicatori Ambientali**. È un overlay temporaneo: MapLibre, interfaccia e fonti iniziano a caricarsi normalmente dietro di essa.

La chiave `sessionStorage` è `ariaSplashShown`. La durata ordinaria è 3 secondi, con dissolvenza di 380 ms; con `prefers-reduced-motion` la permanenza scende a 850 ms e la dissolvenza a 180 ms. Un timeout di sicurezza avvia comunque la chiusura entro 4,6 secondi. Il pulsante `Salta` chiude immediatamente la schermata e il nodo viene rimosso realmente dal DOM.

I file attivi sono `css/aria-splash.css` e `js/aria-splash.js`; gli stili sono limitati a `#aria-splash` e alle classi `.aria-splash__*`. La cartella `aria-splash/` rimane nel repository come demo approvata e non viene caricata dall'app né aggiunta alla cache offline.

## Statistiche arboree

La fonte **Alberi · fonti comunali** mostra eventi e bilanci arborei documentati, separandoli dal censimento del patrimonio esistente. Un albero censito non viene considerato una nuova piantumazione; una sparizione tra due censimenti non viene considerata un abbattimento senza conferma della fonte.

Queste statistiche non descrivono lo stato fitosanitario, la vitalità o la condizione degli alberi esistenti. Lo stato dell'evento — per esempio programmato, eseguito o urgente — viene invece conservato quando è dichiarato dalla fonte.

La prima fonte attiva è il [Bilancio Arboreo di Roma Capitale](https://www.comune.roma.it/web/it/scheda-servizi.page?contentId=INF70550). I bilanci 2017–2020 e il dato parziale 2021 sono rappresentati come aggregati comunali, quindi non vengono creati falsi punti sulle strade. Il totale novembre 2021–dicembre 2025 resta aggregato e non viene suddiviso tra i singoli anni.

Quando il dato è comunale, la mappa colora il confine amministrativo in base al saldo: verde se le piantumazioni superano tagli o decrementi, rosso nel caso opposto. Un indicatore circolare mostra il rapporto proporzionale tra le due quantità e il totale degli interventi; sotto la mappa due barre rendono confrontabili i valori e mostrano il saldo esplicito. L'indicatore è dichiarato come riepilogo dell'intero Comune e non come posizione dei singoli alberi.

Quando saranno disponibili dati territoriali verificati, la stessa rappresentazione potrà essere applicata a Municipi o quartieri. I marker puntuali saranno utilizzati soltanto per interventi associati a coordinate o indirizzi reali. Ogni record dichiara comunque la precisione geografica (`point`, `address`, `district` o `city`). Padova, Bologna e Torino sono predisposte ma non dichiarate disponibili finché non vengono verificate fonti pubbliche di eventi, storici confrontabili o documenti ufficiali sufficienti.

I dati arborei consolidati sono pre-elaborati in JSON/GeoJSON; il frontend non interpreta direttamente PDF o grandi portali durante la navigazione.

Dalla versione 0.4.5 il proxy Cloudflare esegue inoltre una scansione mensile delle fonti configurate di Roma Capitale e conserva i nuovi eventi in un database D1. Il frontend unisce questi risultati al dataset consolidato, eliminando i duplicati in base alla pagina ufficiale. Se il proxy o D1 non sono disponibili, l'app continua a funzionare usando `data/trees.json` come fallback.

La classificazione automatica è prudente: un evento viene confermato automaticamente soltanto quando pagina, quantità, tipo e stato di esecuzione sono inequivocabili. Pagine con interventi multipli, lavori futuri o formulazioni miste vengono indicate come `da verificare` e non modificano il totale minimo. Le correzioni manuali sono effettuabili tramite un endpoint amministrativo protetto da token.

La fonte arborea utilizza le stesse tre modalità delle altre fonti:

- **Mappa**: bilancio dell'anno selezionato o periodo aggregato dichiarato esplicitamente;
- **Confronto**: due mappe per due bilanci annuali documentati;
- **Differenza**: variazione del saldo fra due anni comparabili.

Un totale pluriennale non viene ripartito artificialmente e quindi non entra nei confronti o nelle differenze fra singoli anni. Il bilancio novembre 2021–dicembre 2025 e la stagione 2024–marzo 2025 sono selezioni autonome.

Per il 2023, 2024, 2025 e 2026 l'app include una raccolta iniziale di avvisi e notizie ufficiali con data, luogo, stato e quantità. La loro somma è indicata come **totale minimo documentato**, non come totale annuale completo: gli avvisi pubblicamente reperibili potrebbero non coprire tutti gli interventi. Quantità sconosciute ed eventi soltanto programmati o annunciati sono mostrati nell'elenco ma non vengono sommati al minimo eseguito.

Per il 2026 il minimo iniziale comprende 603 alberi messi a dimora e 19 abbattimenti confermati. Ulteriori quantità comunicate per programmi e interventi non ancora attestati come completati restano visibili con il relativo stato, senza alterare il saldo minimo.

La risposta dinamica espone la data dell'ultima scansione. Nell'interfaccia viene indicato se l'aggiornamento automatico è attivo oppure se è in uso il fallback locale.

La procedura per forzare una scansione senza salvare il token nella cronologia del terminale è documentata in `cloudflare/temperature-proxy/README.md`. L'app e il cron mensile non conoscono e non richiedono il token amministrativo.

La modalità `Differenza` calcola una variazione soltanto quando le due selezioni hanno la stessa natura: bilancio ufficiale con bilancio ufficiale oppure raccolta parziale con raccolta parziale.

## Architettura

Frontend:

- HTML, CSS e JavaScript
- MapLibre GL JS
- hyparquet per la lettura browser dei file EEA UTD in formato Parquet
- SheetJS per i file XLSX ARPA
- GitHub Pages

Dati e servizi:

- EEA Discodata
- elenco locale dei capoluoghi italiani per delimitare le query EEA
- file ufficiali ARPA Lazio
- OpenAQ API v3
- Cloudflare Worker per proteggere la API key OpenAQ e applicare cache, filtri e limiti geografici
