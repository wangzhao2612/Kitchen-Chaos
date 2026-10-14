#!/usr/bin/env python3
"""Original Kitchen Chaos score -> MIDI -> FluidSynth -> seamless Ogg loops.

No game soundtrack is sampled or transcribed. The score below is original.
Requires FluidSynth, numpy, scipy, soundfile, LAME and a supplied GeneralUser GS SoundFont.
"""
import argparse
import json
import math
from pathlib import Path
import random
import struct
import subprocess
import tempfile
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
PPQ = 480
RATE = 44100
VERSION = "acoustic-v2"

def vlq(value):
    value = int(value)
    data = [value & 127]
    while value >> 7:
        value >>= 7
        data.insert(0, (value & 127) | 128)
    return bytes(data)

def midi(path, events, bpm, beats, repeats=3):
    all_events = [(0, b'\xff\x51\x03' + int(60000000 / bpm).to_bytes(3, 'big'))]
    for repeat in range(repeats):
        for beat, message in events:
            all_events.append((round((beat + repeat * beats) * PPQ), message))
    all_events.sort(key=lambda e: e[0])
    track, previous = bytearray(), 0
    for tick, message in all_events:
        track.extend(vlq(tick - previous) + message)
        previous = tick
    end = round(beats * repeats * PPQ)
    track.extend(vlq(max(0, end - previous)) + b'\xff\x2f\x00')
    path.write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, PPQ) + b'MTrk' + struct.pack('>I', len(track)) + track)

def compose(variant, bars, urgent=False):
    rng = random.Random(41021 + variant)
    events = []
    programs = [[24,0,25,12,21,71][variant], 0, 24, 32, 45, 11]
    for ch, program in enumerate(programs):
        events.extend([(0, bytes([0xc0 + ch, program])), (0, bytes([0xb0 + ch, 7, [77, 56, 50, 73, 39, 31][ch]])), (0, bytes([0xb0 + ch, 10, [60, 80, 36, 64, 92, 48][ch]]))])
    events.append((0, bytes([0xc9, 40]))) # acoustic brush kit
    for ch in range(6):
        events.extend([(0,bytes([0xb0+ch,91,28])),(0,bytes([0xb0+ch,93,0]))])
    def note(channel, pitch, beat, duration, velocity):
        if pitch < 0: return
        velocity = max(1, min(127, velocity + rng.randint(-5, 5)))
        # Small performance offsets and a soft swing replace the rigid quantized feel.
        beat=max(0,beat+(0.065 if abs(beat%1-.5)<.02 else 0)+rng.uniform(-.013,.013))
        events.append((beat, bytes([0x90 + channel, pitch, velocity])))
        events.append((beat + duration, bytes([0x80 + channel, pitch, 0])))
    # Freshly written eight-bar melody; every level develops this shared motif.
    phrases = [
        [(0, 76, .45), (.75, 79, .22), (1.25, 81, .4), (2, 79, .3), (2.5, 76, .6), (3.5, 74, .25)],
        [(0, 72, .6), (1, 76, .25), (1.5, 79, .4), (2.25, 77, .3), (3, 76, .65)],
        [(0, 74, .4), (.75, 77, .3), (1.5, 81, .4), (2.25, 79, .35), (3, 77, .4), (3.5, 74, .3)],
        [(0, 71, .35), (.5, 74, .3), (1.25, 77, .5), (2.25, 74, .3), (3, 72, .5)],
        [(0, 77, .55), (1, 81, .4), (1.75, 84, .35), (2.5, 81, .3), (3.25, 79, .5)],
        [(0, 76, .4), (.75, 79, .35), (1.5, 83, .45), (2.5, 79, .3), (3.25, 76, .5)],
        [(0, 74, .35), (.75, 77, .3), (1.25, 76, .3), (2, 74, .4), (2.75, 72, .3), (3.5, 71, .25)],
        [(0, 72, .7), (1.25, 76, .35), (2, 79, .4), (2.75, 74, .3), (3.5, 71, .3)]
    ]
    chords = [(48, [60,64,67,71]), (45,[57,60,64,67]), (50,[62,65,69,72]), (43,[59,62,65,69]), (41,[57,60,64,67]), (40,[55,59,62,67]), (50,[57,62,65,69]), (43,[59,62,65,69])]
    transpose = [0, 2, 5, 0, -2, 2][variant]
    for bar in range(bars):
        base = bar * 4
        root, chord = chords[bar % 8]
        if urgent:
            for beat in np.arange(0, 4, .5):
                note(9, 35 if beat%1==0 else 37, base+float(beat), .08, 24)
                note(4, root + 12 + transpose + [0,7,12,7][round(beat * 2) % 4], base + float(beat), .13, 31)
            for beat in [0, 2]: note(9, 36, base + beat, .1, 29)
            for beat in [1, 3]: note(9, 37, base + beat, .09, 23)
            continue
        # Bass alternates root, fifth, approach note, maintaining a buoyant pulse.
        for beat, pitch in enumerate([root, root + 7, root + 12, root + (11 if bar % 2 else 7)]): note(3, pitch-12+transpose,base+beat,.7,62 if beat%2==0 else 49)
        for beat in [.5, 1.5, 2.5, 3.5]:
            for i, pitch in enumerate(chord[:3]): note(2,pitch+transpose,base+beat+i*.024,.37,40-i*3)
        for beat, pitch, duration in phrases[bar % 8]:
            octave=-12 if variant==0 or bar//8==3 else 0
            # Lead/response phrases leave space for footsteps and chopping.
            channel=1 if bar%16>=12 else 0
            if bar%8<6 or beat<2:
                note(channel,pitch+transpose+octave,base+beat,duration*.96,59+(6 if beat==0 else 0))
        if bar // 8 in [1, 3]:
            for i, beat in enumerate([0.25, 1.25, 2.25, 3.25]): note(4,chord[i]+transpose,base+beat,.18,30)
        if bar % 8 in [4, 5]:
            for pitch in chord[1:]: note(5,pitch+transpose,base+.06,.8,24)
        if variant or bar // 8 % 2:
            for beat in [0, 2]: note(9,36,base+beat,.08,26)
            for beat in [1, 3]: note(9,37,base+beat,.07,25)
            for beat in [.5, 2.5]: note(9,69,base+beat,.05,16)
            if bar % 8 == 7: note(9, 54, base + 3.5, .12, 43)
    return events

def jingle(success):
    events = [(0, bytes([0xc0, 0])), (0, bytes([0xc1, 12])), (0, bytes([0xc3, 32]))]
    melody = [72, 76, 79, 84, 86, 84, 79, 84] if success else [76, 74, 72, 71, 69, 67]
    for i, pitch in enumerate(melody):
        duration = .3 if i < len(melody) - 1 else 1.4
        for ch, offset, vel in [(0, 0, 78), (1, 12, 48)]:
            events.extend([(i * .5, bytes([0x90 + ch, pitch + offset, vel])), (i * .5 + duration, bytes([0x80 + ch, pitch + offset, 0]))])
    for i in range(4):
        for pitch in ([48,60,64,67] if success else [45,57,60,64]):
            events.extend([(i, bytes([0x90, pitch, 43])), (i+.7, bytes([0x80, pitch, 0]))])
    return events

def render(key, events, bpm, bars, soundfont, work):
    beats = bars * 4
    midi_source = ROOT / 'assets' / 'music' / f'{key}-{VERSION}.mid'
    midi(midi_source, events, bpm, beats, repeats=1)
    rendering_midi = work / f'{key}-render.mid'
    midi(rendering_midi, events, bpm, beats, repeats=3)
    wav = work / f'{key}-{VERSION}.wav'
    command = ['fluidsynth', '-ni', '-q', '-r', str(RATE), '-g', '0.6', '-o', 'synth.reverb.active=1', '-o', 'synth.reverb.level=0.17', '-o', 'synth.chorus.active=0', '-F', str(wav), str(soundfont), str(rendering_midi)]
    subprocess.run(command, check=True, stdout=subprocess.DEVNULL)
    audio, rate = sf.read(wav, dtype='float32', always_2d=True)
    count = round(beats * 60 / bpm * rate)
    loop = audio[count:2 * count].copy()
    # Small edge ramps remove any fractional-sample seam without changing timing.
    ramp = np.linspace(0, 1, 48, dtype=np.float32)[:, None]
    loop[:48] *= ramp
    loop[-48:] *= ramp[::-1]
    # Gentle treble roll-off removes brittle sampler highs while preserving transients.
    from scipy.signal import butter,sosfilt
    sos=butter(2,6800,fs=rate,output='sos')
    repeated=np.concatenate([loop,loop],axis=0)
    loop=sosfilt(sos,repeated,axis=0)[len(loop):].astype(np.float32)
    peak=float(np.max(np.abs(loop)))
    rms=float(np.sqrt(np.mean(loop**2)))
    gain=min(7.5,.72/max(.01,peak),.055/max(.005,rms))
    loop *= gain
    if key.endswith('-urgent'): loop *= .65
    destination = ROOT / 'public' / 'audio' / f'{key}-{VERSION}.ogg'
    loop=np.ascontiguousarray(loop,dtype=np.float64)
    sf.write(ROOT/'assets/music/masters'/f'{key}-{VERSION}.wav',loop,rate,subtype='PCM_16')
    with sf.SoundFile(destination,'w',samplerate=rate,channels=loop.shape[1],format='OGG',subtype='VORBIS') as output:
        for begin in range(0,len(loop),16384):output.write(loop[begin:begin+16384])
    mp3 = destination.with_suffix('.mp3')
    subprocess.run(['lame', '--quiet', '-b', '112', str(ROOT / 'assets' / 'music' / 'masters' / f'{key}-{VERSION}.wav'), str(mp3)], check=True)
    print(f'{key}: {len(loop)/rate:.3f}s, peak {np.max(np.abs(loop)):.3f}, {destination.stat().st_size/1024:.0f} KiB', flush=True)
    lead={'menu':'nylon guitar','level1':'piano','level2':'steel-string guitar','level3':'marimba','level4':'accordion','level5':'clarinet'}.get(key.removesuffix('-urgent'),'piano / marimba')
    instruments=['piano','marimba'] if key in ['success','failure'] else ['pizzicato strings','brush percussion'] if key.endswith('-urgent') else [lead,'piano','nylon guitar','upright bass','pizzicato strings','vibraphone','brush percussion']
    return {'arrangement':VERSION,'instruments':instruments,'peak':float(np.max(np.abs(loop))),'rms':float(np.sqrt(np.mean(loop**2))), 'file': destination.name, 'fallback': mp3.name, 'seconds': len(loop)/rate, 'bpm': bpm, 'bars': bars}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--soundfont',type=Path,required=True)
    parser.add_argument('--output-root',type=Path)
    parser.add_argument('--preview',choices=['menu','level1','level2','level3','level4','level5'])
    args=parser.parse_args()
    global ROOT
    if args.output_root:ROOT=args.output_root.resolve()
    (ROOT/'assets/music').mkdir(parents=True,exist_ok=True)
    for folder in ['public/audio', 'assets/music/masters']: (ROOT / folder).mkdir(parents=True, exist_ok=True)
    manifest = {'composer': 'Kitchen Chaos original score', 'renderer': 'FluidSynth / GeneralUser GS by S. Christian Collins', 'version':VERSION,'tracks': {}}
    with tempfile.TemporaryDirectory(prefix='kitchen-chaos-music-') as temp:
        work = Path(temp)
        for key, variant, bpm in [('menu',0,98),('level1',1,104),('level2',2,112),('level3',3,118),('level4',4,122),('level5',5,128)]:
            if args.preview and key!=args.preview:continue
            manifest['tracks'][key] = render(key, compose(variant,40), bpm,40,args.soundfont,work)
            if variant and not args.preview: manifest['tracks'][f'{key}-urgent'] = render(f'{key}-urgent',compose(variant,40,True),bpm,40,args.soundfont,work)
        for key, success in ([] if args.preview else [('success',True),('failure',False)]):
            manifest['tracks'][key] = render(key,jingle(success),120,2,args.soundfont,work)
    (ROOT / 'public' / 'audio' / 'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
if __name__ == '__main__': main()
