"""Check required viewer sources and preservation of nominal generated data."""
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import prepare_viewer


class PrepareViewerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.out = self.root / 'viewer'
        self.out.mkdir()
        for name, value in (('ROOT', self.root), ('OUT', self.out)):
            patcher = patch.object(prepare_viewer, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.layers = {
            'traffic_separation': 'traffic-separation.geojson',
            'military_areas': 'military-areas.geojson',
            'route_t': 'route-t.geojson',
            'land': 'land-osm.geojson',
            'course_lines': 'course-lines.geojson',
        }
        self.coast = {
            'metadata': {'source': 'OpenStreetMap natural=coastline',
                         'attribution': '© OpenStreetMap contributors', 'license': 'ODbL-1.0'},
            'features': [
                {'geometry': {'type': 'LineString', 'coordinates': [[10, 54], [11, 55]]}},
                {'geometry': {'type': 'MultiLineString',
                              'coordinates': [[[12, 56], [13, 57]], [[13, 57], [14, 58]]]}}
            ],
        }
        self.write('data/coastline-osm.geojson', self.coast)
        for key, filename in self.layers.items():
            self.write('data/' + filename, {'type': 'FeatureCollection', 'features': [],
                                           'metadata': {'source': key, 'attribution': 'Øresund'}})
        self.write('viewer/radar/manifest.json', {'frames': ['frame.png']})
        self.write('data/tractrac/combined_tracks.json', {
            'races': {'groensund': {'handicap': {'divisions': [{'uuid': 'class', 'raceStartTime': '1970-01-01 00:00:01 UTC'}]}}},
            'competitors': {'boat': {'nameShort': 'Ørn', 'source_course': 'groensund', 'source_id': '1',
                                     'classId': 'class', 'status': 10, 'statusTime': '1970-01-01T00:00:02Z'}},
            'tracks': {'boat': [[10, 54, 1000], [11, 55, 2000]]},
        })
        self.write('data/tractrac/speeds_groensund.json',
                   {'tracks': {'1': [[10, 54, 1000, 18.52], [11, 55, 2000, None]]}})
        self.write('data/tractrac/speeds_boegestroemmen.json', {'tracks': {}})
        self.wind = patch.object(prepare_viewer, 'wind', side_effect=lambda model: [{'model': model}])
        self.wind_mock = self.wind.start()
        self.addCleanup(self.wind.stop)

    def write(self, name, value):
        target = self.root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')

    def generate(self):
        with contextlib.redirect_stdout(io.StringIO()):
            prepare_viewer.main()

    def test_nominal_sources_preserved_without_duplicate_wind(self):
        self.generate()
        output = (self.out / 'data.js').read_text(encoding='utf-8')
        data = json.loads(output.removeprefix('window.DATA=')[:-1])
        self.assertNotIn('wind', data)
        self.assertEqual(list(data['wind_models']), ['era5', 'ecmwf_ifs', 'dmi_harmonie_arome_europe'])
        for model, points in data['wind_models'].items():
            self.assertEqual(points, [{'model': model}])
        self.assertEqual(data['coast_metadata'], self.coast['metadata'])
        self.assertEqual(data['coast'], [[[10, 54], [11, 55]], [[12, 56], [13, 57]], [[13, 57], [14, 58]]])
        for key, filename in self.layers.items():
            self.assertEqual(data[key], json.loads((self.root / 'data' / filename).read_text(encoding='utf-8')))
        self.assertEqual(data['boats'][0]['points'], [[10, 54, 1], [11, 55, 2]])
        self.assertEqual(data['boats'][0]['name'], 'Ørn')
        self.assertAlmostEqual(data['boats'][0]['speeds'][0], 10)
        self.assertIsNone(data['boats'][0]['speeds'][1])
        self.assertEqual(data['track_speed_metadata']['missing_speeds'], 1)
        self.assertEqual(data['radar'], {'frames': ['frame.png']})
        self.assertEqual((data['start'], data['end']), (-299, 302))

    def test_missing_nominal_map_source_fails_before_weather_and_preserves_output(self):
        output = self.out / 'data.js'
        output.write_text('previous output', encoding='utf-8')
        # Even an available legacy coastline must never substitute for OSM.
        self.write('data/coastline.geojson', self.coast)
        for filename in ['coastline-osm.geojson', *self.layers.values()]:
            with self.subTest(filename=filename):
                source = self.root / 'data' / filename
                original = source.read_bytes()
                source.unlink()
                try:
                    with self.assertRaises(FileNotFoundError) as error:
                        self.generate()
                    self.assertEqual(Path(error.exception.filename), source)
                    self.assertEqual(output.read_text(encoding='utf-8'), 'previous output')
                    self.wind_mock.assert_not_called()
                finally:
                    source.write_bytes(original)

    def test_coast_metadata_required_without_natural_earth_default(self):
        for metadata in [None, {}, {'source': 'Natural Earth', 'attribution': 'Natural Earth'},
                         {'source': 'OpenStreetMap natural=coastline', 'license': 'ODbL-1.0', 'attribution': ''},
                         {'source': 'OpenStreetMap natural=coastline', 'attribution': 'OSM'},
                         {'source': 'OpenStreetMap natural=coastline', 'license': 'other', 'attribution': 'OSM'}]:
            with self.subTest(metadata=metadata):
                coast = dict(self.coast)
                if metadata is None:
                    del coast['metadata']
                else:
                    coast['metadata'] = metadata
                self.write('data/coastline-osm.geojson', coast)
                with self.assertRaises((KeyError, ValueError)):
                    self.generate()
                self.assertFalse((self.out / 'data.js').exists())
                self.wind_mock.assert_not_called()


if __name__ == '__main__':
    unittest.main()
