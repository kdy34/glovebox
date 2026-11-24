// Bottom sheet modal using react-native built-ins (Modal + Animated). No extra libraries.
// Respects Reduce Motion: transitions are instant when the user has it enabled.
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, useWindowDimensions, View, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Text } from './Text';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Maximum fraction of the screen height the sheet may occupy. Default 0.9. */
  maxHeightFraction?: number;
}

export function Sheet({ visible, onClose, title, children, maxHeightFraction = 0.9 }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const [translateY] = useState(() => new Animated.Value(screenHeight));

  const animate = (toValue: number, cb?: () => void) => {
    // Respect Reduce Motion: skip animation entirely.
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        translateY.setValue(toValue);
        cb?.();
      } else {
        Animated.spring(translateY, {
          toValue,
          useNativeDriver: true,
          damping: 25,
          stiffness: 200,
        }).start(cb);
      }
    }).catch(() => {
      translateY.setValue(toValue);
      cb?.();
    });
  };

  useEffect(() => {
    if (visible) {
      translateY.setValue(screenHeight);
      animate(0);
    } else {
      animate(screenHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      accessibilityViewIsModal
      statusBarTranslucent
    >
      {/* Overlay */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityHint="Closes this sheet"
      >
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.colors.overlay }]} />
      </Pressable>

      {/* Sheet */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          maxHeight: screenHeight * maxHeightFraction,
          backgroundColor: t.colors.surface,
          borderTopLeftRadius: t.radius.xl,
          borderTopRightRadius: t.radius.xl,
          paddingBottom: insets.bottom + t.spacing.lg,
          transform: [{ translateY }],
          // Shadow
          shadowColor: '#0F1B2D',
          shadowOpacity: 0.2,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: -4 },
          elevation: 16,
        }}
        accessibilityViewIsModal
      >
        {/* Handle */}
        <View style={{ alignItems: 'center', paddingTop: t.spacing.sm }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.colors.border }} />
        </View>

        {/* Title row */}
        {title ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: t.spacing.lg,
              paddingTop: t.spacing.md,
              paddingBottom: t.spacing.sm,
            }}
          >
            <Text variant="headline" center>{title}</Text>
          </View>
        ) : (
          <View style={{ height: t.spacing.sm }} />
        )}

        {children}
      </Animated.View>
    </Modal>
  );
}
