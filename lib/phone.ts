// Phone-number normalisation, kept free of any server-only import so the admin
// UI can tell an admin "that number won't work" using exactly the rule the
// WhatsApp sender applies — rather than a second, subtly different guess.

// Members type their phone however they like: "+91 98765 43210", "098765 43210",
// "9876543210". Meta wants bare E.164 digits with no '+'. Anything that can't
// plausibly be a number comes back null so the caller can skip it silently.
export function normalizePhone(raw: string | null | undefined, countryCode = '91'): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;

  const cc = String(countryCode).replace(/\D+/g, '');

  // "00" is the international prefix in much of the world — same as a leading '+'.
  if (digits.startsWith('00')) digits = digits.slice(2);
  // A single leading zero is a national trunk prefix; it never belongs in E.164.
  else if (digits.startsWith('0')) digits = digits.slice(1);

  // Already carries a country code (and enough digits after it) → leave it be.
  // The length check matters: an Indian mobile starting "9198…" is a local
  // number, not a country code plus seven digits.
  if (cc && digits.startsWith(cc) && digits.length >= cc.length + 9) return digits;

  // A bare national number: prefix the configured country code.
  if (cc && digits.length <= 10) digits = cc + digits;

  // Shortest plausible E.164 subscriber numbers are around 8 digits plus a
  // country code; anything under 10 in total is a typo, not a phone number.
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export const isEmailAddress = (e: string | null | undefined): boolean =>
  !!e && /.+@.+\..+/.test(e.trim());
