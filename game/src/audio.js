// Ridge Runner — sound without a single audio file.
// One job: synthesise the engine hum, wind, chimes and thuds with WebAudio.
// Nothing is fetched; the context starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      ctx = new AC();
      // Engine: a sawtooth through a low-pass, its pitch following the throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      // Wind: looped noise through a band-pass, louder with speed.
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buffer;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
    } catch {
      ctx = null;
    }
  }

  /** Call every frame with the plane's state; silence when muted or grounded. */
  function update(plane) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const rpm = plane.onGround ? 0.25 + plane.throttle * 0.5 : 0.4 + plane.throttle * 0.9;
    engineOsc.frequency.setTargetAtTime(48 + rpm * 60, t, 0.1);
    const engineLevel = plane.crashed ? 0 : 0.05 + plane.throttle * 0.075;
    engineGain.gain.setTargetAtTime(engineLevel, t, 0.15);
    const windLevel = plane.onGround ? 0 : Math.min(0.09, (plane.speed / 175) * 0.09);
    windGain.gain.setTargetAtTime(windLevel, t, 0.2);
  }

  function blip(freq, dur, type, level, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, level) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(t);
  }

  return {
    ensure,
    update,
    ring() {
      blip(880, 0.25, 'sine', 0.22);
      blip(1318, 0.35, 'sine', 0.18, 0.09);
    },
    crate() {
      blip(523, 0.2, 'sine', 0.2);
      blip(784, 0.3, 'sine', 0.16, 0.08);
    },
    touchdown() {
      noiseBurst(0.18, 0.3);
      blip(180, 0.15, 'sine', 0.2);
    },
    hard() {
      noiseBurst(0.3, 0.45);
    },
    crash() {
      noiseBurst(0.9, 0.6);
      blip(90, 0.7, 'sine', 0.3);
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.4, 'sine', 0.2, i * 0.12));
    },
    toggleMute() {
      muted = !muted;
      if (ctx && engineGain) {
        const t = ctx.currentTime;
        engineGain.gain.setTargetAtTime(muted ? 0 : 0.05, t, 0.05);
        windGain.gain.setTargetAtTime(0, t, 0.05);
      }
      return muted;
    },
    isMuted() {
      return muted;
    },
  };
}
