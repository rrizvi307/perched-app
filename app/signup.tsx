import { ThemedView } from '@/components/themed-view';
import { SignupFormSections } from '@/components/auth/signup-form-sections';
import { Atmosphere } from '@/components/ui/atmosphere';
import { tokens } from '@/constants/tokens';
import { Body, H1 } from '@/components/ui/typography';
import { useSignupController } from '@/domains/auth/useSignupController';
import { useKeyboardHeight, useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useThemeColor } from '@/hooks/use-theme-color';
import Logo from '@/components/logo';
import { useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignUp() {
  const insets = useSafeAreaInsets();
  // iOS can force the strong-password sheet over these fields during signup.
  const manualPasswordEntryProps =
    Platform.OS === 'ios'
      ? ({ textContentType: 'oneTimeCode', autoComplete: 'off' } as const)
      : ({ autoComplete: 'off', importantForAutofill: 'no' } as const);

  const color = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const fieldLabelStyle = { color, opacity: 1, marginBottom: 6 } as const;
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const muted = useThemeColor({}, 'muted');
  const router = useRouter();
  const controller = useSignupController();

  const { height } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const keyboardHeight = useKeyboardHeight();
  const compactHeader = keyboardVisible && Platform.OS !== 'web';
  const logoSize = compactHeader ? 44 : height < 740 ? 56 : 72;
  const titleSize = compactHeader ? 30 : height < 740 ? 36 : undefined;
  const extraScrollPad = Platform.OS === 'ios' ? Math.max(28, keyboardHeight + 28) : 28;
  return (
    <ThemedView testID="signup-screen" style={styles.container}>
      <Atmosphere />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(tokens.space.s20, insets.top + tokens.space.s16),
              paddingBottom: insets.bottom + extraScrollPad,
              flexGrow: 1,
            },
          ]}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ width: '100%', alignItems: 'center' }}>
            <Logo size={logoSize} variant="mark" label="Perched" />
            <H1
              style={{
                color,
                marginTop: tokens.space.s10,
                ...(titleSize
                  ? { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) }
                  : null),
              }}
            >
              Create account
            </H1>
          </View>
          {!compactHeader ? (
            <Body style={{ color, marginTop: tokens.space.s8, marginBottom: tokens.space.s4 }}>
              Sign up with your email to get started.
            </Body>
          ) : null}

          <View style={{ height: tokens.space.s16 }} />
          <SignupFormSections
            controller={controller}
            fieldLabelStyle={fieldLabelStyle}
            manualPasswordEntryProps={manualPasswordEntryProps}
            onPressPrivacy={() => router.push('/privacy')}
            onPressSignIn={() => router.push('/signin')}
            onPressTerms={() => router.push('/terms')}
            palette={{
              card,
              color,
              danger,
              muted,
              primary,
              success,
              surfaceBorder: border,
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  scroll: { paddingHorizontal: tokens.space.s20 },
});
