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
  SPEED_EVERY,
  START_WINDOW_MS,
  nextAction,
  windowForCorrect,
  type ActionId,
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
  const [windowMs, setWindowMs] = useState(START_WINDOW_MS);
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

  const audioRef = useRef<GameAudio | null>(null);
  const acceptingRef = useRef(false);
  const currentRef = useRef<ActionId | null>(null);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const phaseRef = useRef<Phase>("title");
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
    audio().setMuted(muted);
  }, [audio, muted]);

  useEffect(() => {
    return () => {
      clearRoundTimer();
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
    };
  }, []);

  const endGame = useCallback(() => {
    const missed = currentRef.current;
    const level = noiseLevel(scoreRef.current);
    clearRoundTimer();
    acceptingRef.current = false;
    currentRef.current = null;
    setCurrent(null);
    setBeatOn(false);
    setPhase("over");
    setFlash("bad");
    audio().playMiss(missed, level);
  }, [audio]);

  const launchRound = useCallback(
    (previous: ActionId | null, correctSoFar: number) => {
      const action = nextAction(previous);
      const nextWindow = windowForCorrect(correctSoFar);
      currentRef.current = action;
      acceptingRef.current = true;
      setCurrent(action);
      setWindowMs(nextWindow);
      setRoundId((id) => id + 1);
      setBeatOn(true);
      setFlash(null);
      audio().announce(action);
      audio().playBeat(nextWindow);
      clearRoundTimer();
      roundTimer.current = window.setTimeout(() => {
        if (!acceptingRef.current) return;
        if (phaseRef.current !== "playing") return;
        endGame();
      }, nextWindow);
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
    setWindowMs(START_WINDOW_MS);
    setPhase("playing");
    phaseRef.current = "playing";
    launchRound(null, 0);
  }, [audio, launchRound]);

  const continueGame = useCallback(async () => {
    await audio().unlock();
    audio().cancelMissLine();
    setSaved(false);
    setFlash(null);
    setStreak(0);
    streakRef.current = 0;
    setPhase("playing");
    phaseRef.current = "playing";
    launchRound(null, scoreRef.current);
  }, [audio, launchRound]);

  const handlePad = useCallback(
    async (id: ActionId) => {
      await audio().unlock();
      setPressed(id);
      if (pressTimer.current) window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => setPressed(null), 160);

      const freePlay = phaseRef.current !== "playing" || !acceptingRef.current;
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
        windowForCorrect(nextScore) < windowForCorrect(nextScore - 1);
      if (spedUp) {
        setFlash("faster");
        audio().playFaster();
      }

      window.setTimeout(
        () => {
          if (phaseRef.current !== "playing") return;
          launchRound(id, nextScore);
        },
        spedUp ? 420 : 220,
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
      const map: Record<string, ActionId> = {
        w: "fart",
        arrowup: "fart",
        d: "pick",
        arrowright: "pick",
        s: "sneeze",
        arrowdown: "sneeze",
        a: "burp",
        arrowleft: "burp",
      };
      const action = map[key];
      if (action) {
        event.preventDefault();
        void handlePad(action);
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
          <strong>{(windowMs / 1000).toFixed(1)}s</strong>
        </div>
        <div className="meter">
          <span>Best</span>
          <strong>{Math.max(best, score)}</strong>
        </div>
      </section>

      <div
        className={`toy ${beatOn && phase === "playing" ? "beating" : ""}`}
        style={{ ["--window" as string]: `${windowMs}ms` }}
      >
        <div className="arm arm-x" />
        <div className="arm arm-y" />
        <div className="hub">
          {phase === "playing" && currentDef ? (
            <>
              <div key={roundId} className="timer" />
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
            className={`pad pad-${action.position} ${pressed === action.id ? "smashed" : ""} ${current === action.id && phase === "playing" ? "called" : ""}`}
            onClick={() => void handlePad(action.id)}
            aria-label={action.label}
          >
            <Image src={action.icon} alt="" width={160} height={160} />
            <b>{action.label}</b>
            <small>{action.hint}</small>
          </button>
        ))}
      </div>

      <footer className="dock">
        {phase === "title" && (
          <>
            <p className="how">
              The hub shouts a move. Smash that pad before the beat runs out.
              Start at 2 seconds. Every 10 hits, it gets quicker. It never goes
              faster than 1 second.
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
              ? "Faster beat!"
              : "Match the hub. Four pads. One shot."}
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
