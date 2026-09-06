import { ACTION_MAP, SPEED_EVERY, type ActionId } from "./actions";

export function noiseLevel(correctCount: number) {
  return Math.min(5, Math.floor(correctCount / SPEED_EVERY));
}

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

function fartBuffer(ctx: AudioContext, seconds: number, flutterHz: number) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    brown += (Math.random() * 2 - 1) * 0.03;
    brown = Math.max(-1, Math.min(1, brown * 0.996));
    const t = i / ctx.sampleRate;
    const env = Math.pow(1 - i / length, 0.28);
    const flutter =
      0.42 + 0.58 * Math.abs(Math.sin(t * flutterHz * Math.PI * 2));
    const grit = Math.random() < 0.07 ? (Math.random() * 2 - 1) * 0.55 : 0;
    data[i] = (brown * 5.2 + grit) * flutter * env;
  }
  return buffer;
}

function burpBuffer(
  ctx: AudioContext,
  seconds: number,
  startHz: number,
  peakHz: number,
  endHz: number,
) {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const hz =
      t < 0.22
        ? startHz + (peakHz - startHz) * (t / 0.22)
        : peakHz * Math.pow(endHz / peakHz, (t - 0.22) / 0.78);
    phase += hz / ctx.sampleRate;
    const cycle = phase % 1;
    const pulse = cycle < 0.14 ? Math.exp(-cycle * 26) : 0;
    const body = Math.sin(phase * 2 * Math.PI) * 0.22;
    const air = (Math.random() * 2 - 1) * 0.08 * (1 - t);
    const env = Math.pow(1 - t, 0.32);
    data[i] = (pulse * 2.1 + body + air) * env;
  }
  return buffer;
}

type PlayOpts = {
  level?: number;
  exaggerate?: boolean;
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private voiceTimer: number | null = null;
  private announceToken = 0;

  get audioContext() {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    return ctx;
  }

  async unlock() {
    const ctx = this.audioContext;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis.getVoices();
    }
  }

  cancelMissLine() {
    if (this.voiceTimer) {
      window.clearTimeout(this.voiceTimer);
      this.voiceTimer = null;
    }
    this.announceToken += 1;
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
  }

  cancelAnnounce() {
    this.announceToken += 1;
  }

  setMuted(next: boolean) {
    this.muted = next;
    if (this.master) this.master.gain.value = next ? 0 : 0.85;
    if (next && typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
  }

  private dest() {
    const master = this.audioContext && this.master;
    if (!master) {
      throw new Error("Audio is not ready");
    }
    return master;
  }

  playAction(id: ActionId, opts: PlayOpts = {}) {
    if (this.muted) return;
    const level = opts.level ?? 0;
    const exaggerate = Boolean(opts.exaggerate);
    if (id === "fart") this.playFart(level, exaggerate);
    if (id === "burp") this.playBurp(level, exaggerate);
    if (id === "pick") this.playPick(exaggerate);
    if (id === "sneeze") this.playSneeze(level, exaggerate);
  }

  playMiss(id: ActionId | null, level = 0) {
    if (this.muted) return;
    if (id) {
      this.playAction(id, { level, exaggerate: true });
    }
    const waitMs = id ? this.missHoldMs(id, level) : 280;
    if (this.voiceTimer) window.clearTimeout(this.voiceTimer);
    this.voiceTimer = window.setTimeout(() => {
      const line =
        Math.random() < 0.5 ? "Try again! Or resume!" : "Resume! Or try again!";
      this.speak(line, { pitch: 1.35, rate: 1.02 });
    }, waitMs);
  }

  announce(id: ActionId, onDone?: () => void) {
    this.announceToken += 1;
    const token = this.announceToken;
    let started = false;
    const finish = () => {
      if (token !== this.announceToken || started) return;
      started = true;
      onDone?.();
    };
    if (this.muted) {
      finish();
      return;
    }
    this.speak(ACTION_MAP[id].shout, {
      onEnd: finish,
      fallbackMs: 1600,
    });
    this.cueHit();
  }

  speak(
    text: string,
    opts: {
      pitch?: number;
      rate?: number;
      onEnd?: () => void;
      fallbackMs?: number;
    } = {},
  ) {
    if (this.muted || typeof window === "undefined") {
      opts.onEnd?.();
      return;
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      opts.onEnd?.();
    };
    const voice = new SpeechSynthesisUtterance(text);
    voice.pitch = opts.pitch ?? 1.45;
    voice.rate = opts.rate ?? 1.12;
    voice.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const funny =
      voices.find((item) =>
        /kid|child|zira|samantha|google us/i.test(item.name),
      ) ?? voices.find((item) => item.lang.startsWith("en"));
    if (funny) voice.voice = funny;
    const fallback = window.setTimeout(
      finish,
      opts.fallbackMs ?? Math.max(1000, text.length * 90),
    );
    voice.onend = () => {
      window.clearTimeout(fallback);
      finish();
    };
    voice.onerror = () => {
      window.clearTimeout(fallback);
      finish();
    };
    window.setTimeout(() => {
      if (finished) return;
      window.speechSynthesis.speak(voice);
    }, 40);
  }

  playBeat(windowMs: number, beatMs: number) {
    if (this.muted) return;
    const ctx = this.audioContext;
    const start = ctx.currentTime + 0.02;
    const step = Math.max(0.16, beatMs / 1000);
    const duration = windowMs / 1000;
    let i = 0;
    for (let t = 0; t < duration - 0.04; t += step) {
      this.kick(start + t, i % 2 === 0 ? 0.72 : 0.34);
      this.tick(start + t + step * 0.5, i % 4 === 3 ? 0.28 : 0.16);
      i += 1;
    }
  }

  playFaster() {
    if (this.muted) return;
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    [392, 494, 587, 784].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(this.dest());
      osc.start(t + index * 0.07);
      osc.stop(t + 0.16 + index * 0.07);
    });
  }

  private missHoldMs(id: ActionId, level: number) {
    const stretch = 2.2;
    if (id === "fart") return Math.round((0.5 + level * 0.32) * stretch * 1000);
    if (id === "burp")
      return Math.round((0.38 + level * 0.26) * stretch * 1000);
    if (id === "sneeze")
      return Math.round((0.7 + Math.min(level, 3) * 0.12) * stretch * 1000);
    return 1100;
  }

  private cueHit() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.16);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(this.dest());
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private kick(time: number, volume: number) {
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.14);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(gain).connect(this.dest());
    osc.start(time);
    osc.stop(time + 0.18);
  }

  private tick(time: number, volume: number) {
    const ctx = this.audioContext;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(filter).connect(gain).connect(this.dest());
    src.start(time);
    src.stop(time + 0.06);
  }

  private playPick(exaggerate: boolean) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const stretch = exaggerate ? 2.1 : 1;
    const loud = exaggerate ? 1.35 : 1;
    const seconds = 0.22 * stretch;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(420, t + seconds);
    filter.Q.value = 3.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.55 * loud, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(filter).connect(gain).connect(this.dest());
    src.start(t);
    src.stop(t + seconds + 0.02);
    const pop = ctx.createOscillator();
    const popGain = ctx.createGain();
    pop.type = "sine";
    pop.frequency.setValueAtTime(220, t);
    pop.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    popGain.gain.setValueAtTime(0.16 * loud, t);
    popGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    pop.connect(popGain).connect(this.dest());
    pop.start(t);
    pop.stop(t + 0.12);
  }

  private playFart(level: number, exaggerate: boolean) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const style = Math.min(5, Math.max(0, Math.floor(level)));
    const stretch = exaggerate ? 2.4 : 1;
    const loud = exaggerate ? 1.45 : 1;
    const seconds = (0.42 + style * 0.28) * stretch;
    const flutter = [11, 14, 22, 9, 18, 7][style];
    const startHz = [260, 220, 300, 180, 340, 150][style];
    const endHz = [70, 58, 90, 42, 64, 34][style];

    const src = ctx.createBufferSource();
    src.buffer = fartBuffer(ctx, seconds, flutter);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2.6 + style * 0.35;
    filter.frequency.setValueAtTime(startHz, t);
    if (style === 4) {
      filter.frequency.exponentialRampToValueAtTime(380, t + seconds * 0.35);
      filter.frequency.exponentialRampToValueAtTime(endHz, t + seconds);
    } else {
      filter.frequency.exponentialRampToValueAtTime(endHz, t + seconds);
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.95 * loud, t + 0.03);
    if (style >= 2) {
      gain.gain.exponentialRampToValueAtTime(0.4 * loud, t + seconds * 0.45);
      gain.gain.exponentialRampToValueAtTime(0.9 * loud, t + seconds * 0.55);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    src.connect(filter).connect(gain).connect(this.dest());
    src.start(t);
    src.stop(t + seconds + 0.02);

    if (style >= 3 || exaggerate) {
      this.sputter(t + seconds * 0.58, 0.18 * stretch, loud);
    }
  }

  private playBurp(level: number, exaggerate: boolean) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const style = Math.min(5, Math.max(0, Math.floor(level)));
    const stretch = exaggerate ? 2.15 : 1;
    const loud = exaggerate ? 1.4 : 1;
    const hits = style >= 3 ? 2 : 1;
    const hitLen = (0.38 + style * 0.12) * stretch;
    const starts = [108, 96, 118, 88, 78, 132];
    const peaks = [148, 130, 170, 120, 108, 188];
    const ends = [48, 42, 52, 38, 34, 44];

    for (let hit = 0; hit < hits; hit += 1) {
      const at = t + hit * (hitLen * 0.7);
      const src = ctx.createBufferSource();
      src.buffer = burpBuffer(
        ctx,
        hitLen,
        starts[style] * (hit === 1 ? 0.86 : 1),
        peaks[style] * (hit === 1 ? 0.84 : 1),
        ends[style],
      );
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(720, at);
      filter.frequency.exponentialRampToValueAtTime(180, at + hitLen);
      filter.Q.value = 1.1;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.85 * loud, at + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + hitLen);
      src.connect(filter).connect(gain).connect(this.dest());
      src.start(at);
      src.stop(at + hitLen + 0.02);
    }
  }

  private playSneeze(level: number, exaggerate: boolean) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const stretch = exaggerate ? 2.1 : 1;
    const loud = exaggerate ? 1.4 : 1;
    const extra = Math.min(3, level) * 0.05;

    const inhale = ctx.createOscillator();
    const inhaleGain = ctx.createGain();
    inhale.type = "triangle";
    inhale.frequency.setValueAtTime(exaggerate ? 260 : 380, t);
    inhale.frequency.exponentialRampToValueAtTime(
      exaggerate ? 720 : 620,
      t + 0.16 * stretch,
    );
    inhaleGain.gain.setValueAtTime(0.0001, t);
    inhaleGain.gain.exponentialRampToValueAtTime(0.14 * loud, t + 0.05);
    inhaleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 * stretch);
    inhale.connect(inhaleGain).connect(this.dest());
    inhale.start(t);
    inhale.stop(t + 0.2 * stretch);

    const chooAt = t + 0.18 * stretch;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, (0.32 + extra) * stretch);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(exaggerate ? 900 : 1400, chooAt);
    filter.frequency.exponentialRampToValueAtTime(
      320,
      chooAt + (0.28 + extra) * stretch,
    );
    filter.Q.value = exaggerate ? 0.7 : 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, chooAt);
    gain.gain.exponentialRampToValueAtTime(0.95 * loud, chooAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      chooAt + (0.3 + extra) * stretch,
    );
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(exaggerate ? 120 : 180, chooAt);
    boom.frequency.exponentialRampToValueAtTime(55, chooAt + 0.22 * stretch);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.24 * loud, chooAt);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, chooAt + 0.28 * stretch);
    src.connect(filter).connect(gain).connect(this.dest());
    boom.connect(boomGain).connect(this.dest());
    src.start(chooAt);
    boom.start(chooAt);
    boom.stop(chooAt + 0.32 * stretch);
  }

  private sputter(start: number, length: number, loud: number) {
    const ctx = this.audioContext;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, length);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(180, start);
    filter.frequency.exponentialRampToValueAtTime(70, start + length);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.35 * loud, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    src.connect(filter).connect(gain).connect(this.dest());
    src.start(start);
    src.stop(start + length + 0.02);
  }
}
