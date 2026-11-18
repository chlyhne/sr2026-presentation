"""Import the configured TracTrac races into one native event snapshot.

Race metadata is fetched directly as JSON. The existing cached TracTrac decoder
reads the complete stored files without replaying the race or interpolating GPS.
Manual event.json metadata/route edits and background layers are preserved,
except source-defined start/finish lines, which are refreshed from TracTrac.
"""
import argparse
from datetime import datetime, timezone
import gzip
import json
import re
from collections import Counter
from pathlib import Path
import subprocess
import requests

ROOT=Path(__file__).resolve().parents[1]
def read(file):return json.loads(file.read_text(encoding='utf-8'))
def epoch(value):return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()

def boat_identity(competitor):
    match=re.fullmatch(r'(\d+)\s*-\s*(.+)',competitor['nameShort'])
    return (match[2],match[1]) if match else (competitor['nameShort'],None)

def source_lines(race,payload):
    features=[];start_ms=epoch(race['raceStartTime'])*1000
    for item in race['mapItems']:
        if item.get('void') or not item.get('hasTwoPoints'):continue
        coordinates=[];endpoints=[]
        for point in item['positionedItems']:
            source_time=None
            if point['isStatic']:
                position=point['positions'][0];coordinate=[position['x'],position['y']]
            else:
                positions=[p for uid,p,*_ in payload['controls'] if uid==point['uuid'] and p['timestamp']<=start_ms]
                if not positions:raise ValueError('Missing pre-start line endpoint: '+point['name'])
                position=max(positions,key=lambda p:p['timestamp'])
                coordinate=[position['longitude'],position['latitude']]
                source_time=datetime.fromtimestamp(position['timestamp']/1000,timezone.utc).isoformat()
            coordinates.append(coordinate)
            endpoints.append({'id':point['uuid'],'name':point['name'],'coordinates':coordinate,
                              'is_static':point['isStatic'],'source_position_utc':source_time})
        if len(coordinates)!=2:raise ValueError('Course line must have two endpoints')
        kind={'Start-Finish':'start-finish','Start':'start','Finish':'finish'}[item['name']]
        features.append({'type':'Feature','id':item['uuid'],
                         'properties':{'kind':kind,'name':{'start-finish':'Start / m\u00e5l','start':'Start','finish':'M\u00e5l'}[kind],
                                       'source_name':item['name'],'endpoints':endpoints,'reference_utc':race['raceStartTime'],
                                       'position_selection':'latest source position at or before first race start; fixed snapshot'},
                         'geometry':{'type':'LineString','coordinates':coordinates}})
    unique={}
    for feature in features:
        uid=feature['id']
        if uid in unique and unique[uid]!=feature:raise ValueError('Conflicting source course line: '+uid)
        unique[uid]=feature
    return list(unique.values())
def import_event(event_id,refresh=False):
    catalog=read(ROOT/'viewer/events/catalog.json')
    if event_id not in {event['id'] for event in catalog['events']}:raise ValueError('Unknown event')
    config=read(ROOT/'viewer/events'/event_id/'event.json')
    races=config['source']['races']
    folder=ROOT/'data/events'/event_id/'tractrac';folder.mkdir(parents=True,exist_ok=True)
    for race in races:
        target=folder/('race_'+race['id']+'.json')
        if refresh or not target.exists():
            response=requests.get(race['source'],headers={'Referer':'https://live.tractrac.com/','Origin':'https://live.tractrac.com'},timeout=60)
            response.raise_for_status();target.write_text(json.dumps(response.json(),ensure_ascii=False,indent=2),encoding='utf-8')
    if refresh or any(not (folder/('speeds_'+r['id']+'.json')).exists() for r in races):
        subprocess.run(['node',str(ROOT/'scripts/collect_track_speeds.mjs'),'--data-dir',str(folder)],check=True,cwd=ROOT)
    boats=[];seen=set()
    first=min(races,key=lambda entry:epoch(read(folder/('race_'+entry['id']+'.json'))['raceStartTime']))
    lines=source_lines(read(folder/('race_'+first['id']+'.json')),read(folder/('speeds_'+first['id']+'.json')))
    course_ids=list(config['courses'])
    for entry in races:
        race=read(folder/('race_'+entry['id']+'.json'));payload=read(folder/('speeds_'+entry['id']+'.json'))
        course=entry.get('course',course_ids[0])
        if course not in config['courses']:raise ValueError('Race references an unknown course')
        start=epoch(race['raceStartTime'])
        for uid,rows in payload['tracks'].items():
            competitor=race['competitors'][uid];unique={}
            for row in rows:
                if row[2] in unique and unique[row[2]][:4]!=row[:4]:raise ValueError('Conflicting timestamp: '+uid)
                unique[row[2]]=row
            points=[row[:4] for _,row in sorted(unique.items())]
            if not points:continue
            key=entry['id']+':'+uid
            if key in seen:raise ValueError('Duplicate source identity: '+key)
            seen.add(key)
            name,start_number=boat_identity(competitor)
            boats.append({'id':key,'name':name,'course':course,'sourceRaceId':entry['id'],
                          'details':{'skipper':competitor.get('name',''),'boatType':re.sub(r'\s*\([^()]*\)\s*$','',competitor.get('description','')).strip(),
                                     'boatName':name,'startNumber':start_number,
                                     'raceClassId':entry['id'],'raceClassName':entry['name'],'raceStartTime':start,
                                     'raceFinishTime':epoch(competitor['statusTime']) if competitor.get('status')==10 else None,
                                     'handicapSecondsPerNm':0,'courseLengthNm':None},'points':points})
    counts=Counter(boat['name'] for boat in boats)
    for boat in boats:
        if counts[boat['name']]>1:boat['name']+=f" ({boat['details']['startNumber']})"
    if len({boat['name'] for boat in boats})!=len(boats):raise ValueError('Boat display names must be unique')
    background_file=ROOT/config['backgroundFile']
    background=json.loads(gzip.decompress(background_file.read_bytes()))
    background['course_lines']={'type':'FeatureCollection','features':lines}
    background_file.write_bytes(gzip.compress(json.dumps(background,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    output=ROOT/config['nativeFile']
    output.write_bytes(gzip.compress(json.dumps({'version':1,'boats':boats},ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
    print(f'{event_id}: {len(races)} races, {len(boats)} boats, {sum(len(b["points"]) for b in boats)} native observations')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--event',required=True);parser.add_argument('--refresh',action='store_true')
    args=parser.parse_args();import_event(args.event,args.refresh)
