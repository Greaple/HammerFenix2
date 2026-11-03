"""Inspect Adobe XFL exports and recover their embedded PCM audio / JPEG files.

Usage: python3 scripts/audit-xfl.py XFL_DIR... --report REPORT.json [--extract-to DIR]
Python standard library only. ActionScript and publish settings are never executed.
The report omits original workstation paths and document authoring metadata.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import re
import wave
import xml.etree.ElementTree as ET

NS = {'x': 'http://ns.adobe.com/xfl/2008/'}
RATES = {'11': 11025, '22': 22050, '44': 44100}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def internal_file(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError(f'Reference leaves the XFL directory: {relative}')
    return path


def safe_name(value):
    return re.sub(r'[^a-zA-Z0-9_-]+', '-', value).strip('-') or 'asset'


def timeline_info(element):
    timelines = []
    for timeline in element.findall('.//x:DOMTimeline', NS):
        frames = timeline.findall('.//x:DOMFrame', NS)
        timelines.append({
            'name': timeline.get('name'),
            'frames': max((int(f.get('index', 0)) + int(f.get('duration', 1)) for f in frames), default=0),
            'keyframes': len(frames),
            'layers': len(timeline.findall('x:layers/x:DOMLayer', NS)),
            'tweens': dict(Counter(f.get('tweenType') for f in frames if f.get('tweenType'))),
            'labels': [{'frame': int(f.get('index', 0)), 'name': f.get('name')} for f in frames if f.get('name')],
        })
    return timelines


def recover_media(root, node, index, output):
    kind = node.tag.rsplit('}', 1)[-1]
    reference = node.get('soundDataHRef') or node.get('bitmapDataHRef')
    record = {'name': node.get('name'), 'kind': kind, 'linkage': node.get('linkageIdentifier'),
              'embedded_file': f'bin/{reference}' if reference else None}
    if not reference:
        record['status'] = 'no embedded reference'
        return record
    path = internal_file(root, f'bin/{reference}')
    if not path.is_file():
        record['status'] = 'missing embedded file'
        return record
    data = path.read_bytes()
    record.update(status='present', bytes=len(data), sha256=digest(data))
    if kind == 'DOMSoundItem':
        record['source_format'] = node.get('format')
        match = re.fullmatch(r'(11|22|44)kHz (8|16)bit (Mono|Stereo)', node.get('format', ''))
        if not match:
            record['recovery'] = 'unsupported sound format'
            return record
        rate, bits, layout = match.groups()
        channels = 2 if layout == 'Stereo' else 1
        width, samples = int(bits) // 8, int(node.get('sampleCount', '0'))
        if len(data) != samples * channels * width or len(data) != int(node.get('dataLength', '0')):
            raise ValueError(f'PCM length does not match metadata: {node.get("name")}')
        record.update(encoding='PCM', sample_rate=RATES[rate], channels=channels,
                      bits=int(bits), samples=samples, duration_seconds=samples/RATES[rate])
        if output:
            filename = f'sounds/{index:03}-{safe_name(node.get("linkageIdentifier") or node.get("name"))}.wav'
            target = output / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            with wave.open(str(target), 'wb') as audio:
                audio.setparams((channels, width, RATES[rate], samples, 'NONE', 'not compressed'))
                audio.writeframes(data)
            # Verify the recovered sample bytes, not just the WAV header.
            with wave.open(str(target), 'rb') as audio:
                if audio.readframes(samples) != data:
                    raise ValueError(f'WAV round-trip failed: {filename}')
            record['recovered_file'] = filename
    elif kind == 'DOMBitmapItem':
        record.update(width=int(node.get('frameRight', 0))/20, height=int(node.get('frameBottom', 0))/20)
        record['encoding'] = 'JPEG' if data.startswith(b'\xff\xd8') else 'Animate bitmap data'
        if record['encoding'] == 'JPEG' and output:
            filename = f'bitmaps/{index:03}-{safe_name(Path(node.get("name")).stem)}.jpg'
            target = output / filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            record['recovered_file'] = filename
    return record


def audit(root, extract_to=None):
    root = root.resolve()
    document_bytes = (root / 'DOMDocument.xml').read_bytes()
    document = ET.fromstring(document_bytes)
    if document.tag != f'{{{NS["x"]}}}DOMDocument':
        raise ValueError(f'Not an XFL DOMDocument: {root.name}')
    documents = [('DOMDocument.xml', document)]
    symbols, missing = [], []
    for entry in document.findall('x:symbols/x:Include', NS):
        relative = f'LIBRARY/{entry.get("href")}'
        path = internal_file(root, relative)
        if not path.is_file():
            missing.append(relative)
            continue
        data = path.read_bytes()
        symbol = ET.fromstring(data)
        documents.append((relative, symbol))
        record = {'name': symbol.get('name'), 'file': relative, 'sha256': digest(data),
                  'linkage': symbol.get('linkageIdentifier'), 'timelines': timeline_info(symbol)}
        if symbol.get('sourceFlashFilepath'):
            # This is provenance, not a dependency to follow on the local machine.
            record['source_document'] = symbol.get('sourceFlashFilepath').replace('\\', '/').rsplit('/', 1)[-1]
        symbols.append(record)
    output = extract_to / safe_name(root.name) if extract_to else None
    media = [recover_media(root, node, i, output) for i, node in enumerate(document.findall('x:media/*', NS))]
    names = {s['name'] for s in symbols} | {m['name'] for m in media}
    names |= {n.get('name') for n in document.findall('.//x:DOMFontItem', NS)}
    unresolved, counts = {}, Counter()
    for file, element in documents:
        for node in element.iter():
            counts[node.tag.rsplit('}', 1)[-1]] += 1
            for attr in ['libraryItemName', 'bitmapPath', 'soundName']:
                ref = node.get(attr)
                if ref and ref not in names:
                    unresolved.setdefault(ref, set()).add(file)
    return {
        'document': root.name, 'document_sha256': digest(document_bytes),
        'xfl_version': document.get('xflVersion'), 'stage': {
            'width': document.get('width'), 'height': document.get('height'),
            'frame_rate': document.get('frameRate')},
        'counts': {'symbols': len(symbols), 'bitmaps': counts['DOMBitmapItem'],
                   'sounds': counts['DOMSoundItem'], 'shapes': counts['DOMShape'],
                   'keyframes': counts['DOMFrame'], 'matrices': counts['Matrix'],
                   'actionscript_blocks': counts['Actionscript'], 'fonts': counts['DOMFontItem']},
        'missing_symbol_files': missing,
        'missing_embedded_media': [m['name'] for m in media if m['status'] != 'present'],
        'unresolved_library_references': {k: sorted(v) for k, v in sorted(unresolved.items())},
        'root_timelines': timeline_info(document), 'symbols': symbols, 'media': media,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directories', nargs='+', type=Path)
    parser.add_argument('--report', required=True, type=Path)
    parser.add_argument('--extract-to', type=Path)
    args = parser.parse_args()
    names = [safe_name(root.name) for root in args.directories]
    if len(set(names)) != len(names):
        parser.error('XFL directories must have distinct names')
    reports = [audit(root, args.extract_to) for root in args.directories]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps({'version': 1, 'documents': reports}, indent=2, ensure_ascii=False)+'\n')
    for report in reports:
        print(f'{report["document"]}: {report["counts"]}')


if __name__ == '__main__':
    main()
