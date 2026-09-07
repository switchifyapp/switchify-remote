import type { LayoutSurface } from "@/layouts/model";

export type ActionBehavior =
  | { kind: "movement"; dx: number; dy: number }
  | { kind: "click"; button: "left" | "right" | "double" }
  | { kind: "drag" }
  | { kind: "scroll"; dy: number }
  | { kind: "speed"; direction: -1 | 1 }
  | { kind: "monitor"; direction: "left" | "up" | "down" | "right" }
  | { kind: "modifier"; key: string }
  | { kind: "shortcut"; key: string }
  | { kind: "window"; action: string }
  | { kind: "key"; key: string }
  | { kind: "draft"; operation: "clear" | "send" };
export type ActionDefinition = {
  id: string;
  name: string;
  category: string;
  keywords: readonly string[];
  behavior: ActionBehavior;
};
const directions = [
  [-1, -1, "up and left"],
  [0, -1, "up"],
  [1, -1, "up and right"],
  [-1, 0, "left"],
  [1, 0, "right"],
  [-1, 1, "down and left"],
  [0, 1, "down"],
  [1, 1, "down and right"],
] as const;
const windows = [
  ["switchNext", "Next app"],
  ["switchPrevious", "Previous app"],
  ["taskView", "Task view"],
  ["showDesktop", "Show desktop"],
  ["minimizeFocused", "Minimize"],
  ["maximizeFocused", "Maximize"],
  ["closeFocused", "Close window"],
] as const;
export const actionCatalog: readonly ActionDefinition[] = [
  ...directions.map(([dx, dy, direction]): ActionDefinition => ({
    id: `move.${dx + 1}.${dy + 1}`,
    name: `Move pointer ${direction}`,
    category: "Pointer movement",
    keywords: ["mouse", "direction", direction],
    behavior: { kind: "movement", dx, dy },
  })),
  {
    id: "move.1.1",
    name: "Left click",
    category: "Mouse buttons",
    keywords: ["mouse", "click"],
    behavior: { kind: "click", button: "left" },
  },
  {
    id: "click.double",
    name: "Double click",
    category: "Mouse buttons",
    keywords: ["mouse", "click"],
    behavior: { kind: "click", button: "double" },
  },
  {
    id: "click.right",
    name: "Right click",
    category: "Mouse buttons",
    keywords: ["mouse", "context menu"],
    behavior: { kind: "click", button: "right" },
  },
  {
    id: "drag.toggle",
    name: "Start or end drag",
    category: "Mouse buttons",
    keywords: ["mouse", "hold", "release"],
    behavior: { kind: "drag" },
  },
  ...(
    [
      ["up", 5],
      ["down", -5],
    ] as const
  ).map(([direction, dy]): ActionDefinition => ({
    id: `scroll.${direction}`,
    name: `Scroll ${direction}`,
    category: "Scrolling",
    keywords: ["mouse", "wheel", direction],
    behavior: { kind: "scroll", dy },
  })),
  ...(
    [
      ["slower", -1],
      ["faster", 1],
    ] as const
  ).map(([name, direction]): ActionDefinition => ({
    id: `speed.${name}`,
    name: `Pointer ${name}`,
    category: "Pointer speed",
    keywords: ["mouse", "speed", name],
    behavior: { kind: "speed", direction },
  })),
  ...(["left", "up", "down", "right"] as const).map(
    (direction): ActionDefinition => ({
      id: `monitor.${direction}`,
      name: `Move pointer to monitor ${direction}`,
      category: "Monitors",
      keywords: ["display", "screen", direction],
      behavior: { kind: "monitor", direction },
    }),
  ),
  ...["Ctrl", "Alt", "Shift", "Meta"].map((key): ActionDefinition => ({
    id: `modifier.${key}`,
    name: `Hold ${key} modifier`,
    category: "Modifiers",
    keywords: [
      "keyboard",
      key,
      ...(key === "Meta"
        ? ["command", "start", "windows"]
        : key === "Alt"
          ? ["option"]
          : key === "Ctrl"
            ? ["control"]
            : []),
    ],
    behavior: { kind: "modifier", key },
  })),
  ...windows.map(([action, name]): ActionDefinition => ({
    id: `window.${action}`,
    name,
    category: "Windows",
    keywords: ["window", "app", action],
    behavior: { kind: "window", action },
  })),
  ...["A", "C", "V", "X"].map((key): ActionDefinition => ({
    id: `shortcut.${key}`,
    name: `${key} with held modifiers`,
    category: "Shortcuts",
    keywords: ["keyboard", "shortcut", key],
    behavior: { kind: "shortcut", key },
  })),
  ...[
    "Backspace",
    "Enter",
    "Escape",
    "Tab",
    "ArrowLeft",
    "ArrowUp",
    "ArrowDown",
    "ArrowRight",
  ].map((key): ActionDefinition => ({
    id: `key.${key}`,
    name: key.startsWith("Arrow")
      ? `Arrow ${key.slice(5).toLowerCase()} key`
      : `${key} key`,
    category: "PC keys",
    keywords: ["keyboard", key],
    behavior: { kind: "key", key },
  })),
  {
    id: "draft.clear",
    name: "Clear draft",
    category: "Draft text",
    keywords: ["typing", "text", "clear"],
    behavior: { kind: "draft", operation: "clear" },
  },
  {
    id: "draft.send",
    name: "Send draft to PC",
    category: "Draft text",
    keywords: ["typing", "text", "send"],
    behavior: { kind: "draft", operation: "send" },
  },
];
export function getAction(id: string): ActionDefinition | undefined {
  return actionCatalog.find((action) => action.id === id);
}
export function canPlaceAction(id: string, surface: LayoutSurface): boolean {
  const action = getAction(id);
  return !!action && (action.behavior.kind !== "draft" || surface === "typing");
}
export type ActionOption = {
  id: string;
  name: string;
  category: string;
  keywords: readonly string[];
  explanation?: string;
};
export function searchActions(
  options: readonly ActionOption[],
  query: string,
): readonly ActionOption[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => {
    const text = [option.name, option.category, ...option.keywords]
      .join(" ")
      .toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}
