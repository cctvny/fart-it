export type ActionId = "fart" | "burp" | "vomit" | "sneeze";
export type PadSlot = "top" | "right" | "bottom" | "left";
export type PadLayout = Record<ActionId, PadSlot>;

export type ActionDef = {
  id: ActionId;
  label: string;
  shout: string;
  icon: string;
  hint: string;
  key: string;
  position: PadSlot;
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

export const PAD_SLOTS: PadSlot[] = ["top", "right", "bottom", "left"];

export const DEFAULT_LAYOUT: PadLayout = {
  fart: "top",
  vomit: "right",
  sneeze: "bottom",
  burp: "left",
};

export const SLOT_HINT: Record<PadSlot, string> = {
  top: "W / Up",
  right: "D / Right",
  bottom: "S / Down",
  left: "A / Left",
};

export const SLOT_KEYS: Record<string, PadSlot> = {
  w: "top",
  arrowup: "top",
  d: "right",
  arrowright: "right",
  s: "bottom",
  arrowdown: "bottom",
  a: "left",
  arrowleft: "left",
};

export function actionAtSlot(layout: PadLayout, slot: PadSlot): ActionId {
  const match = ACTIONS.find((action) => layout[action.id] === slot);
  return match?.id ?? "fart";
}

export function shufflePadLayout(current: PadLayout): PadLayout {
  const ids = ACTIONS.map((action) => action.id);
  let next: PadLayout = current;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const slots = [...PAD_SLOTS];
    for (let i = slots.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = slots[i];
      slots[i] = slots[j];
      slots[j] = swap;
    }
    next = Object.fromEntries(
      ids.map((id, index) => [id, slots[index]]),
    ) as PadLayout;
    const moved = ids.filter((id) => next[id] !== current[id]).length;
    if (moved >= 3) return next;
  }
  return next;
}

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
