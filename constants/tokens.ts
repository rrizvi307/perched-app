export const tokens = {
  color: {
    // Updated to match new dopamine-inducing color scheme
    bg: "#FFFFFF",
    text: "#0A0A0A",
    muted: "#737373",
    border: "#E5E5E5",
    card: "#FFFFFF",
    accent: "#EC4899", // Hot pink
    warm: "#8B5CF6", // Vibrant purple (replaces old green)
  },
  space: {
    s6: 6,
    s8: 8,
    s10: 10,
    s12: 12,
    s14: 14,
    s16: 16,
    s18: 18,
    s20: 20,
    s24: 24,
    s28: 28,
    s32: 32,
  },
  radius: {
    r10: 10,
    r12: 12,
    r16: 16,
    r20: 20,
    r24: 24,
    r28: 28,
    r32: 32,
  },
  type: {
    label: { fontSize: 11, letterSpacing: 1.4, fontWeight: "600" as const },
    h1: { fontSize: 36, lineHeight: 40, fontWeight: "800" as const },
    h2: { fontSize: 20, lineHeight: 26, letterSpacing: 0.3, fontWeight: "700" as const },
    h3: { fontSize: 18, lineHeight: 24, fontWeight: "700" as const },
    h4: { fontSize: 16, lineHeight: 22, fontWeight: "700" as const },
    body: { fontSize: 17, lineHeight: 24, fontWeight: "400" as const },
    small: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  },
};
