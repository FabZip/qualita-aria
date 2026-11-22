#!/usr/bin/env python3
"""Build the Italian postal lookup from the official GeoNames IT.zip (CC BY 4.0).
Usage: python3 tools/build_postal_codes.py /path/to/IT.zip --date YYYY-MM-DD
Source: https://download.geonames.org/export/zip/IT.zip
"""
import argparse
import json
import math
import re
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('archive', type=Path)
parser.add_argument('--date', required=True)
args = parser.parse_args()
if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.date):
    parser.error('Date must be YYYY-MM-DD')
codes = {}
with zipfile.ZipFile(args.archive) as archive:
    for line in archive.read('IT.txt').decode('utf-8').splitlines():
        row = line.split('\t')
        if len(row) < 12 or row[0] != 'IT' or not re.fullmatch(r'\d{5}', row[1]):
            raise ValueError('Unexpected GeoNames postal record')
        lat, lon = float(row[9]), float(row[10])
        if not math.isfinite(lat) or not math.isfinite(lon) or abs(lat) > 90 or abs(lon) > 180:
            raise ValueError('Invalid postal coordinates')
        entry = [row[2], row[5], row[3], lat, lon]
        entries = codes.setdefault(row[1], [])
        if entry not in entries:
            entries.append(entry)
for entries in codes.values():
    entries.sort(key=lambda row: row[0].casefold())
result = {'source': 'https://download.geonames.org/export/zip/IT.zip',
          'attribution': 'GeoNames', 'license': 'CC BY 4.0', 'updatedAt': args.date,
          'coordinatePrecision': 'locality', 'codes': dict(sorted(codes.items()))}
out = Path(__file__).resolve().parents[1] / 'data' / 'italian-postal-codes.json'
out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{len(codes)} postal codes, {sum(map(len, codes.values()))} localities, {out.stat().st_size} bytes')
