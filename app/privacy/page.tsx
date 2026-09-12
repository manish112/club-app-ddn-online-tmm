import { LegalPageShell, LegalSection } from '@/components/LegalPageShell';

export const metadata = { title: 'Privacy Policy — Dehradun Online Toastmasters' };

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy" updated="12 September 2026">
      <LegalSection title="1. What we collect">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Profile information</strong> you or an admin enter: name, membership number, email,
            phone, city, gender, a short introduction, avatar photo, and your light/dark theme preference.</li>
          <li><strong>Sign-in credentials</strong>: your password, stored as a salted hash — never in plain
            text, and never visible to admins.</li>
          <li><strong>Consent and acceptance records</strong>: whether you&apos;ve granted or declined email
            and WhatsApp notifications, and whether you&apos;ve accepted these Terms and this Policy — each
            with the date and a device snapshot (IP address, browser, OS, device type, and approximate
            location from that IP) captured at the moment you decided.</li>
          <li><strong>Meeting activity</strong>: roles you claim or are assigned, attendance, contest scores
            and votes you cast, evaluator/speaker requests, and survey responses.</li>
          <li><strong>Guest details</strong> you or a guest-manager enter when registering a guest for a
            meeting (name and contact info) — used only for that meeting.</li>
          <li><strong>WhatsApp number and opt-in status</strong>, if you&apos;ve been enabled for WhatsApp
            and have consented to it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. How we use it">
        <p>To run club meetings: scheduling, role booking, attendance and activity reports, contest and
          voting administration, mentor pairing, guest management, and surveys. To reach you, with your
          consent, about meetings and roles by email and/or WhatsApp. To keep a compliance record of
          notification-consent decisions, contact-detail changes, and Terms/Privacy acceptances.</p>
      </LegalSection>

      <LegalSection title="3. Your consent, channel by channel">
        <p>
          Email and WhatsApp are gated separately. Nothing is sent on either channel until you explicitly
          grant consent for it — at sign-in, or anytime from your profile — and you can decline or revoke
          consent just as easily; declining or revoking stops future notifications on that channel, and the
          decision itself (including which device it was made from) is kept as a record.
        </p>
        <p>
          A handful of emails are exempt from this preference because they&apos;re service/compliance
          receipts of an action on your account, not notifications: confirming a consent decision, confirming
          a contact-detail change, and confirming acceptance of these Terms. Each says so plainly, and each
          is also copied to a fixed club record-keeping address.
        </p>
        <p>
          WhatsApp has one extra gate: because each message has a real cost to the club, an admin must also
          switch WhatsApp on for you before your own consent can take effect.
        </p>
      </LegalSection>

      <LegalSection title="4. Who else sees your data">
        <p>
          We don&apos;t sell or share your data for advertising. It&apos;s processed by the infrastructure this
          app runs on: <strong>Supabase</strong> (database hosting), <strong>Vercel</strong> (app hosting),
          the club&apos;s configured <strong>email provider</strong> (for sending notifications), and{' '}
          <strong>Meta&apos;s WhatsApp Cloud API</strong> (for WhatsApp messages). Secrets like SMTP
          credentials and the WhatsApp access token, along with raw device/IP snapshots, are restricted to
          server-side access only — the app&apos;s own client code cannot read them.
        </p>
      </LegalSection>

      <LegalSection title="5. How long we keep it">
        <p>
          Your profile and activity history are kept while you&apos;re an active member, and referenced
          afterwards in the club&apos;s own meeting and role-history records. Consent decisions, contact
          changes, and Terms acceptances are kept indefinitely as compliance records, since they&apos;re
          evidence of what you agreed to and when.
        </p>
      </LegalSection>

      <LegalSection title="6. Your choices">
        <ul className="list-disc pl-5 space-y-1">
          <li>Update your own email, phone, bio, and photo anytime from your profile.</li>
          <li>Grant, decline, or revoke email/WhatsApp consent anytime from your profile.</li>
          <li>Ask a club admin to deactivate your account or delete your personal data, subject to what the
            club needs to keep for its own records.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Children">
        <p>This app is built for adult Toastmasters club members and is not directed at children.</p>
      </LegalSection>

      <LegalSection title="8. Changes to this Policy">
        <p>
          We may update this Policy as the app changes. A material update asks every member to accept the
          new version again the next time they sign in, confirmed to you by email.
        </p>
      </LegalSection>

      <LegalSection title="9. Questions">
        <p>Reach out to your club&apos;s admins (the officers running this app) with any question about this Policy.</p>
      </LegalSection>
    </LegalPageShell>
  );
}
