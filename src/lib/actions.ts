export type ActionId = "fart" | "burp" | "vomit" | "sneeze";

export type ActionDef = {
  id: ActionId;
  label: string;
  shout: string;
  icon: string;
  hint: string;
  key: string;
  position: "top" | "right" | "bottom" | "left";
};

export const ACTIONS: ActionDef[] = [
  {
    id: "fart",
    label: "Fart It",
    shout: "Fart it!",
    icon: "/fart-it-icon.png",
    hint: "W / Up",
    key: "top",
    position: "top",
  },
  {
    id: "vomit",
    label: "Vomit It",
    shout: "Vomit it!",
    icon: "/vomit-it-icon.png",
    hint: "D / Right",
    key: "right",
    position: "right",
  },
  {
    id: "sneeze",
    label: "Sneeze It",
    shout: "Sneeze it!",
    icon: "/sneeze-it-icon.png",
    hint: "S / Down",
    key: "bottom",
    position: "bottom",
  },
  {
    id: "burp",
    label: "Burp It",
    shout: "Burp it!",
    icon: "/burp-it-icon.png",
    hint: "A / Left",
    key: "left",
    position: "left",
  },
];

export const ACTION_MAP = Object.fromEntries(
  ACTIONS.map((action) => [action.id, action]),
) as Record<ActionId, ActionDef>;

export const PRESS_WINDOW_MS = 2000;
export const SPEED_EVERY = 10;
export const MAX_MUSIC_LEVEL = 5;

export function musicLevel(correctCount: number) {
  return Math.min(MAX_MUSIC_LEVEL, Math.floor(correctCount / SPEED_EVERY));
}

export function beatIntervalMs(correctCount: number) {
  const level = musicLevel(correctCount);
  return Math.max(180, 500 - level * 64);
}

export function beatLabel(correctCount: number) {
  return `${musicLevel(correctCount) + 1}x`;
}

export function nextAction(previous: ActionId | null): ActionId {
  const ids = ACTIONS.map((action) => action.id);
  if (!previous) {
    return ids[Math.floor(Math.random() * ids.length)];
  }
  const others = ids.filter((id) => id !== previous);
  return others[Math.floor(Math.random() * others.length)];
}
