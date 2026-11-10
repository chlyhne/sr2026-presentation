"""Start signals, complete source windows and GPS boundary coverage."""
import copy
import unittest
from race_times import official_start, viewer_time_window, validate_track_boundaries


class RaceTimeTests(unittest.TestCase):
    def setUp(self):
        self.source = {'races': {'course': {'handicap': {'divisions': [
            {'uuid': 'early', 'raceStartTime': '1970-01-01 00:10:00 UTC'},
            {'uuid': 'late', 'raceStartTime': '1970-01-01 00:20:00 UTC'}]}}},
            'competitors': {
                'a': {'nameShort': 'Early', 'source_course': 'course', 'classId': 'early', 'status': 10,
                      'statusTime': '1970-01-01T01:00:00Z', 'startTime': '1970-01-01T00:15:00Z'},
                'b': {'nameShort': 'Late', 'source_course': 'course', 'classId': 'late', 'status': 3}},
            'tracks': {'a': [[11, 55, t * 1000] for t in [500, 700, 1000, 3500, 3700]],
                       'b': [[12, 56, t * 1000] for t in [1100, 1300, 5000]]}}

    def test_class_signal_is_start_even_when_a_boat_crosses_late(self):
        self.assertEqual(official_start(self.source['races']['course'], self.source['competitors']['a']), 600)
        rows = validate_track_boundaries(self.source)
        self.assertEqual(rows[0]['start'], 600)
        self.assertEqual(rows[0]['start_bracket'], [500, 700])
        self.assertEqual(rows[0]['finish_bracket'], [3500, 3700])
        self.assertEqual(rows[1]['start'], 1200)

    def test_full_window_keeps_early_start_and_latest_track_end(self):
        self.assertEqual(viewer_time_window(self.source), (300, 5300))

    def test_missing_start_must_fail_instead_of_starting_at_first_position(self):
        source = copy.deepcopy(self.source)
        source['tracks']['a'] = source['tracks']['a'][1:]
        with self.assertRaisesRegex(ValueError, 'official start: Early'):
            validate_track_boundaries(source)

    def test_missing_finish_must_fail_instead_of_stopping_early(self):
        source = copy.deepcopy(self.source)
        source['tracks']['a'] = source['tracks']['a'][:-1]
        with self.assertRaisesRegex(ValueError, 'official finish: Early'):
            validate_track_boundaries(source)


if __name__ == '__main__':
    unittest.main()
