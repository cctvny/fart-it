import { ACTION_MAP, type ActionId } from "./actions";

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;

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

  playAction(id: ActionId) {
    if (this.muted) return;
    if (id === "fart") this.playFart();
    if (id === "burp") this.playBurp();
    if (id === "pick") this.speak("pick it");
    if (id === "sneeze") this.playSneeze();
  }

  announce(id: ActionId) {
    if (this.muted) return;
    this.speak(ACTION_MAP[id].shout);
    this.cueHit();
  }

  speak(text: string) {
    if (this.muted || typeof window === "undefined") return;
    window.speechSynthesis.cancel();
    const voice = new SpeechSynthesisUtterance(text);
    voice.pitch = 1.45;
    voice.rate = 1.12;
    voice.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const funny =
      voices.find((item) =>
        /kid|child|zira|samantha|google us/i.test(item.name),
      ) ?? voices.find((item) => item.lang.startsWith("en"));
    if (funny) voice.voice = funny;
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

  playFail() {
    if (this.muted) return;
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    [220, 165, 110].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18 + index * 0.12);
      osc.connect(gain).connect(this.dest());
      osc.start(t + index * 0.1);
      osc.stop(t + 0.32 + index * 0.12);
    });
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

  private playFart() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.62);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(520, t);
    filter.frequency.exponentialRampToValueAtTime(70, t + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.95, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.5);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.22, t);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(filter).connect(gain).connect(this.dest());
    osc.connect(oscGain).connect(this.dest());
    src.start(t);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  private playBurp() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc2.type = "sine";
    osc.frequency.setValueAtTime(148, t);
    osc.frequency.exponentialRampToValueAtTime(58, t + 0.38);
    osc2.frequency.setValueAtTime(92, t);
    osc2.frequency.exponentialRampToValueAtTime(40, t + 0.38);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
    gain.gain.setValueAtTime(0.22, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.dest());
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.44);
    osc2.stop(t + 0.44);
  }

  private playSneeze() {
    const ctx = this.audioContext;
    const t = ctx.currentTime;
    const inhale = ctx.createOscillator();
    const inhaleGain = ctx.createGain();
    inhale.type = "triangle";
    inhale.frequency.setValueAtTime(380, t);
    inhale.frequency.exponentialRampToValueAtTime(620, t + 0.16);
    inhaleGain.gain.setValueAtTime(0.0001, t);
    inhaleGain.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    inhaleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    inhale.connect(inhaleGain).connect(this.dest());
    inhale.start(t);
    inhale.stop(t + 0.2);

    const chooAt = t + 0.18;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.32);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1400, chooAt);
    filter.frequency.exponentialRampToValueAtTime(400, chooAt + 0.28);
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, chooAt);
    gain.gain.exponentialRampToValueAtTime(0.9, chooAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, chooAt + 0.3);
    const boom = ctx.createOscillator();
    boom.type = "sine";
    boom.frequency.setValueAtTime(180, chooAt);
    boom.frequency.exponentialRampToValueAtTime(70, chooAt + 0.22);
    const boomGain = ctx.createGain();
    boomGain.gain.setValueAtTime(0.2, chooAt);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, chooAt + 0.24);
    src.connect(filter).connect(gain).connect(this.dest());
    boom.connect(boomGain).connect(this.dest());
    src.start(chooAt);
    boom.start(chooAt);
    boom.stop(chooAt + 0.28);
  }
}
