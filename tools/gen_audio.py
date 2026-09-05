#!/usr/bin/env python3
"""
Generate assets/ambient.wav : a dark, deep, cinematic ambient pad loop for GARGANTUA.
Layered detuned saw/sine drones + sub pulse + filtered noise "space wind" + slow
shimmering bell pad, with a simple synthetic reverb (exponential-decay noise IR).
Output: stereo 16-bit WAV, 44100 Hz, ~28 s loop, normalized with fade in/out for
seamless looping (crossfade loop point).
"""
import numpy as np
import wave, os

SR = 44100
DUR = 28.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(13)

def note_freq(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

# ---------------- voices (detuned saw pairs, slow LFO) ----------------
def saw(phase):
    return 2.0 * (phase - np.floor(phase + 0.5))

layers = []
# Drone chord: A1(33), E2(40), A2(45), C3(48), E3(52) -> dark Am add9
chord = [33, 40, 45, 48, 52]
for i, m in enumerate(chord):
    f = note_freq(m)
    amp = 1.0 / (i + 1.4)
    # detuned pair per note
    for det, g in [(0.996, 0.5), (1.004, 0.5), (1.0, 0.35)]:
        ph = rng.random()
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * (0.02 + 0.013 * i) * t + rng.random() * 6.28)
        s = saw(t * f * det + ph)
        layers.append(g * amp * lfo * s)

mix = sum(layers) / len(layers) * 0.9

# ---------------- sub bass pulse (slow, heartbeat-ish) ----------------
sub = np.zeros(N)
beats = np.arange(0, DUR, 2.0)
for b in beats:
    i0 = int(b * SR)
    if i0 >= N: break
    n = min(N - i0, int(SR * 1.8))
    tt = np.arange(n) / SR
    env = np.exp(-tt * 2.2)
    sub[i0:i0+n] += 0.5 * np.sin(2*np.pi*20.0*tt) * env
sub *= 1.0 / max(np.max(np.abs(sub)), 1e-9)
mix += 0.16 * sub

# ---------------- shimmer bell pad (soft FM, high register) ----------------
bells = np.zeros(N)
for m in [57, 60, 52, 55, 57, 64]:
    f = note_freq(m)
    for det in [0.998, 1.0035, 1.0]:
        ph = rng.random() * 6.28
        # slow amplitude tremolo
        trem = 0.55 + 0.45 * np.sin(2*np.pi*0.045*t + ph*2)
        bell = np.sin(2*np.pi*f*det*t + 0.35*np.sin(2*np.pi*f*3.01*det*t + ph)*np.exp(-t*0.05))
        env = np.minimum(1.0, t*0.5) * np.minimum(1.0, (DUR-t)*0.5) * np.exp(-t*0.012)
        bells += 0.16 * trem * env * bell
mix += bells

# ---------------- wind: filtered noise ----------------
from numpy.fft import rfft, irfft, rfftfreq
noise = rng.standard_normal(N)
spec = rfft(noise)
freqs = rfftfreq(N, 1/SR)
# pink-ish filter: strong low, roll off
shape = 1.0 / np.sqrt(1.0 + (freqs / 320.0)**2.2)
spec *= shape
wind = irfft(spec, N)
wind = wind / (np.max(np.abs(wind)) + 1e-9)
wind_lfo = 0.45 + 0.55 * np.sin(2*np.pi*0.031*t + 1.2)**2
mix += 0.055 * wind * wind_lfo

# ---------------- gentle slow LFO master + soft clip ----------------
master = 0.6 + 0.4 * np.sin(2*np.pi*0.012*t)
mix *= master
mix = np.tanh(mix * 1.25)

# ---------------- synthetic reverb (expo-decay noise IR) ----------------
ir_len = int(SR * 1.6)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / (SR * 0.38))
ir /= np.sqrt(np.sum(ir**2))
wet = np.convolve(mix, ir, mode='same') * 0.95
wet = wet[:N]
# tail crossfade loop point: make last 1.5 s fade in to first 1.5 s content
fade = np.ones(N)
ff = int(SR * 2.0)
fade[:ff] = np.linspace(1.0, 0.999, ff)
fade[-ff:] = np.linspace(0.0, 1.0, ff)
# crossfade the loop seam: blend end with beginning
loop = 0.62 * mix + 0.38 * wet
loop[:ff] = 0.0
seam = loop.copy()
lead = (0.62 * mix + 0.38 * wet)
seam[:ff] = lead[-ff:] * np.linspace(0, 1, ff)
seam[-ff:] = lead[:ff] * np.linspace(1, 0, ff) + lead[-ff:]
loop = seam

# normalize to -3 dBFS peak
peak = np.max(np.abs(loop)) + 1e-9
loop = loop / peak * 0.707

# initial fade in (so loop start is quiet but audible)
loop[:int(SR*0.03)] *= np.linspace(0, 1, int(SR*0.03))
loop[-int(SR*0.03):] *= np.linspace(1, 0, int(SR*0.03))

stereo = np.stack([loop, loop * 0.985], axis=1)
pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')

out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ambient.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", os.path.abspath(out), os.path.getsize(out)//1024, "KB")