import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sync', Path(__file__).resolve().parents[1] / 'scripts/sync.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
SOURCE = {'id': 'test', 'name': 'Línea de prueba'}


def kml(body):
    return '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+body+'</Document></kml>'


LINE = '<Placemark><name>Tramo</name><LineString><coordinates>-60,-31,0 -60.1,-31.1,0</coordinates></LineString></Placemark>'


class KmlTests(unittest.TestCase):
    def test_nested_folder_direction_and_coordinates(self):
        features = sync.parse_kml(kml('<Folder><name>VUELTA</name><Folder><name>Ramal 2</name>'+LINE+'</Folder></Folder>'), SOURCE)
        self.assertEqual(features[0]['properties']['direction'], 'vuelta')
        self.assertEqual(features[0]['geometry']['coordinates'], [[-60., -31.], [-60.1, -31.1]])

    def test_unknown_direction_is_not_guessed(self):
        self.assertEqual(sync.parse_kml(kml(LINE), SOURCE)[0]['properties']['direction'], 'sin identificar')

    def test_reject_html_or_empty_or_network_link(self):
        for data in ['<html>Login</html>', kml(''), kml('<NetworkLink/>'+LINE)]:
            with self.assertRaises(ValueError):
                sync.parse_kml(data, SOURCE)

    def test_reject_invalid_coordinates(self):
        for coord in ['NaN,-31', '-60,91', '10', '0,0']:
            with self.assertRaises(ValueError):
                sync.parse_kml(kml('<Placemark><LineString><coordinates>'+coord+'</coordinates></LineString></Placemark>'), SOURCE)

    def test_both_directions(self):
        self.assertEqual(sync.direction('Ida y vuelta'), 'ambos')
        self.assertEqual(sync.direction('REGRESO'), 'vuelta')
        self.assertEqual(sync.direction('Avenida'), 'sin identificar')


if __name__ == '__main__':
    unittest.main()
