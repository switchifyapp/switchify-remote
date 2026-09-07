import { canPlaceAction } from "@/remote/actions/catalog";
import { computeGridColumns } from "@/components/ResponsiveGrid";
import { type ButtonLayout, type LayoutSurface, validLayout } from "./model";

export type SectionGroup = {
  ids: readonly string[];
  minItemWidth: number;
  maxColumns?: number;
  exactColumns?: number;
  gap?: number;
};
export type SectionDefinition = {
  title: string;
  groups: readonly SectionGroup[];
};
const monitors = ["left", "up", "down", "right"].map(
  (direction) => `monitor.${direction}`,
);
export const sectionDefinitions = {
  mouse: {
    movement: {
      title: "Movement",
      groups: [
        {
          ids: [
            "move.0.0",
            "move.1.0",
            "move.2.0",
            "move.0.1",
            "move.1.1",
            "move.2.1",
            "move.0.2",
            "move.1.2",
            "move.2.2",
          ],
          minItemWidth: 48,
          exactColumns: 3,
          gap: 10,
        },
      ],
    },
    clicks: {
      title: "Clicks and scroll",
      groups: [
        {
          ids: ["click.double", "click.right", "drag.toggle"],
          minItemWidth: 140,
        },
        { ids: ["scroll.up", "scroll.down"], minItemWidth: 140, maxColumns: 2 },
      ],
    },
    speed: {
      title: "Pointer speed",
      groups: [
        {
          ids: ["speed.slower", "speed.faster"],
          minItemWidth: 120,
          maxColumns: 2,
        },
      ],
    },
    monitors: {
      title: "Move to monitor",
      groups: [{ ids: monitors, minItemWidth: 96, maxColumns: 4 }],
    },
  },
  typing: {
    draft: {
      title: "Draft actions",
      groups: [
        {
          ids: ["draft.clear", "draft.send"],
          minItemWidth: 130,
          maxColumns: 2,
        },
      ],
    },
    keys: {
      title: "PC keys",
      groups: [
        {
          ids: [
            "Backspace",
            "Enter",
            "Escape",
            "Tab",
            "ArrowLeft",
            "ArrowUp",
            "ArrowDown",
            "ArrowRight",
          ].map((key) => `key.${key}`),
          minItemWidth: 80,
          maxColumns: 4,
        },
      ],
    },
  },
  window: {
    modifiers: {
      title: "Modifiers",
      groups: [
        {
          ids: ["Ctrl", "Alt", "Shift", "Meta"].map((key) => `modifier.${key}`),
          minItemWidth: 120,
        },
      ],
    },
    windows: {
      title: "Windows",
      groups: [
        {
          ids: [
            "switchNext",
            "switchPrevious",
            "taskView",
            "showDesktop",
            "minimizeFocused",
            "maximizeFocused",
            "closeFocused",
          ].map((action) => `window.${action}`),
          minItemWidth: 130,
        },
      ],
    },
    shortcuts: {
      title: "Shortcuts",
      groups: [
        {
          ids: ["A", "C", "V", "X"].map((key) => `shortcut.${key}`),
          minItemWidth: 96,
        },
      ],
    },
    monitors: {
      title: "Move pointer to monitor",
      groups: [{ ids: monitors, minItemWidth: 96, maxColumns: 4 }],
    },
  },
} satisfies Record<LayoutSurface, Record<string, SectionDefinition>>;

export function getSection(
  surface: LayoutSurface,
  section: string,
): SectionDefinition | undefined {
  const definitions: Record<string, SectionDefinition> =
    sectionDefinitions[surface];
  return Object.hasOwn(definitions, section) ? definitions[section] : undefined;
}
export function validSectionLayout(
  surface: LayoutSurface,
  section: string,
  value: unknown,
): value is ButtonLayout {
  const definition = getSection(surface, section);
  if (!definition || !validLayout(value)) return false;
  return value.cells.every((id) => id === null || canPlaceAction(id, surface));
}

/** Capture responsive row boundaries; shorter rows retain explicit empty cells. */
export function sectionDefault(
  definition: SectionDefinition,
  width: number,
  fontScale: number,
  gap: number,
): ButtonLayout {
  const groups = definition.groups.map((group) => ({
    group,
    columns:
      group.exactColumns ??
      computeGridColumns(
        width,
        group.minItemWidth,
        group.gap ?? gap,
        fontScale,
        Math.min(4, group.maxColumns ?? group.ids.length),
      ),
  }));
  const columns = Math.max(...groups.map((group) => group.columns));
  const cells: (string | null)[] = [];
  for (const { group, columns: groupColumns } of groups) {
    for (let i = 0; i < group.ids.length; i += groupColumns) {
      const row: (string | null)[] = group.ids.slice(i, i + groupColumns);
      while (row.length < columns) row.push(null);
      cells.push(...row);
    }
  }
  return { columns, cells };
}
