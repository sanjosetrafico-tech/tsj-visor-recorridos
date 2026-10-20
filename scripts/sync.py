"""Export public My Maps KML, validate it, and publish one atomic GeoJSON snapshot."""
import argparse
import concurrent.futures
import datetime as dt
import json
import math
import os
from pathlib import Path
import re
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'k': 'http://www.opengis.net/kml/2.2'}


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.upper()) if not unicodedata.combining(c))


def direction(text):
    text = normalized(text)
    ida = bool(re.search(r'\bIDA\b', text))
    vuelta = bool(re.search(r'\b(VUELTA|REGRESO)\b', text))
    return 'ambos' if ida and vuelta else 'ida' if ida else 'vuelta' if vuelta else 'sin identificar'


def coordinates(element, minimum):
    values = []
    for token in (element.findtext('k:coordinates', '', NS)).split():
        parts = token.split(',')
        if len(parts) < 2:
            raise ValueError('Coordenada incompleta')
        lon, lat = map(float, parts[:2])
        if not math.isfinite(lon) or not math.isfinite(lat) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError('Coordenada fuera de rango')
        values.append([lon, lat])
    if len(values) < minimum:
        raise ValueError('Geometría incompleta')
    return values


def parse_kml(raw, source):
    root = ET.fromstring(raw)
    if root.tag != '{'+NS['k']+'}kml':
        raise ValueError('La respuesta no es un KML válido')
    if root.find('.//k:NetworkLink', NS) is not None:
        raise ValueError('KML con enlaces externos: requiere exportación completa')
    features = []

    def walk(element, folders):
        if element.tag.endswith('}Folder'):
            folders = folders + [element.findtext('k:name', '', NS).strip()]
        if element.tag.endswith('}Placemark'):
            name = element.findtext('k:name', '', NS).strip()
            # Prefer the placemark label, then the nearest explicitly labelled folder.
            labels = [name] + list(reversed(folders))
            sense = next((direction(t) for t in labels if direction(t) != 'sin identificar'), 'sin identificar')
            properties = {'sourceId': source['id'], 'line': source['name'], 'name': name or (folders[-1] if folders else source['name']), 'folder': ' / '.join(folders), 'direction': sense}
            for kind, minimum in [('LineString', 2), ('Point', 1)]:
                for geom in element.findall('.//k:'+kind, NS):
                    coords = coordinates(geom, minimum)
                    features.append({'type': 'Feature', 'properties': properties.copy(), 'geometry': {'type': kind, 'coordinates': coords if kind == 'LineString' else coords[0]}})
            return
        for child in element:
            walk(child, folders)

    walk(root, [])
    if not any(f['geometry']['type'] == 'LineString' for f in features):
        raise ValueError('El KML no contiene recorridos')
    return features


def fetch_source(source, local=None):
    url = f"https://www.google.com/maps/d/kml?mid={source['id']}&forcekml=1"
    if local:
        raw = (Path(local) / (source['id']+'.kml')).read_bytes()
    else:
        request = urllib.request.Request(url, headers={'User-Agent': 'TSJ-Visor/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read(20_000_001)
        if len(raw) > 20_000_000:
            raise ValueError('KML demasiado grande')
    features = parse_kml(raw, source)
    return {**source, 'kmlUrl': url, 'verifiedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'features': features}


def sync(local=None):
    sources = json.loads((ROOT / 'sources.json').read_text(encoding='utf-8'))
    if len(sources) != 13 or len({s['id'] for s in sources}) != 13:
        raise ValueError('Se requieren exactamente 13 fuentes únicas')
    # Any failed source aborts the entire publication, preserving the last complete snapshot.
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda s: fetch_source(s, local), sources))
    features = [f for result in results for f in result['features']]
    snapshot = {'type': 'FeatureCollection', 'updatedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'sources': [{k:v for k,v in r.items() if k != 'features'} for r in results], 'features': features}
    target = ROOT / 'docs/data/routes.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    os.replace(temporary, target)
    for r in results:
        lines = [f for f in r['features'] if f['geometry']['type'] == 'LineString']
        print(f"{r['name']}: {len(lines)} tramos; sentidos: {', '.join(sorted({f['properties']['direction'] for f in lines}))}")
    print(f'Snapshot completo: {len(results)} mapas, {len(features)} geometrías.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--local-kml', help='Directorio de KML previamente descargados y verificados')
    args = parser.parse_args()
    sync(args.local_kml)
