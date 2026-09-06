export type ActionId = "fart" | "burp" | "pick" | "sneeze";

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
    id: "pick",
    label: "Pick It",
    shout: "Pick it!",
    icon: "/pick-it-icon.png",
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

export const START_WINDOW_MS = 3000;
export const MIN_WINDOW_MS = 1800;
export const SPEED_EVERY = 10;
export const SPEED_STEP_MS = 200;

export function windowForCorrect(correctCount: number) {
  const steps = Math.floor(correctCount / SPEED_EVERY);
  return Math.max(MIN_WINDOW_MS, START_WINDOW_MS - steps * SPEED_STEP_MS);
}

export function nextAction(previous: ActionId | null): ActionId {
  const ids = ACTIONS.map((action) => action.id);
  if (!previous) {
    return ids[Math.floor(Math.random() * ids.length)];
  }
  const others = ids.filter((id) => id !== previous);
  return others[Math.floor(Math.random() * others.length)];
}
