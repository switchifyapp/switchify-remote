import type { ComponentProps } from "react";
import type { ControlButton } from "@/components/ControlButton";
import { commandPayloads } from "@/domain/protocol/commands";
import type { PcPlatform } from "@/domain/protocol/types";
import type { LayoutSurface } from "@/layouts/model";
import { preferencesStore, type TypingMode } from "@/storage/PreferencesStore";
import type { RemoteSession } from "../RemoteSession";
import {
  actionCatalog,
  canPlaceAction,
  type ActionDefinition,
  type ActionOption,
} from "./catalog";

export type ActionContext = {
  surface: LayoutSurface;
  session: RemoteSession;
  platform: PcPlatform;
  typing?: {
    mode: TypingMode;
    draft: string;
    submitting: boolean;
    submitLive(): Promise<void>;
  };
};
export type ResolvedAction = ComponentProps<typeof ControlButton> & {
  id: string;
  option: ActionOption;
};
type Presentation = Omit<ResolvedAction, "id" | "onPress" | "option">;
const unsupported = "Not supported by this PC.";
function modifierLabel(key: string, platform: PcPlatform): string {
  if (platform === "macos")
    return (
      (
        {
          Ctrl: "Control",
          Alt: "Option",
          Shift: "Shift",
          Meta: "Command",
        } as Record<string, string>
      )[key] ?? key
    );
  return key === "Meta" ? "Start" : key;
}
function availability(
  action: ActionDefinition,
  context: ActionContext,
): string | undefined {
  const { session, typing } = context;
  const state = session.snapshot();
  const behavior = action.behavior;
  const supported = (command: string) =>
    session.supports(command) ? undefined : unsupported;
  if (!canPlaceAction(action.id, context.surface))
    return "Available only in Typing.";
  switch (behavior.kind) {
    case "movement":
      return supported("mouse.move");
    case "click":
      return supported(
        behavior.button === "double"
          ? "mouse.doubleClick"
          : behavior.button === "right"
            ? "mouse.rightClick"
            : "mouse.click",
      );
    case "drag":
      return supported(state.dragging ? "mouse.dragEnd" : "mouse.dragStart");
    case "scroll":
      return supported("mouse.scroll");
    case "speed": {
      const speed = session.profile?.capabilities.pointerSpeed;
      if (
        !speed?.supported ||
        !speed.setSupported ||
        !session.supports("pointer.speed.set")
      )
        return unsupported;
      if (behavior.direction < 0 && speed.scalePercent <= speed.minScalePercent)
        return "Pointer speed is already at its minimum.";
      if (behavior.direction > 0 && speed.scalePercent >= speed.maxScalePercent)
        return "Pointer speed is already at its maximum.";
      return undefined;
    }
    case "monitor":
      return session.profile?.capabilities.displayNavigation.supported &&
        session.profile.capabilities.displayNavigation.displayCount > 1
        ? supported("pointer.display.move")
        : "Requires a PC with multiple monitors.";
    case "modifier":
      return supported(
        state.modifiers.includes(behavior.key)
          ? "keyboard.modifierUp"
          : "keyboard.modifierDown",
      );
    case "shortcut":
      return supported("keyboard.shortcut");
    case "window":
      return supported("window.control");
    case "key":
      if (context.surface === "typing" && typing?.mode === "live") {
        if (
          !session.supportsAll(
            "keyboard.textStream.open",
            "keyboard.textStream.chunk",
            "keyboard.textStream.key",
            "keyboard.textStream.close",
          )
        )
          return unsupported;
        return typing.submitting && behavior.key === "Enter"
          ? "Wait for Enter to finish sending."
          : undefined;
      }
      return supported("keyboard.key");
    case "draft":
      if (!typing || typing.mode !== "draft")
        return "Switch to Write a draft to use this action.";
      if (!typing.draft) return "The draft is empty.";
      return behavior.operation === "send"
        ? supported("keyboard.typeText")
        : undefined;
  }
}
function presentation(
  action: ActionDefinition,
  context: ActionContext,
): Presentation {
  const behavior = action.behavior;
  const state = context.session.snapshot();
  switch (behavior.kind) {
    case "movement": {
      const arrows = [
        ["↖", "↑", "↗"],
        ["←", "", "→"],
        ["↙", "↓", "↘"],
      ];
      return {
        label: arrows[behavior.dy + 1]![behavior.dx + 1]!,
        accessibilityLabel: action.name.replace("pointer ", ""),
        size: "key",
      };
    }
    case "click":
      return behavior.button === "left"
        ? {
            label: "Click",
            accessibilityLabel: "Left click",
            size: "key",
            emphasized: true,
          }
        : {
            label: action.name,
            icon: behavior.button === "double" ? "ads-click" : "mouse",
          };
    case "drag":
      return {
        label: state.dragging ? "End drag" : "Start drag",
        icon: "pan-tool",
        selected: state.dragging,
      };
    case "scroll":
      return {
        label: action.name,
        icon: behavior.dy > 0 ? "arrow-upward" : "arrow-downward",
      };
    case "speed":
      return {
        label: behavior.direction < 0 ? "Slower" : "Faster",
        icon: behavior.direction < 0 ? "remove" : "add",
      };
    case "monitor":
      return {
        label:
          behavior.direction[0]!.toUpperCase() + behavior.direction.slice(1),
        accessibilityLabel: action.name,
      };
    case "modifier":
      return {
        label: modifierLabel(behavior.key, context.platform),
        selected: state.modifiers.includes(behavior.key),
      };
    case "shortcut":
      return {
        label: [
          ...state.modifiers.map((key) => modifierLabel(key, context.platform)),
          behavior.key,
        ].join("+"),
      };
    case "window":
      return {
        label: behavior.action === "closeFocused" ? "Close" : action.name,
        ...(behavior.action === "closeFocused"
          ? { danger: true, icon: "warning" as const }
          : {}),
      };
    case "key":
      return { label: behavior.key.replace("Arrow", ""), size: "key" };
    case "draft":
      return { label: behavior.operation === "clear" ? "Clear" : "Send to PC" };
  }
}
/** Execution is shared by default and customized buttons; pickers never receive it. */
export async function executeAction(
  action: ActionDefinition,
  context: ActionContext,
): Promise<void> {
  if (availability(action, context)) return;
  const { session, typing } = context;
  const behavior = action.behavior;
  switch (behavior.kind) {
    case "movement": {
      const profile = session.profile;
      const step = Math.max(
        1,
        Math.min(
          profile?.maxDelta ?? 128,
          profile?.capabilities.pointerSpeed.baseMoveDelta ??
            profile?.recommendedDeltas.medium ??
            128,
        ),
      );
      await session.mouse(
        "mouse.move",
        { dx: behavior.dx * step, dy: behavior.dy * step },
        true,
      );
      return;
    }
    case "click": {
      const [type, payload] =
        behavior.button === "left"
          ? commandPayloads.click()
          : behavior.button === "right"
            ? commandPayloads.rightClick()
            : commandPayloads.doubleClick();
      await session.command(type, payload);
      return;
    }
    case "drag":
      await session.toggleDrag();
      return;
    case "scroll":
      await session.mouse("mouse.scroll", { dx: 0, dy: behavior.dy }, true);
      return;
    case "speed": {
      const speed = session.profile!.capabilities.pointerSpeed;
      const [type, payload] = commandPayloads.pointerSpeed(
        Math.max(
          speed.minScalePercent,
          Math.min(
            speed.maxScalePercent,
            speed.scalePercent + behavior.direction * speed.stepPercent,
          ),
        ),
      );
      await session.command(type, payload);
      return;
    }
    case "monitor": {
      const [type, payload] = commandPayloads.displayMove(behavior.direction);
      await session.command(type, payload);
      return;
    }
    case "modifier":
      await session.toggleModifier(behavior.key);
      return;
    case "shortcut":
      await session.shortcut(behavior.key);
      return;
    case "window": {
      const [type, payload] = commandPayloads.windowControl(behavior.action);
      await session.command(type, payload);
      return;
    }
    case "key":
      if (context.surface === "typing" && typing?.mode === "live") {
        if (behavior.key === "Enter") await typing.submitLive();
        else await session.streamKey(behavior.key);
      } else {
        // Live typing keeps the stream path so chunk sequencing is preserved;
        // everywhere else the session decides between repeating and one press.
        await session.key(behavior.key);
      }
      return;
    case "draft":
      if (behavior.operation === "clear")
        await preferencesStore.update({ draft: "" });
      else if (typing) {
        const text = typing.draft;
        const [type, payload] = commandPayloads.typeText(text);
        if (
          (await session.command(type, payload)) &&
          preferencesStore.snapshot().draft === text
        )
          await preferencesStore.update({ draft: "" });
      }
  }
}
export function resolveActions(
  context: ActionContext,
  currentContext: () => ActionContext = () => context,
): ResolvedAction[] {
  return actionCatalog
    .filter((action) => canPlaceAction(action.id, context.surface))
    .map((action) => {
      const explanation = availability(action, context);
      const name =
        action.behavior.kind === "modifier"
          ? `Hold ${modifierLabel(action.behavior.key, context.platform)} modifier`
          : action.name;
      return {
        id: action.id,
        ...presentation(action, context),
        disabled: !!explanation,
        option: {
          id: action.id,
          name,
          category: action.category,
          keywords: action.keywords,
          ...(explanation ? { explanation } : {}),
        },
        onPress: () => {
          void executeAction(action, currentContext()).catch(() => undefined);
        },
      };
    });
}
