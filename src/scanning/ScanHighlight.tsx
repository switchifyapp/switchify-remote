import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeContext';

const RING = 4;

/** The scan highlight around a control: a thick ring in the text colour, clear on any background. */
export function ScanItemHighlight({ highlighted, groupHighlighted = false, radius }: { highlighted: boolean; groupHighlighted?: boolean; radius: number }) {
  const { colors } = useTheme();
  if (!highlighted && !groupHighlighted) return null;
  return <View
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    style={{
      borderColor: highlighted ? colors.text : colors.brandText,
      borderRadius: radius + 2,
      borderWidth: highlighted ? RING : 2,
      bottom: -2,
      left: -2,
      position: 'absolute',
      right: -2,
      top: -2,
    }}
    testID={highlighted ? 'scan-highlight' : 'scan-group-highlight'}
  />;
}

/** The highlight around a scanned section, and its way out once entered. */
export function ScanGroupHighlight({ highlighted, entered, escapeHighlighted, radius }: { highlighted: boolean; entered: boolean; escapeHighlighted: boolean; radius: number }) {
  const { colors, spacing, typography } = useTheme();
  if (!highlighted && !escapeHighlighted && !entered) return null;
  return <View
    importantForAccessibility="no-hide-descendants"
    pointerEvents="none"
    style={{
      borderColor: highlighted || escapeHighlighted ? colors.text : colors.borderStrong,
      borderRadius: radius,
      borderStyle: highlighted || escapeHighlighted ? 'solid' : 'dashed',
      borderWidth: highlighted || escapeHighlighted ? RING : 2,
      bottom: -spacing.xs,
      left: -spacing.xs,
      position: 'absolute',
      right: -spacing.xs,
      top: -spacing.xs,
    }}
    testID={escapeHighlighted ? 'scan-escape-highlight' : highlighted ? 'scan-section-highlight' : 'scan-section-entered'}
  >
    {escapeHighlighted ? <View style={{ alignItems: 'center', alignSelf: 'flex-end', backgroundColor: colors.text, borderBottomLeftRadius: radius, flexDirection: 'row', gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
      <MaterialIcons color={colors.background} name="undo" size={16} />
      <Text style={[typography.label, { color: colors.background, fontSize: 14 }]}>Leave section</Text>
    </View> : null}
  </View>;
}
