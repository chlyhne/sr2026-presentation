"""Official start signals and finish registrations, independent of GPS crossings."""
from datetime import datetime, timezone
from bisect import bisect_right
import math


def official_start(race, competitor):
    division = next(d for d in race['handicap']['divisions'] if d['uuid'] == competitor['classId'])
    return datetime.strptime(division['raceStartTime'], '%Y-%m-%d %H:%M:%S UTC').replace(tzinfo=timezone.utc).timestamp()


def official_finish(competitor):
    if competitor['status'] != 10:
        return None
    return datetime.fromisoformat(competitor['statusTime'].replace('Z', '+00:00')).timestamp()


def viewer_time_window(source, padding=300):
    """Keep every observation and leave room before starts and after last records."""
    starts, finishes, first, last = [], [], [], []
    for key, points in source['tracks'].items():
        if not points:
            raise ValueError(f'Empty source track: {key}')
        competitor = source['competitors'][key]
        starts.append(official_start(source['races'][competitor['source_course']], competitor))
        finish = official_finish(competitor)
        if finish is not None:
            finishes.append(finish)
        first.append(points[0][2] / 1000)
        last.append(points[-1][2] / 1000)
    if not starts:
        raise ValueError('No official starts or tracks')
    return (math.floor(min(min(first), min(starts) - padding)),
            math.ceil(max([*last, *finishes]) + padding))


def validate_track_boundaries(source):
    """Require observations around start signals and each registered finish."""
    rows = []
    for key, points in source['tracks'].items():
        competitor = source['competitors'][key]
        start = official_start(source['races'][competitor['source_course']], competitor)
        finish = official_finish(competitor)
        stamps = [point[2] / 1000 for point in points]
        if not stamps or any(b < a for a, b in zip(stamps, stamps[1:])):
            raise ValueError(f'Empty or unordered track: {key}')
        row = {'id': key, 'name': competitor['nameShort'], 'points': len(points),
               'start': start, 'finish': finish, 'first': stamps[0], 'last': stamps[-1]}
        for label, time in [('start', start), ('finish', finish)]:
            if time is None:
                continue
            index = bisect_right(stamps, time) - 1
            if not (0 <= index < len(stamps) and (stamps[index] == time or
                    index + 1 < len(stamps) and stamps[index + 1] - stamps[index] <= 300)):
                raise ValueError(f'Tracking does not cover official {label}: {competitor["nameShort"]}')
            row[label + '_bracket'] = [stamps[index], stamps[index] if stamps[index] == time else stamps[index + 1]]
        rows.append(row)
    return rows
