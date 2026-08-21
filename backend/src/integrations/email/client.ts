// No real email provider is wired up yet — CLAUDE.md §50 says never
// assume a paid email service, and adding one needs the developer's
// explicit approval, same as Twilio did. This logs what would have been
// sent instead of throwing, so the invite flow (team.service.ts) is
// fully testable locally without one. Wiring up a real provider later
// (Resend, Postmark, SMTP, ...) means replacing this function's body —
// nothing else in the invite flow needs to change.
export type SendEmailResult = { sent: true } | { sent: false; reason: string };

export async function sendEmail(to: string, subject: string, body: string): Promise<SendEmailResult> {
  console.log(`[email:dev] To: ${to}\nSubject: ${subject}\n\n${body}\n`);
  return { sent: false, reason: "No email provider configured — logged to console instead" };
}
