import "server-only";

type RegistrationPolicyResult =
  | { allowed: true }
  | { allowed: false; message: string };

const REGISTRATION_BLOCKED_MESSAGE =
  "Le registrazioni sono attualmente chiuse o la tua email non e autorizzata.";

function parseEmailList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isLocalRegistrationAllowed(email: string): RegistrationPolicyResult {
  const normalizedEmail = email.trim().toLowerCase();
  const registrationsEnabled = process.env.REGISTRATIONS_ENABLED === "true";
  const whitelistEnabled =
    process.env.REGISTRATION_WHITELIST_ENABLED === "true";
  const whitelist = parseEmailList(process.env.REGISTRATION_WHITELIST);

  if (!registrationsEnabled) {
    if (whitelistEnabled && whitelist.includes(normalizedEmail)) {
      return { allowed: true };
    }

    return { allowed: false, message: REGISTRATION_BLOCKED_MESSAGE };
  }

  if (whitelistEnabled && !whitelist.includes(normalizedEmail)) {
    return { allowed: false, message: REGISTRATION_BLOCKED_MESSAGE };
  }

  return { allowed: true };
}
