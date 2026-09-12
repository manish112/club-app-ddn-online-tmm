import { LegalPageShell, LegalSection } from '@/components/LegalPageShell';

export const metadata = { title: 'Terms & Conditions — Dehradun Online Toastmasters' };

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms & Conditions" updated="12 September 2026">
      <LegalSection title="1. What this app is">
        <p>
          This app is a role-booking and meeting-management tool built and run by
          Dehradun Online Toastmasters for its own members and guests — scheduling meetings, claiming and
          tracking meeting roles, registering guests, running contests and votes, collecting surveys, and
          sending meeting-related notifications by email and WhatsApp. It is not an official product of
          Toastmasters International, and using it doesn&apos;t change your standing as a Toastmasters member —
          this app just helps the club run its own meetings.
        </p>
      </LegalSection>

      <LegalSection title="2. Your account">
        <p>
          Your account is tied to your club membership record. You sign in with a password you set yourself,
          stored as a salted hash — nobody at the club, including admins, can read it back. Keep it to
          yourself; if you lose access, a club admin can reset it for you. You&apos;re responsible for what
          happens under your account once you&apos;re signed in.
        </p>
      </LegalSection>

      <LegalSection title="3. Using the app">
        <p>You agree to use this app only for genuine club administration — booking and playing meeting roles,
          registering real guests, casting your own votes and scores, and giving honest survey responses.
          In particular, you agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>claim a role you don&apos;t intend to play, or claim on someone else&apos;s behalf without their knowledge;</li>
          <li>register fictitious guests, or misuse guest data collected on their behalf;</li>
          <li>manipulate contest scoring or club voting;</li>
          <li>attempt to access another member&apos;s account, or admin functions you haven&apos;t been given;</li>
          <li>use any contact details surfaced by the app (member or guest) for anything outside club business.</li>
        </ul>
        <p>An admin may deactivate an account that misuses the app.</p>
      </LegalSection>

      <LegalSection title="4. Notifications and consent">
        <p>
          Email and WhatsApp notifications are sent only with your own explicit, per-channel consent, which
          you can grant, decline, or revoke at any time from your profile — see our{' '}
          <a href="/privacy" className="text-maroon-600 dark:text-maroon-400 font-semibold underline underline-offset-2">
            Privacy Policy
          </a>{' '}for exactly how that works. A small number of transactional emails — confirming a consent
          decision, a contact-detail change, or acceptance of these Terms — are compliance records of an
          action you took, not notifications, so they aren&apos;t covered by that preference and go out
          regardless of it.
        </p>
      </LegalSection>

      <LegalSection title="5. Records and content">
        <p>
          Role-claim history, votes, contest scores, guest registrations, and survey responses are club
          records, kept for the club&apos;s own administration and history. Your profile bio and photo are
          your own content — edit or remove them anytime from your profile.
        </p>
      </LegalSection>

      <LegalSection title="6. Availability">
        <p>
          This app is run on a best-effort basis by club volunteers, hosted on third-party infrastructure
          (currently Vercel for hosting, Supabase for the database, and Meta&apos;s WhatsApp Cloud API for
          WhatsApp messages). It&apos;s provided as-is, with no guarantee of uninterrupted availability or
          error-free operation.
        </p>
      </LegalSection>

      <LegalSection title="7. Ending access">
        <p>
          An admin may deactivate your account if you leave the club, are inactive, or misuse the app. You
          may ask a club admin at any time to deactivate your account or delete your personal data, subject
          to what the club needs to keep for its own meeting and role-history records.
        </p>
      </LegalSection>

      <LegalSection title="8. Changes to these Terms">
        <p>
          We may update these Terms as the app changes. A material update asks every member to accept the
          new version again the next time they sign in — the version you accepted, and when, is kept on
          your account and confirmed to you by email each time.
        </p>
      </LegalSection>

      <LegalSection title="9. Questions">
        <p>Reach out to your club&apos;s admins (the officers running this app) with any question about these Terms.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
