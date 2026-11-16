"""Build a separate map with boat-distance-dependent geometric tolerance.

Distances use a local equirectangular metre projection at 55 N, matching the
map's distance convention. D(p) is the minimum over every boat and the entire
voyage, including nominal PCHIP and the straight-segment phone presentation.
The field is evaluated at original vertices AND along every original edge.
"""
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import subprocess
import tempfile

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon, mapping
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
SCALE = np.array([6371000 * math.pi / 180 * math.cos(math.radians(55)),
                  6371000 * math.pi / 180])
CURVE_ERROR = .1


def segment_distances(points, a, b):
    delta = b - a
    length = np.dot(delta, delta)
    t = np.clip((points - a) @ delta / length, 0, 1) if length else np.zeros(len(points))
    return np.linalg.norm(points - a - t[:, None] * delta, axis=1)


def ring_parts(points, edge_tolerance, locked):
    """Partition by local tolerance, not source spacing or segment length.

    GEOS takes one tolerance per geometry. Adjacent edges whose tolerance
    differs by at most a factor two form one local arc; its minimum applies.
    Three fixed, non-collinear anchors prevent closed islands collapsing.
    """
    far=int(np.argmax(np.linalg.norm(points-points[0],axis=1)))
    third=int(np.argmax(segment_distances(points,points[0],points[far])))
    anchors={0,len(points)-1,far,third,*locked}
    parts=[]
    first=0
    minimum=math.inf
    maximum=0.
    for i,tolerance in enumerate(edge_tolerance):
        if i>first and max(maximum,tolerance)>2*min(minimum,tolerance):
            parts.append((first,i,LineString(points[first:i+1])))
            first=i
            minimum=math.inf
            maximum=0.
        minimum=min(minimum,tolerance)
        maximum=max(maximum,tolerance)
        if i+1 in anchors:
            parts.append((first,i+1,LineString(points[first:i+2])))
            first=i+1
            minimum=math.inf
            maximum=0.
    return parts


def simplify_ring(points, edge_tolerance, locked, parts=None):
    """The sole simplifier is GEOS Douglas-Peucker with local tolerances."""
    if parts is None:parts=ring_parts(points,edge_tolerance,locked)
    tolerances=[float(edge_tolerance[first:last].min()) for first,last,_ in parts]
    simplified=shapely.simplify([geometry for _,_,geometry in parts],tolerances,preserve_topology=False)
    keep=set()
    for (first,last,_),line in zip(parts,simplified):
        indices={tuple(points[i]):i for i in range(first,last+1)}
        keep.update(indices[tuple(point)] for point in line.coords)
    return np.array(sorted(keep))


def nearest(tree, geometries):
    return tree.query_nearest(geometries, all_matches=False, return_distance=True)[1]


def negligible_island(points, tolerance):
    center=(points.min(axis=0)+points.max(axis=0))/2
    return float(np.linalg.norm(points-center,axis=1).max())<=float(tolerance.min())


def renderable_polygons(polygon):
    """Normalize fill geometry without enforcing relationships to other land.

    Make-valid nodes existing simplified edges; it does not restore coastline
    detail or lower the requested tolerance. Overlap between islands is allowed.
    """
    valid=shapely.make_valid(polygon)
    if valid.geom_type=='Polygon':return [valid] if not valid.is_empty else []
    if valid.geom_type in ('MultiPolygon','GeometryCollection'):
        return [part for child in valid.geoms for part in renderable_polygons(child)
                if child.geom_type in ('Polygon','MultiPolygon','GeometryCollection')]
    return []


def build(angle):
    if not 0 < angle < 45:
        raise ValueError('Angle must be between 0 and 45 degrees')
    inputs = ['data/land-denmark-osm.geojson','data/coastline-denmark-osm.geojson',
              'data/tractrac/combined_tracks.json','viewer/tracks.js','data/geography/map-track-exclusions.json',
              'scripts/export_map_tracks.cjs','scripts/prepare_adaptive_map.py']
    hashes = {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in inputs}
    land = json.loads((ROOT/inputs[0]).read_text(encoding='utf-8'))
    coast = json.loads((ROOT/inputs[1]).read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory(prefix='sr2026-map-') as temporary:
        filename = Path(temporary)/'tracks.bin'
        subprocess.run(['node',str(ROOT/'scripts/export_map_tracks.cjs'),str(filename)],check=True,cwd=ROOT)
        segments = np.fromfile(filename,dtype='<f8').reshape(-1,2,2)
    # Deduplication is spatial only: the minimum distance ignores passage time.
    segments = np.unique(segments,axis=0)
    nonzero = np.any(segments[:,0] != segments[:,1],axis=1)
    geometry = np.concatenate([shapely.linestrings(segments[nonzero]),shapely.points(segments[~nonzero,0])])
    if not len(geometry):
        raise ValueError('No sailing tracks remain after applying explicit exclusions')
    tree = STRtree(geometry)
    print(f'Indexed {len(geometry):,} distinct voyage segments/points',flush=True)
    rings=[]
    polygon_rings=[]
    west,south,east,north = land['metadata']['query_bbox']
    for feature in land['features']:
        if feature['geometry']['type'] != 'Polygon':
            raise ValueError('Expected original land polygons')
        indices=[]
        for coordinates in feature['geometry']['coordinates']:
            lonlat=np.asarray(coordinates,dtype=np.float64)
            points=lonlat*SCALE
            vertex=nearest(tree,shapely.points(points))
            edges=np.stack([points[:-1],points[1:]],axis=1)
            edge=nearest(tree,shapely.linestrings(edges))
            # The flattened curve is at most CURVE_ERROR from the true curve.
            # Convert the distance field to a maximum geometric displacement.
            # It does not constrain spacing between retained coastline points.
            safe=np.maximum(0,edge-CURVE_ERROR)
            budget=safe*math.radians(angle)
            boundary=np.isclose(lonlat[:,0],west,atol=1e-10,rtol=0)|np.isclose(lonlat[:,0],east,atol=1e-10,rtol=0)|np.isclose(lonlat[:,1],south,atol=1e-10,rtol=0)|np.isclose(lonlat[:,1],north,atol=1e-10,rtol=0)
            indices.append(len(rings))
            locked=np.flatnonzero(boundary)
            rings.append(dict(lonlat=lonlat,points=points,vertex=vertex,edge=edge,budget=budget,locked=locked,
                              parts=ring_parts(points,budget,locked)))
        polygon_rings.append(indices)
    print(f'Distance field ready for {sum(len(r["points"]) for r in rings):,} original vertices',flush=True)
    dropped={ids[0] for ids in polygon_rings if not len(rings[ids[0]]['locked'])
             and negligible_island(rings[ids[0]]['points'],rings[ids[0]]['budget'])}
    active={i for ids in polygon_rings if ids[0] not in dropped for i in ids}
    selections=[simplify_ring(r['points'],r['budget'],r['locked'],r['parts']) if i in active else np.array([],dtype=int)
                for i,r in enumerate(rings)]
    features=[]
    repairs=0
    for feature,ids in zip(land['features'],polygon_rings):
        if ids[0] in dropped:continue
        polygon=Polygon(rings[ids[0]]['lonlat'][selections[ids[0]]],
                        [rings[i]['lonlat'][selections[i]] for i in ids[1:]])
        repairs+=int(not polygon.is_valid)
        features.extend({'type':'Feature','properties':feature.get('properties',{}),'geometry':mapping(p)}
                        for p in renderable_polygons(polygon))
    print(f'Omitted {len(dropped):,} distant small islands; normalized {repairs} fills; no global topology refinement',flush=True)
    max_ratio=0.
    max_displacement=0.
    for ring,selected in zip(rings,selections):
        for first,last in zip(selected,selected[1:]):
            errors=segment_distances(ring['points'][first:last+1],ring['points'][first],ring['points'][last])
            error=np.maximum(errors[:-1],errors[1:])
            limits=ring['budget'][first:last]
            if np.any(error>limits+1e-8):
                raise ValueError('Simplified coastline exceeded its local geometric tolerance')
            ratios=np.divide(error,limits,out=np.zeros_like(error),where=limits>0)
            max_ratio=max(max_ratio,float(ratios.max(initial=0)))
            max_displacement=max(max_displacement,float(error.max(initial=0)))
    lines=[]
    for coordinates in [ring for feature in features for ring in feature['geometry']['coordinates']]:
        points=list(coordinates)
        current=[]
        for a,b in zip(points,points[1:]):
            is_border=any(abs(a[axis]-value)<1e-10 and abs(b[axis]-value)<1e-10
                          for axis,value in [(0,west),(0,east),(1,south),(1,north)])
            if is_border:
                if len(current)>1:lines.append(current)
                current=[]
            else:
                if not current:current=[a]
                current.append(b)
        if len(current)>1:lines.append(current)
    before=sum(len(r['points']) for r in rings)
    after=sum(len(ring) for feature in features for ring in feature['geometry']['coordinates'])
    metadata={'angular_threshold_degrees':angle,'projection':'equirectangular metres at 55 N',
              'resolution_method':'GEOS Douglas-Peucker on local arcs; geometric tolerance = minimum boat distance * radians(angle)',
              'preserve_global_topology':False,'omitted_small_islands':len(dropped),'normalized_fills':repairs,
              'distance_field':'minimum over included boat intervals, PCHIP and phone segments',
              'track_exclusions':json.loads((ROOT/'data/geography/map-track-exclusions.json').read_text(encoding='utf-8')),
              'curve_distance_uncertainty_metres':CURVE_ERROR,'original_vertices':before,
              'simplified_vertices':after,'sources_sha256':hashes,
              'verified_max_geometric_tolerance_ratio':max_ratio,'verified_max_displacement_metres':max_displacement}
    new_land={'type':'FeatureCollection','metadata':{**land['metadata'],**metadata,'simplified':True},
              'features':features}
    new_coast={'type':'FeatureCollection','metadata':{**coast['metadata'],**metadata,'simplified':True,'points':sum(map(len,lines)),'ways':len(lines)},
               'features':[{'type':'Feature','properties':{},'geometry':{'type':'LineString','coordinates':line}} for line in lines]}
    field={'metadata':metadata,'rings':[{'polygon':i,'ring':j,
          'vertex_distance_metres':np.round(rings[r]['vertex'],3).tolist(),
          'edge_distance_metres':np.round(rings[r]['edge'],3).tolist(),
          'retained_indices':selections[r].tolist(),'omitted':r not in active}
          for i,ids in enumerate(polygon_rings) for j,r in enumerate(ids)]}
    # Original coordinate arrays remain in their original files; field indices
    # refer to those arrays and the source hashes bind them unambiguously.
    if any(hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=value for name,value in hashes.items()):
        raise ValueError('Map sources changed during preparation')
    for name,value in [('land-adaptive.geojson',new_land),('coastline-adaptive.geojson',new_coast)]:
        (ROOT/'data'/name).write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'data/geography/coast-distance-field.json.gz').write_bytes(gzip.compress(json.dumps(field,separators=(',',':')).encode(),mtime=0))
    print(f'GEOS adaptive map ({angle:g} degrees): {before:,} -> {after:,} vertices ({100*(1-after/before):.1f}% removed); originals untouched',flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--angle-degrees',type=float,default=.2)
    build(parser.parse_args().angle_degrees)
