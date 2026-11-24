// Toast notification system. Provides a ToastProvider and useToast hook.
// Toasts appear at the top of the screen, stack up to 3, auto-dismiss.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { Text } from './Text';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone, durationMs?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const t = useTheme();
  const [opacity] = useState(() => new Animated.Value(0));

  const bg: Record<ToastTone, string> = {
    info: t.colors.surface,
    success: t.dark ? '#163A2A' : '#E3F4EC',
    warning: t.dark ? '#3A2E10' : '#FFF3CD',
    error: t.dark ? '#3D1A1A' : '#FBE6E6',
  };
  const fg = { info: 'text', success: 'successText', warning: 'warningText', error: 'dangerText' } as const;

  // Fade in on mount
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => onDismiss(toast.id));
  };

  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        onPress={dismiss}
        accessibilityRole="alert"
        accessibilityLabel={toast.message}
        style={{
          backgroundColor: bg[toast.tone],
          borderRadius: t.radius.md,
          paddingHorizontal: t.spacing.md,
          paddingVertical: t.spacing.sm,
          borderWidth: 1,
          borderColor: t.colors.border,
          shadowColor: '#0F1B2D',
          shadowOpacity: 0.12,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
          marginBottom: t.spacing.xs,
        }}
      >
        <Text variant="callout" color={fg[toast.tone]}>{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const insets = useSafeAreaInsets();
  const t = useTheme();

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const show = useCallback((message: string, tone: ToastTone = 'info', durationMs = 3500) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => {
      const next = [...prev.slice(-2), { id, message, tone }]; // keep last 3
      return next;
    });
    const timer = setTimeout(() => dismiss(id), durationMs);
    timers.current.set(id, timer);
  }, [dismiss]);

  const topOffset = insets.top + (Platform.OS === 'android' ? t.spacing.md : 0);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View
        pointerEvents="box-none"
        style={[
          StyleSheet.absoluteFill,
          {
            top: topOffset,
            paddingHorizontal: t.spacing.lg,
            alignItems: 'stretch',
            justifyContent: 'flex-start',
          },
        ]}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
