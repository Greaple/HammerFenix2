"""Export original SWF timelines, resolve default player variants, and pack a PNG atlas.

Usage: python3 scripts/extract-assets.py SOURCE JAVA FFDEC_JAR
Requires JPEXS 26.4.0 and Java 21. Python standard library only.
"""
from pathlib import Path
import hashlib, json, re, shutil, struct, subprocess, sys, zlib

source, java, ffdec = sys.argv[1:]
cache = Path('.cache/asset-export'); cache.mkdir(parents=True, exist_ok=True)
out = Path('public/assets'); out.mkdir(parents=True, exist_ok=True)

def tags(data, offset=0):
    while offset + 2 <= len(data):
        h = struct.unpack_from('<H', data, offset)[0]; offset += 2
        code, size = h >> 6, h & 63
        if size == 63:
            size = struct.unpack_from('<I', data, offset)[0]; offset += 4
        yield code, data[offset:offset+size]
        offset += size

def tag(code, data):
    return struct.pack('<HI', code << 6 | 63, len(data)) + data

swf = (Path(source)/'swf/_anims.swf').read_bytes()
swf = swf[:8] + zlib.decompress(swf[8:]) if swf[:3] == b'CWS' else swf
start = 8 + (5 + 4 * (swf[8] >> 3) + 7) // 8 + 4
records = list(tags(swf, start))
sprites = {struct.unpack_from('<H', d)[0]: d for c,d in records if c == 39}
# Player parts call gotoAndStop(parent.skin/head/currentWeapon) in Flash.
# Bake Igor, normal head and classic bomb; omit conditional carrot/chourou effects.
static = {381,429,436,442,445,451,458,477,496,577,608,613,618,749}
hidden = {479,483}
patched = []
for code, data in records:
    if code == 39:
        sid = struct.unpack_from('<H', data)[0]
        if sid in hidden:
            data = struct.pack('<HH', sid, 1) + tag(1,b'') + tag(0,b'')
        elif sid in static:
            first = []
            for c,d in tags(data,4):
                if c != 12: first.append(tag(c,d))
                if c == 1: break
            data = struct.pack('<HH', sid, 1) + b''.join(first) + tag(0,b'')
    patched.append(tag(code,data))
body = swf[8:start] + b''.join(patched)
prepared = cache/'default-igor.swf'
prepared.write_bytes(b'FWS'+swf[3:4]+struct.pack('<I',len(body)+8)+body)

groups = {}
for prefix, sid, names in [
    ('igor',805,['idle','walk','up','down','land','die','kick','drop']),
    ('bomb',1362,['drop','idle','explode']),
    ('cherry',3417,['walk','angry','frozen','knock','die']),
    ('orange',2704,['walk','angry','frozen','knock','die']),
    ('apple',3323,['walk','angry','frozen','knock','die','shoot','recover']),
]:
    frame = 0
    for c,d in tags(sprites[sid],4):
        if c == 1: frame += 1
        if c == 26 and d[0] & 2 and frame < len(names):
            groups[prefix+'-'+names[frame]] = struct.unpack_from('<H',d,3)[0]

def export(extra, kind, directory, path):
    subprocess.run([java,'-Djava.awt.headless=true',f'-Duser.home={cache.resolve()}',
        '-jar',ffdec,*extra,'-export',kind,str(directory),str(path)], check=True,
        stdout=subprocess.DEVNULL)

selection = ','.join(map(str,sorted(set(groups.values()))))
export(['-selectid',selection,'-ignorebackground','-format','sprite:png'], 'sprite', cache/'png',prepared)
export(['-selectid',selection,'-ignorebackground','-format','sprite:svg'], 'sprite', cache/'svg',prepared)
export(['-selectid','3147','-format','sprite:png','-ignorebackground'], 'sprite', cache/'items',prepared)
export([], 'sound',cache/'sounds',Path(source)/'swf/_sounds.swf')

def read_png(path):
    b=path.read_bytes(); p=8; packed=b''
    while p<len(b):
        size=struct.unpack_from('>I',b,p)[0]; kind=b[p+4:p+8]; data=b[p+8:p+8+size];p+=size+12
        if kind==b'IHDR': w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',data)
        if kind==b'IDAT': packed+=data
    assert depth==8 and color in (2,6) and interlace==0, (path,depth,color)
    channels=4 if color==6 else 3; stride=w*channels
    raw=zlib.decompress(packed); prev=bytearray(stride); rows=[]
    for y in range(h):
        offset=y*(stride+1); filt=raw[offset]; row=bytearray(raw[offset+1:offset+stride+1])
        for x in range(stride):
            a=row[x-channels] if x>=channels else 0; up=prev[x]; c=prev[x-channels] if x>=channels else 0
            if filt==1: val=a
            elif filt==2: val=up
            elif filt==3: val=(a+up)//2
            elif filt==4:
                k=a+up-c; ds=[abs(k-a),abs(k-up),abs(k-c)]; val=[a,up,c][ds.index(min(ds))]
            else: val=0
            row[x]=(row[x]+val)&255
        rows.append(row if channels==4 else bytearray(v for x in range(w) for v in (*row[x*3:x*3+3],255)))
        prev=row
    return w,h,rows

entries=[]; animations={}
for name,sid in groups.items():
    directory=next((cache/'png').glob(f'DefineSprite_{sid}*'))
    svg=next((cache/'svg').glob(f'DefineSprite_{sid}*'))/'1.svg'
    s=svg.read_text(); origin=re.search(r'<g transform="matrix\(1.0, 0.0, 0.0, 1.0, ([\d.-]+), ([\d.-]+)\)',s)
    ox,oy=map(float,origin.groups())
    animations[name]=[]
    for file in sorted(directory.glob('*.png'),key=lambda p:int(p.stem)):
        w,h,rows=read_png(file)
        animations[name].append(len(entries))
        entries.append((w,h,rows,ox,oy))
items=next((cache/'items').glob('DefineSprite_3147*'))
for item in [1,2,3,4,5,6,7,8,9,10,11,12,51,52,53,54]:
    w,h,rows=read_png(items/f'{item}.png')
    animations[f'item-{item}']=[len(entries)]
    entries.append((w,h,rows,w/2,h/2))

width=1024; x=y=2; row_height=0; rects=[]
for w,h,rows,ox,oy in entries:
    if x+w+2>width: x=2;y+=row_height+2;row_height=0
    rects.append({'x':x,'y':y,'w':w,'h':h,'ox':ox,'oy':oy})
    x+=w+2;row_height=max(row_height,h)
height=y+row_height+2; pixels=[bytearray(width*4) for _ in range(height)]
for (w,h,rows,_,_),rect in zip(entries,rects):
    for dy,row in enumerate(rows):pixels[rect['y']+dy][rect['x']*4:(rect['x']+w)*4]=row
def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\x00'+r for r in pixels),9))+chunk(b'IEND',b'')
(out/'atlas.png').write_bytes(png)
(out/'atlas.json').write_text(json.dumps({'frames':rects,'animations':animations},separators=(',',':')))
shutil.copytree(Path(source)/'images',out/'original',dirs_exist_ok=True)
(out/'audio').mkdir(exist_ok=True)
for file in (cache/'sounds').glob('*.mp3'):
    shutil.copy2(file,out/'audio'/file.name.split('_',1)[1])
shutil.copy2(Path(source)/'sfx/music.mp3',out/'audio/music.mp3')
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
provenance = {
    'source': 'https://github.com/motion-twin/hammerfest',
    'commit': 'fa8624307c8168fdec0c18d644509af933e4af7b',
    'license': 'CC-BY-NC-SA-4.0',
    'tools': {'JPEXS': '26.4.0', 'Java': '21'},
    'inputs': {str(p): digest(Path(source)/p) for p in ['swf/_anims.swf','swf/_sounds.swf','xml/levels/adventure.xml','xml/levels/tutorial.xml']},
    'generated': {p: digest(out/p) for p in ['atlas.png','atlas.json']},
    'changes': ['Default Igor variants baked for static export', 'SWF frames rasterized and packed', 'Level serialization decoded to JSON', 'New TypeScript simulation and interface'],
}
(out/'provenance.json').write_text(json.dumps(provenance,indent=2)+'\n')
print(f'Packed {len(entries)} frames into {width}x{height} atlas; copied original backgrounds, tiles and audio.')
