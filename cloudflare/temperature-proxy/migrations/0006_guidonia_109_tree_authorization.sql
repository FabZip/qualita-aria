UPDATE tree_events
SET
  location_name = 'Località e vie nel territorio di Guidonia Montecelio',
  locations_json = '["Via Nuova, Montecelio","Via XXV Aprile - Parco San Michele, Montecelio","Via della Pietrata - via degli Spagnoli, Guidonia","Viale Roma - Parcheggio viale Roma (Peghetti) - Area verde Maggiore Roberto Giontella, Guidonia","Piazza Amedeo d''Aosta - Piazza Caduti di Nassirya (viale Roma), Guidonia","Via Umberto Maddalena - Parco della Croce Rossa Italiana - Scalinata Padre Lino Lottatori - via Giulio Douhet - Stadio Comunale - via Camarotta Adorno - via Archita di Tar, Guidonia","Viale Roma - via Marco Aurelio (scuola I.C. Don L. Milani), Guidonia","Via Collefarina, Guidonia","Via Umberto I, Villanova","Rotonda via Garibaldi, Villanova","Area verde Bartolini, Collefiorito","Via delle Petunie - via Casal Bianco, Collefiorito","Via dei Castagni, Albuccione","Via Nomentana, Poggio Fiorito","Via Nomentana, Colleverde","Piazza Trilussa, Setteville","Via Natalia Ginzburg - via Giovanni Verga, Setteville"]',
  event_type = 'decrement',
  quantity = 109,
  status = 'planned',
  validation = 'manual_confirmed',
  title = 'Autorizzazione paesaggistica per l''abbattimento di 109 alberi e successivo reimpianto',
  raw_excerpt = 'L''atto autorizza l''abbattimento di n. 109 alberi di differenti essenze in località varie e prevede il successivo reimpianto sostitutivo. La quantità non è ripartita per ubicazione e l''atto non certifica l''esecuzione.',
  latitude = NULL,
  longitude = NULL,
  geocode_precision = NULL,
  geocode_label = NULL,
  location_points_json = NULL,
  geocoded_at = NULL,
  updated_at = '2026-09-06T00:00:00.000Z'
WHERE source_key = 'guidonia-2024-abbattimenti-reimpianti';
