// Phone-number normalisation, kept free of any server-only import so the admin
// UI can tell an admin "that number won't work" using exactly the rule the
// WhatsApp sender applies — rather than a second, subtly different guess.

// Members type their phone however they like: "+91 98765 43210", "098765 43210",
// "9876543210". Meta wants bare E.164 digits with no '+'. Anything that can't
// plausibly be a number comes back null so the caller can skip it silently.
export function normalizePhone(raw: string | null | undefined, countryCode = '91'): string | null {
  if (!raw) return null;
  const text = String(raw).trim();

  // A leading '+' — or the '00' international prefix — means the number already
  // names its own country, so the club's default must NOT be added on top. This
  // is what turned a Singapore number into an Indian one: "+65 1345 66" has no
  // '91' at the front and is short, so the old rule read it as a bare national
  // number and produced "9165134566" — a real-looking number belonging to
  // somebody else entirely.
  const isInternational = text.startsWith('+') || /^00\d/.test(text.replace(/[\s()-]/g, ''));

  let digits = text.replace(/\D+/g, '');
  if (!digits) return null;

  const cc = String(countryCode).replace(/\D+/g, '');

  // "00" is the international prefix in much of the world — same as a leading '+'.
  if (digits.startsWith('00')) digits = digits.slice(2);
  // A single leading zero is a national trunk prefix; it never belongs in E.164.
  // Only stripped for national numbers: after a '+' a zero is already invalid.
  else if (!isInternational && digits.startsWith('0')) digits = digits.slice(1);

  // Explicitly international: take it as given. The floor is lower than for a
  // national number because plenty of countries have shorter subscriber numbers
  // than India does, and the caller has already told us which country it is.
  if (isInternational) {
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }

  // Already carries the default country code (and enough digits after it) →
  // leave it be. The length check matters: an Indian mobile starting "9198…" is
  // a local number, not a country code plus seven digits.
  if (cc && digits.startsWith(cc) && digits.length >= cc.length + 9) return digits;

  // A bare national number: prefix the configured country code.
  if (cc && digits.length <= 10) digits = cc + digits;

  // Shortest plausible E.164 subscriber numbers are around 8 digits plus a
  // country code; anything under 10 in total is a typo, not a phone number.
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export const isEmailAddress = (e: string | null | undefined): boolean =>
  !!e && /.+@.+\..+/.test(e.trim());
