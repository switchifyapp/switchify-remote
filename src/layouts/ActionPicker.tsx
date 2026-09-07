import { useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ActionButton } from "@/components/ActionButton";
import { focusAccessibilityTarget } from "@/components/accessibilityFocus";
import { useTheme } from "@/theme/ThemeContext";
import { searchActions, type ActionOption } from "@/remote/actions/catalog";

/** Render within the editor's native modal, so iOS never stacks native modals. */
type ActionPickerProps = {
  row: number;
  column: number;
  options: readonly ActionOption[];
  onSelect(id: string): void;
  onClose(): void;
};
export function ActionPicker(props: ActionPickerProps) {
  // Native modals can rotate independently of the presenting screen on iOS.
  return (
    <SafeAreaProvider
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
    >
      <ActionPickerContent {...props} />
    </SafeAreaProvider>
  );
}
function ActionPickerContent({
  row,
  column,
  options,
  onSelect,
  onClose,
}: ActionPickerProps) {
  const { colors, radii, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const heading = useRef<View>(null);
  const focused = useRef(false);
  const choosing = useRef(false);
  const filtered = useMemo(
    () => searchActions(options, query),
    [options, query],
  );
  const groups = useMemo(
    () =>
      Array.from(new Set(filtered.map((option) => option.category))).map(
        (category) => ({
          category,
          options: filtered.filter((option) => option.category === category),
        }),
      ),
    [filtered],
  );
  return (
    <KeyboardAvoidingView
      testID="action-picker-overlay"
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: spacing.md,
          paddingTop: Math.max(insets.top, spacing.md),
          paddingBottom: Math.max(insets.bottom, spacing.md),
        }}
      >
        <Pressable
          testID="action-picker-scrim"
          accessible={false}
          importantForAccessibility="no"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "rgba(0, 0, 0, 0.58)",
          }}
        />
        <View
          testID="action-picker-dialog"
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radii.lg,
            maxHeight: "90%",
            maxWidth: 560,
            width: "100%",
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <ScrollView
            testID="action-picker-results"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: spacing.sm }}
          >
            <View
              ref={heading}
              accessible
              accessibilityRole="header"
              onLayout={() => {
                if (!focused.current) {
                  focused.current = true;
                  focusAccessibilityTarget(heading.current);
                }
              }}
            >
              <AppText variant="heading">Choose action</AppText>
            </View>
            <AppText muted>
              Row {row}, column {column}
            </AppText>
            <TextInput
              accessibilityLabel="Search actions"
              placeholder="Search actions"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              disableFullscreenUI
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[
                typography.body,
                {
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: radii.md,
                  color: colors.text,
                  backgroundColor: colors.surfaceRaised,
                  padding: spacing.sm,
                },
              ]}
            />
            {groups.map((group) => (
              <View key={group.category} style={{ gap: spacing.sm }}>
                <AppText accessibilityRole="header" variant="label" muted>
                  {group.category}
                </AppText>
                {group.options.map((option) => (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityLabel={option.name}
                    accessibilityHint={
                      option.explanation
                        ? `${option.explanation} You can still add this action.`
                        : "Assigns this action to the cell."
                    }
                    onPress={() => {
                      if (choosing.current) return;
                      choosing.current = true;
                      onSelect(option.id);
                    }}
                    style={({ pressed }) => ({
                      minHeight: 48,
                      borderRadius: radii.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: pressed
                        ? colors.surfacePressed
                        : colors.surfaceRaised,
                      padding: spacing.md,
                      gap: spacing.xs,
                    })}
                  >
                    <AppText variant="label">{option.name}</AppText>
                    {option.explanation ? (
                      <AppText muted variant="caption">
                        {option.explanation}
                      </AppText>
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ))}
            {!filtered.length ? (
              <AppText accessibilityLiveRegion="polite">
                {options.length
                  ? "No actions match your search."
                  : "All available actions are already in this section."}
              </AppText>
            ) : null}
            <ActionButton
              label="Close"
              icon="close"
              tone="secondary"
              onPress={onClose}
            />
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
