"""Rebuild the agreed approximate Vestbroen footprints in the shared map asset."""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET = ROOT / 'viewer/bridges.geojson'
METRES = math.pi * 6371000 / 180
X_SCALE = METRES * math.cos(math.radians(55.31))

def fit_deck(ring, pier_features):
    """Bounded rigid point-to-polyline least-squares fit, in local metres."""
    import numpy as np
    from scipy.optimize import least_squares

    polygon = np.asarray(ring[:-1], dtype=float) * [X_SCALE, METRES]
    n = len(polygon)//2
    centreline = (polygon[:n] + polygon[n:][::-1])/2
    pivot = centreline.mean(axis=0)
    line = centreline-pivot
    targets = np.asarray([f['geometry']['coordinates'][0][:4] for f in pier_features])
    targets = (targets * [X_SCALE, METRES]).mean(axis=1)-pivot
    starts, vectors = line[:-1], np.diff(line,axis=0)
    lengths_squared = (vectors*vectors).sum(axis=1)

    def residual(parameters):
        angle,dx,dy = parameters
        cosine,sine = math.cos(angle),math.sin(angle)
        rotation = np.array([[cosine,-sine],[sine,cosine]])
        # Inverse-transform targets; closest distances are invariant under a
        # rigid transform, while the original centreline stays constant.
        local = (targets-[dx,dy]) @ rotation
        relative = local[:,None,:]-starts[None,:,:]
        fractions = np.clip((relative*vectors).sum(axis=2)/lengths_squared,0,1)
        difference = relative-fractions[:,:,None]*vectors
        closest = np.argmin((difference*difference).sum(axis=2),axis=1)
        return difference[np.arange(len(local)),closest].ravel()

    limit = math.radians(2)
    fits = [least_squares(residual,[0,dx,0],bounds=([-limit,-20,-20],[limit,20,20]),
                          x_scale=[.01,10,10],ftol=1e-12,xtol=1e-12,gtol=1e-10)
            for dx in (-9,0,9)]
    fit = min(fits,key=lambda candidate:candidate.cost)
    if not fit.success:
        raise ValueError('Bridge deck alignment did not converge: '+fit.message)
    angle,dx,dy = fit.x
    rotation = np.array([[math.cos(angle),-math.sin(angle)],[math.sin(angle),math.cos(angle)]])
    transformed = ((polygon-pivot) @ rotation.T + [dx,dy]+pivot)/[X_SCALE,METRES]
    fitted = np.round(transformed,8).tolist()
    fitted.append(fitted[0])
    before = np.linalg.norm(residual([0,0,0]).reshape(-1,2),axis=1)
    after = np.linalg.norm(residual(fit.x).reshape(-1,2),axis=1)
    details = {'method':'bounded-rigid-point-to-centreline-least-squares',
        'rotation_degrees':float(math.degrees(angle)),
        'translation_east_metres':float(dx),'translation_north_metres':float(dy),
        'pivot_lonlat':(pivot/[X_SCALE,METRES]).tolist(),
        'rotation_limit_degrees':2,'translation_axis_limit_metres':20,
        'rms_before_metres':float(np.sqrt((before*before).mean())),
        'rms_after_metres':float(np.sqrt((after*after).mean())),
        'max_after_metres':float(after.max()),'pier_count':len(targets)}
    return fitted,details

def fit_straight_deck_to_pylons(ring, pylons):
    """Closed-form rigid optimum: align centres and balance both end spans."""
    if len(pylons) != 2 or len(ring) != 5:
        raise ValueError('Two-pylon alignment requires two pylons and a straight deck')
    polygon = [(p[0]*X_SCALE,p[1]*METRES) for p in ring[:-1]]
    start = tuple((polygon[0][i]+polygon[3][i])/2 for i in (0,1))
    end = tuple((polygon[1][i]+polygon[2][i])/2 for i in (0,1))
    pivot = tuple((start[i]+end[i])/2 for i in (0,1))
    direction = (end[0]-start[0],end[1]-start[1])
    centres = []
    for pylon in pylons:
        points = [(p[0]*X_SCALE,p[1]*METRES) for p in pylon['geometry']['coordinates'][0]]
        origin = points[0]
        local = [(p[0]-origin[0],p[1]-origin[1]) for p in points]
        crosses = [a[0]*b[1]-b[0]*a[1] for a,b in zip(local,local[1:])]
        denominator = 3*sum(crosses)
        centres.append(tuple(origin[i]+sum((a[i]+b[i])*cross for a,b,cross in zip(local,local[1:],crosses))/denominator for i in (0,1)))
    centres.sort(key=lambda p:p[0]*direction[0]+p[1]*direction[1])
    between = (centres[1][0]-centres[0][0],centres[1][1]-centres[0][1])
    angle = math.atan2(direction[0]*between[1]-direction[1]*between[0],
                       direction[0]*between[0]+direction[1]*between[1])
    target = tuple((centres[0][i]+centres[1][i])/2 for i in (0,1))
    cosine,sine = math.cos(angle),math.sin(angle)
    fitted = []
    for point in polygon:
        x,y = point[0]-pivot[0],point[1]-pivot[1]
        fitted.append([round((cosine*x-sine*y+target[0])/X_SCALE,8),
                       round((sine*x+cosine*y+target[1])/METRES,8)])
    fitted.append(fitted[0])
    extension = (math.hypot(*direction)-math.hypot(*between))/2
    if extension <= 0:
        raise ValueError('Pylons must lie inside the deck ends')
    details = {'method':'rigid-two-pylon-centres-with-balanced-end-spans',
        'rotation_degrees':math.degrees(angle),'translation_east_metres':target[0]-pivot[0],
        'translation_north_metres':target[1]-pivot[1],
        'pivot_lonlat':[pivot[0]/X_SCALE,pivot[1]/METRES],
        'pylon_centres_lonlat':[[p[0]/X_SCALE,p[1]/METRES] for p in centres],
        'end_span_metres':extension,'deck_length_metres':math.hypot(*direction)}
    return fitted,details

def prepare():
    data = json.loads(ASSET.read_text(encoding='utf-8'))
    features = data['features']
    for feature in features:
        if feature['geometry']['type'] == 'LineString':
            group = feature['properties']['bridge']
            if group in ('storebaelt-east', 'storebaelt-west'):
                feature['properties']['deck_width_metres'] = 25 if group == 'storebaelt-east' else 40
    axis = next(f['geometry']['coordinates'] for f in features
                if f['properties']['bridge'] == 'storebaelt-west' and f['geometry']['type'] == 'LineString')
    points = [(lon * X_SCALE, lat * METRES) for lon, lat in axis]
    segments = []
    station = 0
    for a, b in zip(points, points[1:]):
        length = math.dist(a, b)
        segments.append((station, length, a, ((b[0]-a[0])/length, (b[1]-a[1])/length)))
        station += length

    measurements = json.loads((ROOT / 'data/geography/vestbroen-piers.json').read_text(encoding='utf-8'))
    width = measurements['width_metres']
    half_length = measurements['length_metres']/2
    features[:] = [f for f in features if not f['properties'].get('construction','').startswith('vestbroen-')]
    for number, anchor in enumerate(measurements['coordinates'], 2):
        position = (anchor[0]*X_SCALE, anchor[1]*METRES)
        candidates = []
        for start, length, a, tangent in segments:
            distance = max(0,min(length,(position[0]-a[0])*tangent[0]+(position[1]-a[1])*tangent[1]))
            projected = (a[0]+distance*tangent[0],a[1]+distance*tangent[1])
            candidates.append((math.dist(position,projected),start+distance,tangent))
        _,distance,tangent = min(candidates)
        normal = (tangent[1],-tangent[0])  # north/northwest from the measured SE face
        ring = [[round((position[0]+along*tangent[0]+across*normal[0])/X_SCALE,8),
                 round((position[1]+along*tangent[1]+across*normal[1])/METRES,8)]
                for along,across in [(-half_length,0),(half_length,0),(half_length,width),(-half_length,width)]]
        ring.append(ring[0])
        features.append({'type':'Feature','id':f'vestbroen-pier-{number}',
            'properties':{'bridge':'storebaelt-west','source_kind':'support','support':'pier',
                'construction':'vestbroen-measured-v1','approximate':True,'pier_number':number,
                'length_metres':measurements['length_metres'],'width_metres':width,
                'anchor':anchor,'anchor_kind':measurements['anchor'],
                'station_metres':round(distance,3),'source':measurements['source']},
            'geometry':{'type':'Polygon','coordinates':[ring]}})
    data['metadata']['vestbroen_reconstruction'] = {
        'method':'vestbroen-measured-v1','generator':'scripts/prepare_bridge_supports.py',
        'source_file':'data/geography/vestbroen-piers.json','source':measurements['source'],
        'dimensions':'User measurement: support 6 m along bridge, 42 m across bridge; deck 40 m',
        'deck_width_metres':40,'anchor_kind':measurements['anchor'],
        'position_note':'Each supplied point stays at the centre of the south/southeast short face; footprint extends 42 m north/northwest, perpendicular to the nearest OSM bridge segment. Deck is fitted separately using one bounded rigid transform; pier geometry stays fixed.'}
    for group in ('lillebaelt-old','lillebaelt-new'):
        piers = [f['geometry']['coordinates'][0] for f in features
                 if f['properties']['bridge'] == group and f['properties']['source_kind'] == 'support']
        long_sides = [max(math.hypot((b[0]-a[0])*X_SCALE,(b[1]-a[1])*METRES)
                          for a,b in zip(ring,ring[1:])) for ring in piers]
        deck_width = sum(long_sides)/len(long_sides)
        for feature in features:
            if feature['properties']['bridge'] == group and feature['geometry']['type'] == 'LineString':
                feature['properties']['deck_width_metres'] = deck_width
    features[:] = [f for f in features if f['properties'].get('construction') != 'bridge-deck-v1']
    for group in ('storebaelt-east', 'storebaelt-west', 'lillebaelt-old', 'lillebaelt-new'):
        sections = [f for f in features if f['properties']['bridge'] == group and f['geometry']['type'] == 'LineString']
        chain = list(sections[0]['geometry']['coordinates'])
        for section in sections[1:]:
            following = section['geometry']['coordinates']
            if chain[-1] != following[0]:
                raise ValueError('Bridge deck source sections must form one ordered chain')
            chain.extend(following[1:])
        deck_width = sections[0]['properties']['deck_width_metres']
        # Selected source axes follow one carriageway. Centre the deck between
        # the road carriageways (east) / over the combined road and rail (west).
        centre_offset = {'storebaelt-east':-4.8,'storebaelt-west':1.8,'lillebaelt-old':0,'lillebaelt-new':0}[group]
        metric = [(lon*X_SCALE, lat*METRES) for lon,lat in chain]
        normals = []
        for a,b in zip(metric,metric[1:]):
            length = math.dist(a,b)
            normals.append(((b[1]-a[1])/length, -(b[0]-a[0])/length))
        edges = [[],[]]
        for i,point in enumerate(metric):
            before,after = normals[max(0,i-1)],normals[min(i,len(normals)-1)]
            summed = (before[0]+after[0],before[1]+after[1])
            magnitude = math.hypot(*summed)
            normal = (summed[0]/magnitude,summed[1]/magnitude)
            miter = 1/(normal[0]*after[0]+normal[1]*after[1])
            for edge,side in zip(edges,(-1,1)):
                distance = (centre_offset+side*deck_width/2)*miter
                edge.append([round((point[0]+normal[0]*distance)/X_SCALE,8),
                             round((point[1]+normal[1]*distance)/METRES,8)])
        ring = edges[0]+list(reversed(edges[1]))+[edges[0][0]]
        alignment = None
        if group == 'storebaelt-west':
            ring,alignment = fit_deck(ring,[f for f in features if f['properties'].get('construction') == 'vestbroen-measured-v1'])
            print('Vestbroen deck alignment:',json.dumps(alignment))
        if group == 'lillebaelt-new':
            ring,alignment = fit_straight_deck_to_pylons(ring,[f for f in features
                if f['properties']['bridge'] == group and f['properties']['source_kind'] == 'support'])
            print('New Lillebaelt deck alignment:',json.dumps(alignment))
        features.append({'type':'Feature','id':group+'-deck',
            'properties':{'bridge':group,'source_kind':'deck','construction':'bridge-deck-v1',
                'deck_width_metres':deck_width,'centre_offset_metres':centre_offset,
                **({'alignment':alignment} if alignment else {}),
                'source_url':sections[0]['properties']['source_url']},
            'geometry':{'type':'Polygon','coordinates':[ring]}})
    ASSET.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print('Prepared',len(measurements['coordinates']),'Vestbroen footprints at measured southeast face anchors')

if __name__ == '__main__':
    prepare()
