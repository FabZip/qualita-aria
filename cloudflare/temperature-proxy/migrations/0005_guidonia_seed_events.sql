INSERT INTO tree_events (
  source_key, city, year, event_date, location_name, locations_json,
  event_type, quantity, status, validation, title, source_url,
  source_published_at, first_seen_at, last_checked_at, raw_excerpt,
  updated_at, latitude, longitude, geocode_precision, geocode_label,
  location_points_json, geocoded_at
) VALUES (
  'guidonia-2024-forestazione-avr',
  'guidonia-montecelio',
  2024,
  '2024-01-01',
  'Territorio comunale di Guidonia Montecelio',
  '["Territorio comunale di Guidonia Montecelio"]',
  'planting',
  61,
  'completed',
  'manual_confirmed',
  'Forestazione urbana: prima fase da 61 alberi',
  'https://avrgroup.it/forestazione-urbana-a-guidonia-montecelio-un-progetto-sostenibile-del-gruppo-avr/',
  '2024-01-01',
  '2026-09-06T00:00:00.000Z',
  '2026-09-06T00:00:00.000Z',
  'Nel 2024 sono stati piantati 61 nuovi alberi sul territorio comunale nell’ambito del protocollo con l’Amministrazione.',
  '2026-09-06T00:00:00.000Z',
  41.9938,
  12.7268,
  'city',
  'Guidonia Montecelio',
  '[{"coordinates":[12.7268,41.9938],"precision":"city","label":"Guidonia Montecelio","geometry":null,"geometryChecked":true}]',
  '2026-09-06T00:00:00.000Z'
) ON CONFLICT(source_key) DO NOTHING;

INSERT INTO tree_events (
  source_key, city, year, event_date, location_name, locations_json,
  event_type, quantity, status, validation, title, source_url,
  source_published_at, first_seen_at, last_checked_at, raw_excerpt, updated_at
) VALUES (
  'guidonia-2024-abbattimenti-reimpianti',
  'guidonia-montecelio',
  2024,
  '2024-10-03',
  'Montecelio · Guidonia · Setteville · Colleverde · Villanova · Collefiorito · Albuccione',
  '["Montecelio","Guidonia","Setteville","Colleverde","Villanova","Collefiorito","Albuccione"]',
  'unknown',
  NULL,
  'reported',
  'automatic_pending',
  'Abbattimento di alberature e successivo reimpianto in località varie',
  'https://guidonia.halleyweb.it/zf/index.php/atti-amministrativi/determine/dettaglio/atto/G1WpNM0T6UT0-A',
  '2024-10-03',
  '2026-09-06T00:00:00.000Z',
  '2026-09-06T00:00:00.000Z',
  'Autorizzazione paesaggistica per abbattimento e successivo reimpianto; quantità non pubblicata.',
  '2026-09-06T00:00:00.000Z'
) ON CONFLICT(source_key) DO NOTHING;

INSERT INTO tree_events (
  source_key, city, year, event_date, location_name, locations_json,
  event_type, quantity, status, validation, title, source_url,
  source_published_at, first_seen_at, last_checked_at, raw_excerpt, updated_at
) VALUES (
  'guidonia-valle-pilella-messa-dimora',
  'guidonia-montecelio',
  2024,
  '2024-01-01',
  'Parco di Valle Pilella',
  '["Parco di Valle Pilella"]',
  'planting',
  NULL,
  'reported',
  'automatic_pending',
  'Messa a dimora di alberature nel Parco di Valle Pilella',
  'https://guidonia.halleyweb.it/zf/index.php/atti-amministrativi/ordinanze/index/table-ordinanze-public-page/553',
  '2024-01-01',
  '2026-09-06T00:00:00.000Z',
  '2026-09-06T00:00:00.000Z',
  'Chiusura del parco per lavori di messa a dimora; quantità non pubblicata.',
  '2026-09-06T00:00:00.000Z'
) ON CONFLICT(source_key) DO NOTHING;
