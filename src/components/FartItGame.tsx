"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Image from "next/image";
import {
  ACTIONS,
  ACTION_MAP,
  DEFAULT_LAYOUT,
  PRESS_WINDOW_MS,
  SLOT_HINT,
  SLOT_KEYS,
  SPEED_EVERY,
  actionAtSlot,
  beatIntervalMs,
  beatLabel,
  musicLevel,
  nextAction,
  shufflePadLayout,
  type ActionId,
  type PadLayout,
} from "@/lib/actions";
import { GameAudio, noiseLevel } from "@/lib/audio";
import {
  getServerScores,
  isHighScore,
  loadHighScores,
  saveHighScore,
  subscribeHighScores,
} from "@/lib/scores";

type Phase = "title" | "playing" | "over";

export default function FartItGame() {
  const [phase, setPhase] = useState<Phase>("title");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [current, setCurrent] = useState<ActionId | null>(null);
  const [windowMs] = useState(PRESS_WINDOW_MS);
  const [beatMs, setBeatMs] = useState(beatIntervalMs(0));
  const [roundId, setRoundId] = useState(0);
  const [pressed, setPressed] = useState<ActionId | null>(null);
  const [flash, setFlash] = useState<"good" | "bad" | "faster" | null>(null);
  const [muted, setMuted] = useState(false);
  const scores = useSyncExternalStore(
    subscribeHighScores,
    loadHighScores,
    getServerScores,
  );
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [beatOn, setBeatOn] = useState(false);
  const [armed, setArmed] = useState(false);
  const [layout, setLayout] = useState<PadLayout>(DEFAULT_LAYOUT);

  const audioRef = useRef<GameAudio | null>(null);
  const acceptingRef = useRef(false);
  const currentRef = useRef<ActionId | null>(null);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const phaseRef = useRef<Phase>("title");
  const layoutRef = useRef<PadLayout>(DEFAULT_LAYOUT);
  const roundTimer = useRef<number | null>(null);
  const pressTimer = useRef<number | null>(null);

  const audio = useCallback(() => {
    if (!audioRef.current) audioRef.current = new GameAudio();
    return audioRef.current;
  }, []);

  const clearRoundTimer = () => {
    if (roundTimer.current) {
      window.clearTimeout(roundTimer.current);
      roundTimer.current = null;
    }
  };

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    audio().setMuted(muted);
  }, [audio, muted]);

  useEffect(() => {
    return () => {
      clearRoundTimer();
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      audioRef.current?.stopMusic();
    };
  }, []);

  const endGame = useCallback(() => {
    const missed = currentRef.current;
    const level = noiseLevel(scoreRef.current);
    clearRoundTimer();
    audio().cancelAnnounce();
    audio().stopMusic();
    acceptingRef.current = false;
    currentRef.current = null;
    setCurrent(null);
    setBeatOn(false);
    setArmed(false);
    setPhase("over");
    setFlash("bad");
    audio().playMiss(missed, level);
  }, [audio]);

  const launchRound = useCallback(
    (previous: ActionId | null, correctSoFar: number) => {
      const action = nextAction(previous);
      const nextBeat = beatIntervalMs(correctSoFar);
      currentRef.current = action;
      acceptingRef.current = true;
      setCurrent(action);
      setBeatMs(nextBeat);
      setRoundId((id) => id + 1);
      setArmed(false);
      setFlash(null);
      clearRoundTimer();
      audio().setMusicTempo(nextBeat);
      audio().announce(action, () => {
        if (phaseRef.current !== "playing") return;
        if (currentRef.current !== action) return;
        if (!acceptingRef.current) return;
        setArmed(true);
        clearRoundTimer();
        roundTimer.current = window.setTimeout(() => {
          if (!acceptingRef.current) return;
          if (phaseRef.current !== "playing") return;
          endGame();
        }, PRESS_WINDOW_MS);
      });
    },
    [audio, endGame],
  );

  const startGame = useCallback(async () => {
    await audio().unlock();
    audio().cancelMissLine();
    clearRoundTimer();
    scoreRef.current = 0;
    streakRef.current = 0;
    setScore(0);
    setStreak(0);
    setSaved(false);
    setFlash(null);
    setBeatMs(beatIntervalMs(0));
    setLayout(DEFAULT_LAYOUT);
    layoutRef.current = DEFAULT_LAYOUT;
    setBeatOn(true);
    setPhase("playing");
    phaseRef.current = "playing";
    audio().startMusic(beatIntervalMs(0));
    launchRound(null, 0);
  }, [audio, launchRound]);

  const continueGame = useCallback(async () => {
    await audio().unlock();
    audio().cancelMissLine();
    setSaved(false);
    setFlash(null);
    setStreak(0);
    streakRef.current = 0;
    setBeatOn(true);
    setPhase("playing");
    phaseRef.current = "playing";
    audio().startMusic(beatIntervalMs(scoreRef.current));
    launchRound(null, scoreRef.current);
  }, [audio, launchRound]);

  const handlePad = useCallback(
    async (id: ActionId) => {
      await audio().unlock();
      setPressed(id);
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => setPressed(null), 160);

      const freePlay = phaseRef.current !== "playing";
      if (phaseRef.current === "playing" && !acceptingRef.current) {
        return;
      }
      if (freePlay) {
        audio().playAction(id, {
          level: Math.floor(Math.random() * 6),
        });
        return;
      }

      if (id !== currentRef.current) {
        endGame();
        return;
      }

      acceptingRef.current = false;
      audio().cancelAnnounce();
      clearRoundTimer();
      const nextScore = scoreRef.current + 1;
      const nextStreak = streakRef.current + 1;
      scoreRef.current = nextScore;
      streakRef.current = nextStreak;
      audio().playAction(id, { level: noiseLevel(nextScore) });
      setScore(nextScore);
      setStreak(nextStreak);
      setFlash("good");

      const spedUp =
        nextScore % SPEED_EVERY === 0 &&
        musicLevel(nextScore) > musicLevel(nextScore - 1);
      if (spedUp) {
        setFlash("faster");
        setBeatMs(beatIntervalMs(nextScore));
        audio().setMusicTempo(beatIntervalMs(nextScore));
        audio().playFaster();
        const nextLayout = shufflePadLayout(layoutRef.current);
        layoutRef.current = nextLayout;
        setLayout(nextLayout);
      }

      window.setTimeout(
        () => {
          if (phaseRef.current !== "playing") return;
          launchRound(id, nextScore);
        },
        spedUp ? 800 : 650,
      );
    },
    [audio, endGame, launchRound],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const key = event.key.toLowerCase();
      if (key === " " && phaseRef.current !== "playing") {
        event.preventDefault();
        if (phaseRef.current === "over") {
          void continueGame();
        } else {
          void startGame();
        }
        return;
      }
      const slot = SLOT_KEYS[key];
      if (slot) {
        event.preventDefault();
        void handlePad(actionAtSlot(layoutRef.current, slot));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [continueGame, handlePad, startGame]);

  const saveScore = () => {
    saveHighScore(name, scoreRef.current);
    setSaved(true);
  };

  const best = scores[0]?.score ?? 0;
  const currentDef = current ? ACTION_MAP[current] : null;
  const showSave = phase === "over" && isHighScore(score, scores) && !saved;

  return (
    <div className={`stage flash-${flash ?? "none"}`}>
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <header className="marquee">
        <div className="bulbs" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, index) => (
            <span key={index} className={index % 2 ? "on" : "off"} />
          ))}
        </div>
        <div className="brand">
          <Image src="/fart-it-logo.png" alt="" width={72} height={72} />
          <div>
            <p className="eyebrow">family noise toy</p>
            <h1>Fart It!</h1>
          </div>
        </div>
        <div className="bulbs" aria-hidden="true">
          {Array.from({ length: 14 }).map((_, index) => (
            <span key={index} className={index % 2 ? "off" : "on"} />
          ))}
        </div>
      </header>

      <section className="hud" aria-live="polite">
        <div className="meter">
          <span>Score</span>
          <strong>{score}</strong>
        </div>
        <div className="meter">
          <span>Streak</span>
          <strong>{streak}</strong>
        </div>
        <div className="meter">
          <span>Beat</span>
          <strong>{beatLabel(score)}</strong>
        </div>
        <div className="meter">
          <span>Best</span>
          <strong>{Math.max(best, score)}</strong>
        </div>
      </section>

      <div
        className={`toy ${beatOn && phase === "playing" ? "beating" : ""}`}
        style={{
          ["--window" as string]: `${windowMs}ms`,
          ["--beat" as string]: `${beatMs}ms`,
        }}
      >
        <div className="arm arm-x" />
        <div className="arm arm-y" />
        <div className="hub">
          {phase === "playing" && currentDef ? (
            <>
              {armed ? <div key={roundId} className="timer" /> : null}
              <Image src={currentDef.icon} alt="" width={140} height={140} />
              <p>{currentDef.shout}</p>
            </>
          ) : phase === "over" ? (
            <>
              <p className="splat">Splat!</p>
              <span>You scored {score}</span>
            </>
          ) : (
            <>
              <Image src="/fart-it-logo.png" alt="" width={140} height={140} />
              <p>Tap a pad</p>
            </>
          )}
        </div>
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            type="button"
            className={`pad pad-${action.id} slot-${layout[action.id]} ${pressed === action.id ? "smashed" : ""} ${current === action.id && phase === "playing" ? "called" : ""}`}
            onClick={() => void handlePad(action.id)}
            aria-label={action.label}
          >
            <Image src={action.icon} alt="" width={160} height={160} />
            <b>{action.label}</b>
            <small>{SLOT_HINT[layout[action.id]]}</small>
          </button>
        ))}
      </div>

      <footer className="dock">
        {phase === "title" && (
          <>
            <p className="how">
              The hub shouts a move. After you hear it, you always have 2
              seconds. Every 10 hits the music gets faster and the pads swap
              places. The time to press stays the same.
            </p>
            <button
              type="button"
              className="play"
              onClick={() => void startGame()}
            >
              Play
            </button>
          </>
        )}
        {phase === "playing" && (
          <p className="how live">
            {streak > 0 && streak % SPEED_EVERY === 0
              ? "Faster music! Pads swapped!"
              : "Wait for the shout, then match the hub."}
          </p>
        )}
        {phase === "over" && (
          <div className="over">
            {showSave && (
              <form
                className="save"
                onSubmit={(event) => {
                  event.preventDefault();
                  saveScore();
                }}
              >
                <label htmlFor="champ">New high score</label>
                <input
                  id="champ"
                  maxLength={12}
                  placeholder="YOUR NAME"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <button type="submit">Save</button>
              </form>
            )}
            {saved && <p className="how">Saved to the wall of noise.</p>}
            <div className="row">
              <button
                type="button"
                className="play ghost"
                onClick={() => void continueGame()}
              >
                Continue
              </button>
              <button
                type="button"
                className="play"
                onClick={() => void startGame()}
              >
                New game
              </button>
            </div>
          </div>
        )}
        <div className="tools">
          <button
            type="button"
            className="quiet"
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? "Sound off" : "Sound on"}
          </button>
          {scores.length > 0 && (
            <ol className="board">
              {scores.slice(0, 5).map((row) => (
                <li key={`${row.name}-${row.at}`}>
                  <span>{row.name}</span>
                  <b>{row.score}</b>
                </li>
              ))}
            </ol>
          )}
        </div>
      </footer>
    </div>
  );
}
