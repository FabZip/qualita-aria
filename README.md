# A.R.I.A. — Analisi e Rappresentazione degli Indicatori Ambientali

A.R.I.A. è un’app web gratuita per consultare le condizioni ambientali e gli eventi del territorio. Riunisce meteo, qualità dell’aria, interventi sugli alberi, allerte, terremoti e aree bruciate, con mappe e collegamenti alle fonti originali.

È una Progressive Web App (PWA): si usa dal browser su computer e smartphone e può essere installata nella schermata Home.

## Navigazione

Sotto il logo, la barra di navigazione offre un **menu con icone** per aprire tutte le sezioni, con **Dashboard** come prima voce. Ogni pagina mostra soltanto i propri filtri, senza selettore della fonte. Le schede di Intorno a me mantengono le icone colorate.

Ogni sezione ha un collegamento diretto e il pulsante Indietro del browser permette di ripercorrere le pagine visitate.

## Intorno a me

La schermata iniziale presenta schede con icone per le informazioni della località scelta: meteo, previsioni della qualità dell’aria, eventi arborei documentati, allerte disponibili e terremoti recenti.

La posizione può essere individuata con **Geolocalizza**, previo consenso, oppure cercando una città, un paese o un CAP italiano. I suggerimenti permettono di distinguere le località omonime. Nome e coordinate rendono riconoscibile il punto consultato; se la posizione non è disponibile, l’app invita a cercare una località.

La località è condivisa tra riepilogo, meteo, diario, allerte, terremoti e incendi ed è trasferita alle viste della qualità dell’aria. La sezione Alberi mantiene il proprio elenco di comuni coperti.

## Cosa puoi consultare

| Sezione | Informazioni disponibili |
| --- | --- |
| **Meteo** | Condizioni attuali stimate, temperatura percepita, umidità, vento, precipitazioni, previsioni orarie e a sette giorni da Open-Meteo. Mappa radar con animazione e controlli ufficiali RainViewer. |
| **Qualità dell’aria · EEA** | Stazioni europee, dati osservati disponibili, statistiche annuali e dati preliminari distinti dai validati. Ricerca delle stazioni e consultazione per area, inquinante e periodo. |
| **Qualità dell’aria · OpenAQ** | Stazioni e misure nell’area visibile della mappa, con selezione della città o geolocalizzazione, inquinante e finestra temporale. |
| **Previsioni qualità dell’aria** | Previsioni modellistiche CAMS tramite Open-Meteo per PM10, PM2.5, NO₂, O₃, SO₂ e CO, con riepiloghi giornalieri e per fascia oraria. |
| **Neve** | Nevicate stimate e neve prevista per la località cercata, spessore al suolo e mappa di località montane italiane campione tramite Open-Meteo. Avvisi ufficiali neve/ghiaccio MeteoAlarm con area regionale, livello e validità. |
| **Alberi** | Bilanci, piantumazioni, abbattimenti e interventi documentati dalle fonti comunali, con luogo, quantità quando nota, periodo dei lavori, stato e fonte. Le raccolte di eventi coprono Roma e Guidonia Montecelio. |
| **Allerte** | Bollettini ufficiali della Protezione Civile per la zona della località scelta: rischio idraulico, temporali e rischio idrogeologico, con simboli e livelli colorati, scelta della giornata, validità e collegamento alla fonte. |
| **Terremoti** | Eventi registrati da INGV, con magnitudo evidenziata, profondità, ora, epicentro e distanza. Una scheda mostra l’ultimo terremoto del catalogo anche senza geolocalizzazione; il clic sull’evento centra la mappa sull’epicentro. |
| **Incendi** | Aree bruciate rilevate da Copernicus EFFIS negli ultimi uno, sette o trenta giorni. Una scheda mostra l’ultima area rilevata nel catalogo, senza filtro di distanza; il clic inquadra il suo perimetro. Collegamento al visualizzatore ufficiale per punti caldi satellitari e pericolo previsto. |

Le viste osservazionali della qualità dell’aria possono affiancare informazioni sulle temperature delle stazioni fisiche disponibili.

Le sezioni condividono intestazioni con icone colorate e uno stile uniforme per schede, riepiloghi e pannelli. I livelli di allerta mantengono simboli e colori dedicati.

## Diario ambientale

Il diario riunisce gli eventi arborei documentati e i terremoti in una cronologia con mappa. Consente di cercare per testo e filtrare per categoria, periodo e distanza dalla località scelta, da 10 a 200 km.

Gli interventi futuri restano riconoscibili come **programmati**, distinti da quelli eseguiti o da verificare. Ogni evento conserva il collegamento alla fonte; gli eventi senza posizione o data non vengono collocati sulla mappa. Le aree bruciate e i bollettini di allerta si consultano nelle rispettive sezioni.

## Mappe e confronti

Le sezioni storiche compatibili offrono tre modalità:

- **Mappa**: dati e luoghi del periodo selezionato.
- **Confronto**: due periodi affiancati su mappe sincronizzate.
- **Differenza**: variazione fra periodi e dati confrontabili.

Gli elenchi consentono di trovare stazioni o eventi e riconoscerne la posizione sulla mappa. Le nuove mappe del diario, dei terremoti e delle aree bruciate e della neve richiedono due dita per lo spostamento su dispositivi touch. Il radar RainViewer dispone di un comando per attivare o bloccare l’interazione.

Per gli alberi è possibile segnalare problemi relativi agli eventi o alla loro posizione. L’amministrazione protetta permette di correggere quantità, tipo, stato, date e località, dividere gli interventi mantenendo la fonte comune ed escludere eventi errati dagli aggiornamenti successivi.

## Come leggere i dati

L’app distingue **misure osservate, stime modellistiche, previsioni e interventi programmati**. La disponibilità dipende dalla copertura delle fonti e dal periodo scelto; un dato mancante non viene sostituito con zero.

Le raccolte arboree possono essere parziali: i totali documentati non rappresentano necessariamente tutti gli interventi del comune. I terremoti sono eventi registrati, non previsioni; il catalogo consultato comprende al massimo i 500 eventi più recenti dell’ultimo anno entro 200 km, con segnalazione del limite quando raggiunto.

Un bollettino scaduto o una zona di allerta non individuata non significano assenza di rischio. Analogamente, l’assenza di aree bruciate sulla mappa non esclude incendi piccoli, recenti o non rilevati. Per le comunicazioni operative restano disponibili i collegamenti alle autorità e ai servizi ufficiali.

Le funzioni che consultano dati aggiornati richiedono una connessione Internet. Fonti, validità e limiti di copertura sono indicati nelle rispettive sezioni.
