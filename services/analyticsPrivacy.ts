export type PasswordResetTelemetry = {
  email_present: boolean;
  email_domain?: string;
};

export function buildPasswordResetTelemetry(email: string): PasswordResetTelemetry {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) {
    return { email_present: false };
  }
  const at = normalized.indexOf('@');
  const domain = at >= 0 ? normalized.slice(at + 1).trim() : '';
  return {
    email_present: true,
    email_domain: domain || undefined,
  };
}
