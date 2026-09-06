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

type PlayOpts = {
  level?: number;
  exaggerate?: boolean;
};

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private voiceTimer: number | null = null;

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
    if (typeof window !== "undefined") {
      window.speechSynthesis.cancel();
    }
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

  announce(id: ActionId) {
    if (this.muted) return;
    this.speak(ACTION_MAP[id].shout);
    this.cueHit();
  }

  speak(
    text: string,
    opts: { pitch?: number; rate?: number; onEnd?: () => void } = {},
  ) {
    if (this.muted || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
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
    if (opts.onEnd) voice.onend = opts.onEnd;
    window.speechSynthesis.speak(voice);
  }

  playBeat(windowMs: number) {
    if (this.muted) return;
    const ctx = this.audioContext;
    const start = ctx.currentTime + 0.02;
    const step = windowMs / 1000 / 4;
    for (let i = 0; i < 4; i += 1) {
      this.kick(start + i * step, i % 2 === 0 ? 0.7 : 0.32);
      this.tick(start + i * step + step * 0.5, i === 3 ? 0.28 : 0.18);
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
    this.speak(exaggerate ? "Piiiick iiiit!" : "pick it", {
      pitch: exaggerate ? 0.7 : 1.45,
      rate: exaggerate ? 0.62 : 1.12,
    });
  }

  private playFart(level: number, exaggerate: boolean) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const style = Math.min(5, Math.max(0, Math.floor(level)));
    const stretch = exaggerate ? 2.35 : 1;
    const loud = exaggerate ? 1.4 : 1;
    const seconds = (0.48 + style * 0.34) * stretch;

    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, seconds + 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4 + style + (exaggerate ? 4 : 0);

    const startHz = [420, 360, 520, 280, 640, 210][style];
    const endHz = [90, 70, 110, 48, 80, 36][style];
    filter.frequency.setValueAtTime(startHz, t);
    filter.frequency.exponentialRampToValueAtTime(endHz, t + seconds);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9 * loud, t + 0.04);
    if (style >= 2) {
      const mid = t + seconds * 0.45;
      gain.gain.exponentialRampToValueAtTime(0.45 * loud, mid);
      gain.gain.exponentialRampToValueAtTime(0.95 * loud, mid + 0.08);
    }
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);

    const osc = ctx.createOscillator();
    osc.type = style >= 4 ? "sawtooth" : style >= 2 ? "triangle" : "sine";
    const bassStart = [88, 72, 110, 58, 140, 46][style];
    osc.frequency.setValueAtTime(bassStart, t);
    if (style === 4) {
      osc.frequency.exponentialRampToValueAtTime(180, t + seconds * 0.4);
      osc.frequency.exponentialRampToValueAtTime(36, t + seconds);
    } else if (style === 2) {
      osc.frequency.setValueAtTime(bassStart, t);
      osc.frequency.exponentialRampToValueAtTime(bassStart * 0.7, t + seconds);
    } else {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(28, bassStart * 0.42),
        t + seconds,
      );
    }
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.18 * loud, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);

    src.connect(filter).connect(gain).connect(this.dest());
    osc.connect(oscGain).connect(this.dest());
    src.start(t);
    osc.start(t);
    osc.stop(t + seconds + 0.02);

    if (style >= 1) {
      this.bubblePops(t + 0.12, 2 + style, loud);
    }
    if (style >= 3) {
      this.sputter(t + seconds * 0.55, 0.22 * stretch, loud);
    }
    if (exaggerate) {
      this.sputter(t + seconds * 0.72, 0.28, loud);
    }
  }

  private playBurp(level: number, exaggerate: boolean) {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const style = Math.min(5, Math.max(0, Math.floor(level)));
    const stretch = exaggerate ? 2.2 : 1;
    const loud = exaggerate ? 1.35 : 1;
    const hits = style >= 3 ? 2 : 1;
    const hitLen = (0.34 + style * 0.16) * stretch;

    for (let hit = 0; hit < hits; hit += 1) {
      const at = t + hit * (hitLen * 0.62);
      const osc = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = style >= 4 ? "triangle" : "sawtooth";
      osc2.type = "sine";
      const start =
        [150, 128, 168, 118, 96, 188][style] * (hit === 1 ? 0.82 : 1);
      osc.frequency.setValueAtTime(start, at);
      osc.frequency.exponentialRampToValueAtTime(start * 0.36, at + hitLen);
      osc2.frequency.setValueAtTime(start * 0.62, at);
      osc2.frequency.exponentialRampToValueAtTime(start * 0.22, at + hitLen);
      if (style === 4) {
        osc.frequency.setValueAtTime(start, at);
        osc.frequency.exponentialRampToValueAtTime(start * 1.4, at + 0.08);
        osc.frequency.exponentialRampToValueAtTime(start * 0.3, at + hitLen);
      }
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.3 * loud, at + 0.03);
      gain.gain.setValueAtTime(0.22 * loud, at + hitLen * 0.35);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + hitLen);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.dest());
      osc.start(at);
      osc2.start(at);
      osc.stop(at + hitLen + 0.02);
      osc2.stop(at + hitLen + 0.02);
    }

    if (style >= 2) {
      this.gurgle(t + 0.08, hitLen * hits * 0.7, loud);
    }
    if (exaggerate) {
      this.gurgle(t + hitLen * 0.4, hitLen, loud * 0.8);
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

  private bubblePops(start: number, count: number, loud: number) {
    const ctx = this.audioContext;
    for (let i = 0; i < count; i += 1) {
      const at = start + i * 0.09;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(240 + i * 40, at);
      osc.frequency.exponentialRampToValueAtTime(90, at + 0.07);
      gain.gain.setValueAtTime(0.08 * loud, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.08);
      osc.connect(gain).connect(this.dest());
      osc.start(at);
      osc.stop(at + 0.09);
    }
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

  private gurgle(start: number, length: number, loud: number) {
    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = "sine";
    lfo.type = "sine";
    osc.frequency.setValueAtTime(70, start);
    lfo.frequency.value = 12;
    lfoGain.gain.value = 18;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.12 * loud, start + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(this.dest());
    osc.start(start);
    lfo.start(start);
    osc.stop(start + length + 0.02);
    lfo.stop(start + length + 0.02);
  }
}
