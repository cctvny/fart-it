export type HighScore = {
  name: string;
  score: number;
  at: string;
};

const KEY = "fart-it-high-scores-v1";
const LIMIT = 8;
const EMPTY_SCORES: HighScore[] = [];

let cachedRaw: string | null | undefined;
let cachedScores: HighScore[] = EMPTY_SCORES;

export function loadHighScores(): HighScore[] {
  if (typeof window === "undefined") return EMPTY_SCORES;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedScores;
    cachedRaw = raw;
    if (!raw) {
      cachedScores = EMPTY_SCORES;
      return cachedScores;
    }
    const parsed = JSON.parse(raw) as HighScore[];
    cachedScores = parsed
      .filter(
        (row) =>
          typeof row?.name === "string" && typeof row?.score === "number",
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, LIMIT);
    return cachedScores;
  } catch {
    cachedScores = EMPTY_SCORES;
    return cachedScores;
  }
}

export function getServerScores() {
  return EMPTY_SCORES;
}

export function isHighScore(score: number, scores = loadHighScores()) {
  if (score <= 0) return false;
  if (scores.length < LIMIT) return true;
  return score > scores[scores.length - 1].score;
}

export function saveHighScore(name: string, score: number): HighScore[] {
  const cleanName = name.trim().slice(0, 12) || "CHAMP";
  const next = [
    ...loadHighScores(),
    { name: cleanName.toUpperCase(), score, at: new Date().toISOString() },
  ]
    .sort((a, b) => b.score - a.score)
    .slice(0, LIMIT);
  const raw = JSON.stringify(next);
  window.localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cachedScores = next;
  window.dispatchEvent(new Event("fart-it-scores"));
  return next;
}

export function subscribeHighScores(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("fart-it-scores", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("fart-it-scores", callback);
  };
}
