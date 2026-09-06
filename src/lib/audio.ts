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
  private announceToken = 0;
  private sampleCache = new Map<string, HTMLAudioElement>();
  private musicTimer: number | null = null;
  private musicOn = false;
  private nextNoteTime = 0;
  private musicBeatSec = 0.5;
  private musicBeatIndex = 0;

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
      this.preloadSamples();
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

  private preloadSamples() {
    for (const src of [
      "/sounds/fart-1.mp3",
      "/sounds/fart-2.mp3",
      "/sounds/fart-3.mp3",
      "/sounds/fart-wet.mp3",
      "/sounds/burp-1.mp3",
      "/sounds/sneeze-1.mp3",
      "/sounds/sneeze-2.mp3",
      "/sounds/sneeze-3.mp3",
      "/sounds/vomit-1.mp3",
    ]) {
      const audio = new Audio(src);
      audio.preload = "auto";
      this.sampleCache.set(src, audio);
    }
  }

  private playSample(
    src: string,
    opts: { rate?: number; volume?: number; delayMs?: number } = {},
  ) {
    const cached = this.sampleCache.get(src) ?? new Audio(src);
    this.sampleCache.set(src, cached);
    const node = cached.cloneNode(true) as HTMLAudioElement;
    node.playbackRate = opts.rate ?? 1;
    node.volume = Math.min(1, opts.volume ?? 1);
    const start = () => {
      void node.play().catch(() => {});
    };
    if (opts.delayMs) {
      window.setTimeout(start, opts.delayMs);
    } else {
      start();
    }
  }

  playAction(id: ActionId, opts: PlayOpts = {}) {
    if (this.muted) return;
    const level = opts.level ?? 0;
    const exaggerate = Boolean(opts.exaggerate);
    if (id === "fart") this.playFart(level, exaggerate);
    if (id === "burp") this.playBurp(level, exaggerate);
    if (id === "vomit") this.playVomit(exaggerate);
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

  startMusic(beatMs: number) {
    this.stopMusic();
    this.musicOn = true;
    this.musicBeatSec = Math.max(0.16, beatMs / 1000);
    this.musicBeatIndex = 0;
    this.nextNoteTime = this.audioContext.currentTime + 0.04;
    this.scheduleMusic();
  }

  setMusicTempo(beatMs: number) {
    this.musicBeatSec = Math.max(0.16, beatMs / 1000);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private scheduleMusic() {
    if (!this.musicOn) return;
    const ctx = this.audioContext;
    const horizon = ctx.currentTime + 0.28;
    while (this.nextNoteTime < horizon) {
      const i = this.musicBeatIndex;
      this.kick(this.nextNoteTime, i % 2 === 0 ? 0.72 : 0.34);
      this.tick(
        this.nextNoteTime + this.musicBeatSec * 0.5,
        i % 4 === 3 ? 0.28 : 0.16,
      );
      this.nextNoteTime += this.musicBeatSec;
      this.musicBeatIndex += 1;
    }
    this.musicTimer = window.setTimeout(() => this.scheduleMusic(), 40);
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
    if (id === "vomit") return 1400;
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

  private playVomit(exaggerate: boolean) {
    this.playSample("/sounds/vomit-1.mp3", {
      rate: exaggerate ? 0.88 : 1,
      volume: 1,
    });
    if (exaggerate) {
      this.playSample("/sounds/vomit-1.mp3", {
        delayMs: 620,
        rate: 0.8,
      });
    }
  }

  private playFart(level: number, exaggerate: boolean) {
    const style = Math.min(5, Math.max(0, Math.floor(level)));
    const farts = [
      "/sounds/fart-1.mp3",
      "/sounds/fart-2.mp3",
      "/sounds/fart-3.mp3",
      "/sounds/fart-wet.mp3",
    ];
    const first = farts[style % farts.length];
    const second = farts[(style + 1) % farts.length];
    this.playSample(first, {
      rate: exaggerate ? 0.84 : 1,
      volume: 1,
    });
    if (exaggerate || style >= 4) {
      this.playSample(second, {
        delayMs: exaggerate ? 520 : 430,
        rate: 0.92,
      });
    }
  }

  private playBurp(level: number, exaggerate: boolean) {
    const style = Math.min(5, Math.max(0, Math.floor(level)));
    const rates = [1, 0.94, 1.08, 0.86, 0.78, 1.14];
    this.playSample("/sounds/burp-1.mp3", {
      rate: rates[style],
      volume: 1,
    });
    if (exaggerate || style >= 3) {
      this.playSample("/sounds/burp-1.mp3", {
        delayMs: exaggerate ? 420 : 300,
        rate: 0.82,
      });
    }
  }

  private playSneeze(level: number, exaggerate: boolean) {
    const sneezes = [
      "/sounds/sneeze-1.mp3",
      "/sounds/sneeze-2.mp3",
      "/sounds/sneeze-3.mp3",
    ];
    const style = Math.min(2, Math.max(0, Math.floor(level)));
    const first = exaggerate ? sneezes[2] : sneezes[style];
    this.playSample(first, {
      rate: exaggerate ? 0.9 : 1,
      volume: 1,
    });
    if (exaggerate) {
      this.playSample(sneezes[0], {
        delayMs: 900,
        rate: 0.86,
      });
    }
  }
}
