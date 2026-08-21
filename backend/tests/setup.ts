// Runs before each test file's imports resolve. Sets a fake Twilio auth
// token so twilioSignature.middleware.ts actually validates signatures in
// tests instead of skipping (its dev-only bypass for an unconfigured
// account). TWILIO_ACCOUNT_SID is deliberately left unset so
// integrations/twilio/client.ts's sendSms() stays a no-op — tests must
// never attempt a real Twilio API call.
process.env.TWILIO_AUTH_TOKEN = "test_twilio_auth_token_for_signature_tests";
