UPDATE tree_events
SET
  latitude = NULL,
  longitude = NULL,
  geocode_precision = NULL,
  geocode_label = NULL,
  location_points_json = NULL,
  geocoded_at = NULL,
  updated_at = '2026-09-06T00:00:00.000Z'
WHERE city = 'guidonia-montecelio'
  AND validation != 'manual_rejected';
