import { Label } from '@/components/ui/typography';
import { tokens } from '@/constants/tokens';
import type { useSignupController } from '@/domains/auth/useSignupController';
import { withAlpha } from '@/utils/colors';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle } from 'react-native';

type SignupController = ReturnType<typeof useSignupController>;

type SignupPalette = {
  card: string;
  color: string;
  danger: string;
  muted: string;
  primary: string;
  success: string;
  surfaceBorder: string;
};

type SignupFormSectionsProps = {
  controller: SignupController;
  fieldLabelStyle: StyleProp<TextStyle>;
  manualPasswordEntryProps: Pick<
    TextInputProps,
    'autoComplete' | 'importantForAutofill' | 'textContentType'
  >;
  onPressPrivacy: () => void;
  onPressSignIn: () => void;
  onPressTerms: () => void;
  palette: SignupPalette;
};

type SignupSuggestionListProps = {
  borderColor: string;
  color: string;
  emptyText: string;
  highlight: string;
  muted: string;
  onSelect: (option: string) => void;
  options: string[];
};

export function SignupFormSections({
  controller,
  fieldLabelStyle,
  manualPasswordEntryProps,
  onPressPrivacy,
  onPressSignIn,
  onPressTerms,
  palette,
}: SignupFormSectionsProps) {
  const {
    authError,
    canCheckHandleAvailability,
    canSubmit,
    campus,
    campusDropdownOpen,
    campusLoading,
    campusOptions,
    campusQuery,
    city,
    cityDropdownOpen,
    cityLoading,
    cityOptions,
    cityQuery,
    detectingCity,
    email,
    fbAvailable,
    geoBias,
    handle,
    handleAvailability,
    isCityValid,
    isEmailValid,
    launchMarketHint,
    launchMarketNotice,
    loading,
    name,
    normalizedHandle,
    onCampusChange,
    onCampusFocus,
    onCityChange,
    onCityFocus,
    onHandleChange,
    password,
    passwordConfirm,
    phone,
    selectCampusOption,
    selectCityOption,
    setEmail,
    setName,
    setPassword,
    setPasswordConfirm,
    setPhone,
    submit,
    applyCurrentCity,
  } = controller;

  const { card, color, danger, muted, primary, success, surfaceBorder } = palette;
  const highlight = withAlpha(primary, 0.1);

  return (
    <>
      {!fbAvailable ? (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: withAlpha(primary, 0.08),
              borderColor: withAlpha(primary, 0.24),
            },
          ]}
        >
          <Text style={{ color: primary, fontWeight: '600' }}>
            Server auth not configured - account will save locally
          </Text>
        </View>
      ) : null}

      <Label style={fieldLabelStyle}>Email</Label>
      <TextInput
        testID="signup-email-input"
        accessibilityLabel="Email address"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="you@email.com"
        placeholderTextColor={muted}
        style={[styles.input, { borderColor: surfaceBorder, backgroundColor: card, color }]}
        value={email}
      />
      {email.trim().length > 0 && !isEmailValid ? (
        <Text style={[styles.hint, { color: danger }]}>Enter a valid email address.</Text>
      ) : null}

      <Label style={fieldLabelStyle}>Password</Label>
      <TextInput
        testID="signup-password-input"
        accessibilityLabel="Password"
        onChangeText={setPassword}
        placeholder="At least 6 characters"
        placeholderTextColor={muted}
        secureTextEntry
        style={[styles.input, { borderColor: surfaceBorder, backgroundColor: card, color }]}
        value={password}
        {...manualPasswordEntryProps}
      />
      {password.length > 0 && password.length < 6 ? (
        <Text style={[styles.hint, { color: danger }]}>Use at least 6 characters.</Text>
      ) : (
        <Text style={[styles.hint, { color: muted }]}>Min 6 characters.</Text>
      )}

      <Label style={fieldLabelStyle}>Confirm password</Label>
      <TextInput
        testID="signup-password-confirm-input"
        accessibilityLabel="Confirm password"
        onChangeText={setPasswordConfirm}
        placeholder="Re-enter your password"
        placeholderTextColor={muted}
        secureTextEntry
        style={[
          styles.input,
          {
            borderColor:
              passwordConfirm.length > 0 && password !== passwordConfirm ? danger : surfaceBorder,
            backgroundColor: card,
            color,
          },
        ]}
        value={passwordConfirm}
        {...manualPasswordEntryProps}
      />
      {passwordConfirm.length > 0 && password !== passwordConfirm ? (
        <Text style={[styles.hint, { color: danger }]}>Passwords don&apos;t match.</Text>
      ) : passwordConfirm.length > 0 && password === passwordConfirm ? (
        <Text style={[styles.hint, { color: success }]}>Passwords match.</Text>
      ) : null}

      <Label style={fieldLabelStyle}>Username</Label>
      <View
        style={[
          styles.handleRow,
          {
            borderColor:
              handleAvailability === 'available'
                ? success
                : handleAvailability === 'taken' || handleAvailability === 'invalid'
                  ? danger
                  : surfaceBorder,
            backgroundColor: card,
          },
        ]}
      >
        <Text
          style={{
            color: muted,
            fontWeight: '600',
            paddingLeft: tokens.space.s12,
            fontSize: 16,
          }}
        >
          @
        </Text>
        <TextInput
          testID="signup-handle-input"
          accessibilityLabel="Username"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          onChangeText={onHandleChange}
          placeholder="yourhandle"
          placeholderTextColor={muted}
          style={[styles.handleInput, { color }]}
          value={handle}
        />
      </View>
      {handleAvailability === 'checking' ? (
        <Text style={[styles.hint, { color: muted }]}>Checking...</Text>
      ) : handleAvailability === 'available' ? (
        <Text style={[styles.hint, { color: success }]}>@{normalizedHandle} is available</Text>
      ) : handleAvailability === 'taken' ? (
        <Text style={[styles.hint, { color: danger }]}>@{normalizedHandle} is taken</Text>
      ) : handleAvailability === 'invalid' ? (
        <Text style={[styles.hint, { color: danger }]}>
          3-20 letters, numbers, underscores, or periods only.
        </Text>
      ) : !canCheckHandleAvailability && fbAvailable ? (
        <Text style={[styles.hint, { color: muted }]}>
          Availability is checked when you create your account.
        </Text>
      ) : (
        <Text style={[styles.hint, { color: muted }]}>e.g. @studyqueen</Text>
      )}

      <Label style={fieldLabelStyle}>
        Name <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>(optional)</Text>
      </Label>
      <TextInput
        maxLength={40}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={muted}
        style={[styles.input, { borderColor: surfaceBorder, backgroundColor: card, color }]}
        value={name}
      />

      <Label style={fieldLabelStyle}>
        Phone <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>(optional)</Text>
      </Label>
      <TextInput
        keyboardType="phone-pad"
        onChangeText={setPhone}
        placeholder="+1 (713) 555-0123"
        placeholderTextColor={muted}
        style={[styles.input, { borderColor: surfaceBorder, backgroundColor: card, color }]}
        value={phone}
      />
      <Text style={[styles.hint, { color: muted }]}>Lets friends find you by phone number.</Text>

      <Label style={fieldLabelStyle}>City</Label>
      <TextInput
        testID="signup-city-input"
        accessibilityLabel="City"
        onChangeText={onCityChange}
        onFocus={onCityFocus}
        placeholder="Search cities..."
        placeholderTextColor={muted}
        style={[
          styles.input,
          { borderColor: city ? success : surfaceBorder, backgroundColor: card, color },
        ]}
        value={cityQuery}
      />
      {detectingCity && !city ? (
        <Text style={[styles.hint, { color: muted }]}>Detecting your city...</Text>
      ) : null}
      <Text style={[styles.hint, { color: muted }]}>{launchMarketHint}</Text>
      {launchMarketNotice ? (
        <Text style={[styles.hint, { color: danger }]}>{launchMarketNotice}</Text>
      ) : null}
      {cityLoading ? <Text style={[styles.hint, { color: muted }]}>Searching...</Text> : null}
      {cityDropdownOpen && cityQuery.trim().length > 0 ? (
        <SignupSuggestionList
          borderColor={surfaceBorder}
          color={color}
          emptyText="Perched is only open in Houston and Austin right now."
          highlight={highlight}
          muted={muted}
          onSelect={selectCityOption}
          options={cityOptions}
        />
      ) : null}
      {geoBias && !cityDropdownOpen ? (
        <Pressable
          onPress={() => {
            void applyCurrentCity();
          }}
          style={[styles.inlineButton, { borderColor: surfaceBorder }]}
        >
          <Text style={{ color: primary, fontWeight: '600' }}>Use my current city</Text>
        </Pressable>
      ) : null}
      {!isCityValid && !cityDropdownOpen ? (
        <Text style={[styles.hint, { color: muted }]}>
          Select your city to personalize your feed.
        </Text>
      ) : null}

      <Label style={fieldLabelStyle}>
        University{' '}
        <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>(optional)</Text>
      </Label>
      <TextInput
        onChangeText={onCampusChange}
        onFocus={onCampusFocus}
        placeholder="Search universities..."
        placeholderTextColor={muted}
        style={[
          styles.input,
          { borderColor: campus ? success : surfaceBorder, backgroundColor: card, color },
        ]}
        value={campusQuery}
      />
      {campusLoading ? <Text style={[styles.hint, { color: muted }]}>Searching...</Text> : null}
      {campusDropdownOpen && campusQuery.trim().length > 0 ? (
        <SignupSuggestionList
          borderColor={surfaceBorder}
          color={color}
          emptyText="No supported campus matches that search yet."
          highlight={highlight}
          muted={muted}
          onSelect={selectCampusOption}
          options={campusOptions}
        />
      ) : campus ? null : (
        <Text style={[styles.hint, { color: muted }]}>
          Add a supported campus if you are joining from a Houston or Austin-area university.
        </Text>
      )}

      {authError ? (
        <View
          style={[
            styles.infoBox,
            {
              backgroundColor: withAlpha(danger, 0.1),
              borderColor: withAlpha(danger, 0.3),
              marginTop: tokens.space.s4,
            },
          ]}
        >
          <Text style={{ color: danger, fontWeight: '500' }}>{authError}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={!canSubmit || loading}
        onPress={submit}
        style={[
          styles.primaryButton,
          { backgroundColor: primary },
          !canSubmit || loading ? { opacity: 0.5 } : null,
        ]}
        testID="signup-submit-button"
      >
        <Text style={styles.primaryText}>
          {loading ? 'Creating account...' : 'Create account'}
        </Text>
      </Pressable>

      <View style={{ height: tokens.space.s12 }} />
      <Text style={{ color: muted, fontSize: 12 }}>
        By continuing you agree to our{' '}
        <Text onPress={onPressTerms} style={{ color: primary, fontWeight: '600' }}>
          Terms
        </Text>{' '}
        and{' '}
        <Text onPress={onPressPrivacy} style={{ color: primary, fontWeight: '600' }}>
          Privacy Policy
        </Text>
        .
      </Text>
      <View style={{ height: tokens.space.s12 }} />
      <Pressable onPress={onPressSignIn} testID="signup-signin-link">
        <Text style={{ color: primary, fontWeight: '600' }}>Already have an account? Sign in</Text>
      </Pressable>
    </>
  );
}

function SignupSuggestionList({
  borderColor,
  color,
  emptyText,
  highlight,
  muted,
  onSelect,
  options,
}: SignupSuggestionListProps) {
  return (
    <View style={[styles.suggestionList, { borderColor }]}>
      {options.map((option) => (
        <Pressable
          key={option}
          onPress={() => onSelect(option)}
          style={({ pressed }) => [
            styles.locationRow,
            { borderColor, backgroundColor: pressed ? highlight : 'transparent' },
          ]}
        >
          <Text style={{ color, fontWeight: '600' }}>{option}</Text>
        </Pressable>
      ))}
      {!options.length ? (
        <Text style={{ color: muted, marginVertical: tokens.space.s8 }}>{emptyText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, marginBottom: tokens.space.s10 },
  infoBox: {
    padding: tokens.space.s12,
    borderRadius: tokens.radius.r12,
    borderWidth: 1,
    marginBottom: tokens.space.s12,
  },
  inlineButton: {
    paddingHorizontal: tokens.space.s14,
    paddingVertical: tokens.space.s10,
    borderRadius: tokens.radius.r12,
    borderWidth: 1,
    marginBottom: tokens.space.s10,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    padding: tokens.space.s12,
    borderRadius: tokens.radius.r14,
    marginBottom: tokens.space.s4,
  },
  handleInput: {
    flex: 1,
    padding: tokens.space.s12,
    fontSize: 16,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.r14,
    marginBottom: tokens.space.s4,
    overflow: 'hidden',
  },
  locationRow: {
    paddingVertical: tokens.space.s10,
    borderBottomWidth: 1,
  },
  primaryButton: {
    height: 54,
    borderRadius: tokens.radius.r18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.space.s8,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  suggestionList: {
    borderWidth: 1,
    borderRadius: tokens.radius.r14,
    paddingHorizontal: tokens.space.s10,
    paddingVertical: tokens.space.s6,
    marginBottom: tokens.space.s10,
  },
});
