#!/usr/bin/env python3
"""Rapport de mesure d'un ou plusieurs GLB Minemories (issue #173, phase 0).

Usage : python3 scripts/glb-report.py [--json] fichier.glb [...]

Octets par catégorie (positions, normales, UV, indices, PNG, JSON), quads, sommets
dupliqués (exacts et par position seule), tailles gzip/brotli et VRAM estimée des
textures (RGBA 8 bits, sans mipmaps). Bibliothèque standard uniquement ; `brotli`
du système est optionnel. Ne modifie aucun fichier.
"""
import gzip
import json
import shutil
import struct
import subprocess
import sys
from pathlib import Path

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
TYPES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def read_glb(data):
    magic, version, _ = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2, 'not a GLB 2.0'
    length, kind = struct.unpack_from('<II', data, 12)
    assert kind == 0x4E4F534A
    doc = json.loads(data[20:20 + length])
    offset = 20 + length
    binary = b''
    if offset < len(data):
        bin_length, _ = struct.unpack_from('<II', data, offset)
        binary = data[offset + 8:offset + 8 + bin_length]
    return doc, length, binary


def accessor_values(doc, binary, index):
    accessor = doc['accessors'][index]
    view = doc['bufferViews'][accessor['bufferView']]
    code, size = COMPONENT[accessor['componentType']]
    width = TYPES[accessor['type']]
    stride = view.get('byteStride', size * width)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    rows = []
    for i in range(accessor['count']):
        rows.append(struct.unpack_from('<' + code * width, binary, start + i * stride))
    return rows


def png_size(blob):
    return struct.unpack('>II', blob[16:24])


def compressed(data):
    result = {'gzip': len(gzip.compress(data, 6))}
    if shutil.which('brotli'):
        out = subprocess.run(['brotli', '-q', '9', '-c'], input=data, capture_output=True, check=True)
        result['brotli'] = len(out.stdout)
    return result


def report(path):
    data = Path(path).read_bytes()
    doc, json_length, binary = read_glb(data)
    views = doc['bufferViews']
    cost = {'positions': 0, 'normals': 0, 'uv': 0, 'indices': 0, 'png': 0, 'other': 0}
    seen = set()
    quads = 0
    vertices = 0
    exact_duplicates = 0
    position_duplicates = 0
    categories = {}
    for mesh in doc.get('meshes', []):
        for primitive in mesh['primitives']:
            attrs = primitive['attributes']
            for semantic, label in (('POSITION', 'positions'), ('NORMAL', 'normals'), ('TEXCOORD_0', 'uv')):
                if semantic in attrs:
                    view = doc['accessors'][attrs[semantic]]['bufferView']
                    if view not in seen:
                        seen.add(view)
                        cost[label] += views[view]['byteLength']
            index = doc['accessors'][primitive['indices']]
            cost['indices'] += views[index['bufferView']]['byteLength']
            quads += index['count'] // 6
            positions = accessor_values(doc, binary, attrs['POSITION'])
            normals = accessor_values(doc, binary, attrs['NORMAL']) if 'NORMAL' in attrs else None
            uvs = accessor_values(doc, binary, attrs['TEXCOORD_0']) if 'TEXCOORD_0' in attrs else None
            vertices += len(positions)
            exact = {}
            by_position = {}
            for i, position in enumerate(positions):
                key = (position, normals[i] if normals else None, uvs[i] if uvs else None)
                exact[key] = exact.get(key, 0) + 1
                by_position[position] = by_position.get(position, 0) + 1
            exact_duplicates += len(positions) - len(exact)
            position_duplicates += len(positions) - len(by_position)
    vram = 0
    for image in doc.get('images', []):
        view = views[image['bufferView']]
        blob = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
        cost['png'] += view['byteLength']
        width, height = png_size(blob)
        vram += width * height * 4
    categories['json'] = json_length
    return {
        'file': Path(path).name,
        'bytes': len(data),
        'json_bytes': json_length,
        'bytes_by_category': cost,
        'quads': quads,
        'vertices': vertices,
        'duplicate_vertices_exact': exact_duplicates,
        'duplicate_vertices_by_position': position_duplicates,
        'primitives': sum(len(m['primitives']) for m in doc.get('meshes', [])),
        'meshes': len(doc.get('meshes', [])),
        'nodes': len(doc.get('nodes', [])),
        'materials': len(doc.get('materials', [])),
        'images': len(doc.get('images', [])),
        'texture_vram_bytes_rgba8': vram,
        'extensions_used': doc.get('extensionsUsed', []),
        'compressed': compressed(data),
    }


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--json']
    rows = [report(a) for a in args]
    if '--json' in sys.argv:
        print(json.dumps(rows, indent=2))
    else:
        for r in rows:
            print(r['file'], r['bytes'], 'octets;', r['quads'], 'quads;', r['vertices'], 'sommets')
            print('  octets :', r['bytes_by_category'], 'json', r['json_bytes'])
            print('  doublons exacts', r['duplicate_vertices_exact'], '; par position', r['duplicate_vertices_by_position'])
            print('  compressé', r['compressed'], '; VRAM RGBA8', r['texture_vram_bytes_rgba8'])
