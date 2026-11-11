"""Cut the demo video from the capture, the cards and the narration.

Inputs:  video/capture/ (from scripts/capture.py), video/cards/*.png, video/voice/NN.(m4a|wav|mp3|aiff)
Output:  video/leash-demo.mp4
Your own recordings win: drop 01.m4a ... 12.m4a into video/voice/ and run again.

Run: python3 scripts/build_video.py [video_offset_seconds]
video_offset = seconds between the capture script starting and the page video starting (from the capture log).
"""
import os, subprocess, sys, shutil
from pathlib import Path

V = Path('video'); CAP = Path(os.environ.get('CAP', 'video/capture')); TMP = V / 'tmp'
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
W, H, FPS = 1920, 1200, 30
PAPER = 'F7F7F4'
OFFSET = float(sys.argv[1]) if len(sys.argv) > 1 else 1.5
OUTFILE = Path(os.environ.get('OUTFILE', 'video/leash-demo.mp4'))
PAD = 0.6  # silence after each line

def run(*a):
    subprocess.run(a, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)]))

marks = {}
for line in (CAP / 'marks.tsv').read_text().split('\n'):
    if line.strip():
        t, n = line.split('\t'); marks[n] = float(t) - OFFSET  # seconds into the page video
webms = sorted(CAP.glob('*.webm'), key=lambda f: -f.stat().st_size)
PAGE_VIDEO = webms[0]  # the main page; the PayPal popup is the smaller one

def voice(n):
    for ext in ('m4a', 'wav', 'mp3', 'aiff'):
        f = V / 'voice' / f'{n}.{ext}'
        if f.exists(): return f
    raise FileNotFoundError(n)

# Each segment: narration line + visual parts. A part's seconds=None takes what's left.
# img: (path, seconds, focus x, focus y, end zoom, fit) - fit pads an element shot onto a full frame.
# vid: (from mark, offset, length in source, seconds on screen)
SEGMENTS = [
    ('01', None, [('img', 'cards/title.png', 3.5, .5, .5, 1.03, False), ('img', 'cards/problem.png', None, .3, .4, 1.06, False)]),
    ('02', 'Leash · live on Render', [('img', 'capture/01-landing.png', None, .5, 0, 1.10, False)]),
    ('03', 'Your words become a signed mandate', [('vid', '03-request', -3.4, 5.0, 5.0), ('img', 'capture/03-mandate-page.png', None, 1, .1, 1.45, False)]),
    ('04', 'Real products from Channel3 · one seller agent per store', [('img', 'capture/neg-04.png', None, .2, .9, 1.2, False)]),
    ('05', 'Scam seller removed before your agent reads it', [('img', 'capture/05-removed.png', None, .5, .5, 1.06, True)]),
    ('06', 'Prices are set in code, never by the AI', [('vid', '03-mandate', 3.2, None, None)]),
    ('07', 'Checked against your mandate before any money moves', [('img', 'capture/07-verdict-page.png', None, 1, .3, 1.35, False)]),
    ('08', 'Paid with PayPal (sandbox) · mandate hash on the order', [('img', 'payshots/t6.png', 2.8, 1, .75, 1.75, False, 1.35), ('img', 'payshots/t40.3.png', 2.4, .5, .45, 1.7, False, 1.5), ('img', 'payshots/t50.png', None, 1, .45, 1.9, False, 1.6)]),
    ('09', 'PayPal Agent Toolkit, on a leash', [('img', 'payshots/t60.png', 2.6, 1, .45, 1.9, False, 1.6), ('pan', 'payshots/t100.png', 13.0, 40, 2080, 0, 437), ('img', 'payshots/t88.png', None, 1, .12, 2.2, False, 1.9)]),
    ('10', None, [('img', 'cards/how.png', None, .5, .5, 1.04, False)]),
    ('11', None, [('img', 'cards/who.png', None, .5, .5, 1.04, False)]),
    ('12', None, [('img', 'cards/close.png', None, .5, .5, 1.03, False)]),
]

def img_part(out, src, secs, fx, fy, zmax, fit, zmin=1.0):
    n = max(1, round(secs * FPS))
    pre = f'scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2}'
    if fit:
        pre = f'scale={int(W*2*.86)}:{int(H*2*.86)}:force_original_aspect_ratio=decrease,pad={W*2}:{H*2}:(ow-iw)/2:(oh-ih)/2:color={PAPER}'
    zp = f"zoompan=z='{zmin}+({zmax}-{zmin})*on/{n}':x='(iw-iw/zoom)*{fx}':y='(ih-ih/zoom)*{fy}':d={n}:s={W}x{H}:fps={FPS}"
    path = CAP / src.split('/', 1)[1] if src.startswith('capture/') else V / src
    run('ffmpeg', '-y', '-loop', '1', '-i', str(path), '-vf', f'{pre},{zp}', '-frames:v', str(n), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', str(out))

# ponytail: colorkey drops Chrome's grey below short pages in old captures.
def vid_part(out, mark, off, src_len, secs):
    start = max(0, marks[mark] + off)
    speed = secs / src_len
    run('ffmpeg', '-y', '-ss', f'{start:.2f}', '-t', f'{src_len:.2f}', '-i', str(PAGE_VIDEO),
        '-filter_complex', f'color=c=0xFAFBF9:s=1440x900:r={FPS}[bg];[0:v]colorkey=0x7E7E7E:0.02:0[k];[bg][k]overlay=shortest=1,setpts={speed:.4f}*PTS,scale={W}:{H}:flags=lanczos,fps={FPS}', '-an', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', '-t', f'{secs:.2f}', str(out))

def pan_part(out, src, secs, x, w, y0, y1):
    h = int(w / 1.6)
    expr = f"{y0}+({y1}-{y0})*min(t/{secs},1)"
    run('ffmpeg', '-y', '-loop', '1', '-framerate', str(FPS), '-i', str(V / src), '-vf', f"crop={w}:{h}:{x}:'{expr}',scale={W}:{H}:flags=lanczos",
        '-frames:v', str(round(secs * FPS)), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', str(out))

def caption(text):
    t = text.replace(':', r'\:').replace("'", r"\'")
    return (f"drawtext=fontfile='{FONT}':text='{t}':fontsize=40:fontcolor=white:box=1:boxcolor=0x0B0B0B@0.82:boxborderw=18:"
            f"x=(w-text_w)/2:y=h-110:enable='gte(t,0.4)'")

if TMP.exists(): shutil.rmtree(TMP)
TMP.mkdir(parents=True)
seg_files = []
for n, cap, parts in SEGMENTS:
    a = voice(n); total = dur(a) + PAD
    own = lambda p: p[4] if p[0] == 'vid' else p[2]
    fixed = sum(own(p) for p in parts if own(p) is not None)
    files = []
    for i, p in enumerate(parts):
        out = TMP / f'{n}-{i}.mp4'
        if p[0] in ('img', 'pan'):
            secs = p[2] if p[2] is not None else total - fixed
            (img_part if p[0] == 'img' else pan_part)(out, p[1], secs, *p[3:])
        else:
            mark, off, src_len, secs = p[1:]
            if src_len is None:  # the whole negotiation: from the mandate to the verdict
                src_len = marks['04-feed'] - 1.6 - (marks[mark] + off)
            secs = secs if secs is not None else total - fixed
            vid_part(out, mark, off, src_len, secs)
        files.append(out)
    lst = TMP / f'{n}.txt'; lst.write_text(''.join(f"file '{f.name}'\n" for f in files))
    seg = TMP / f'seg-{n}.mp4'
    vf = caption(cap) if cap else 'null'
    run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-i', str(a),
        '-filter_complex', f'[0:v]{vf}[v];[1:a]aresample=48000,apad[a]', '-map', '[v]', '-map', '[a]',
        '-t', f'{total:.2f}', '-r', str(FPS), '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-ac', '2', str(seg))
    seg_files.append(seg)
    print(f'{n}: {total:5.1f}s')

lst = TMP / 'all.txt'; lst.write_text(''.join(f"file '{f.name}'\n" for f in seg_files))
joined = TMP / 'joined.mp4'
run('ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-c', 'copy', str(joined))
d = dur(joined)
run('ffmpeg', '-y', '-i', str(joined), '-vf', f'fade=t=in:st=0:d=0.5,fade=t=out:st={d-0.8:.2f}:d=0.8',
    '-af', f'afade=t=out:st={d-0.8:.2f}:d=0.8', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', str(OUTFILE))
print(f'{OUTFILE}  {dur(OUTFILE):.1f}s')
