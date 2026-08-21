// Covers CLAUDE.md §42's Twilio test list: valid/invalid/duplicate
// webhook, unknown phone number, known/unknown farmer, conversation
// creation, message persistence, status callback, outbound failure.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import type { Server } from "http";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const ORG_TWILIO_NUMBER = "+15559990000";
const FARMER_NUMBER = "+15559990001";

// Twilio's documented signature algorithm: sort params by key, concatenate
// key+value directly onto the URL, HMAC-SHA1 with the auth token, base64.
function computeTwilioSignature(url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("twilio webhooks", () => {
  let organizationId: string;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Twilio Webhook Test Org", slug: `twilio-webhook-test-${Date.now()}` },
    });
    organizationId = organization.id;

    await prisma.organizationPhoneNumber.create({
      data: {
        organizationId,
        phoneNumber: ORG_TWILIO_NUMBER,
        twilioPhoneNumber: ORG_TWILIO_NUMBER,
      },
    });

    // A real listening server (not just the app object) so the signature
    // can be computed against the exact URL the middleware reconstructs.
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to start test server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    server.close();
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("rejects an incoming webhook with no signature", async () => {
    const res = await request(app)
      .post("/webhooks/twilio/incoming")
      .type("form")
      .send({ To: ORG_TWILIO_NUMBER, From: FARMER_NUMBER, Body: "hello", MessageSid: "SM_no_sig" });
    expect(res.status).toBe(403);
  });

  it("rejects an incoming webhook with a wrong signature", async () => {
    const res = await request(app)
      .post("/webhooks/twilio/incoming")
      .set("X-Twilio-Signature", "not-a-real-signature")
      .type("form")
      .send({ To: ORG_TWILIO_NUMBER, From: FARMER_NUMBER, Body: "hello", MessageSid: "SM_bad_sig" });
    expect(res.status).toBe(403);
  });

  it("accepts a validly-signed webhook, creates the farmer, conversation, and message", async () => {
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: FARMER_NUMBER, Body: "hello there", MessageSid: "SM_valid_1" };
    const signature = computeTwilioSignature(url, params);

    const res = await request(server)
      .post("/webhooks/twilio/incoming")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);

    expect(res.status).toBe(200);
    expect(res.text).toContain("<Response>");

    const farmer = await prisma.farmer.findFirst({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    expect(farmer).not.toBeNull();

    const conversation = await prisma.conversation.findFirst({ where: { organizationId, farmerId: farmer!.id } });
    expect(conversation).not.toBeNull();

    const message = await prisma.message.findFirst({ where: { providerMessageId: "SM_valid_1" } });
    expect(message?.body).toBe("hello there");
    expect(message?.direction).toBe("INBOUND");
  });

  it("reuses the existing farmer and conversation on a second message", async () => {
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: FARMER_NUMBER, Body: "second message", MessageSid: "SM_valid_2" };
    const signature = computeTwilioSignature(url, params);

    await request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params);

    const farmers = await prisma.farmer.findMany({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    expect(farmers).toHaveLength(1); // no duplicate farmer

    const conversations = await prisma.conversation.findMany({ where: { organizationId, farmerId: farmers[0].id } });
    expect(conversations).toHaveLength(1); // reused, not a new conversation
  });

  it("does not create a duplicate message when the same webhook is retried", async () => {
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: FARMER_NUMBER, Body: "hello there", MessageSid: "SM_valid_1" };
    const signature = computeTwilioSignature(url, params);

    const res = await request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params);
    expect(res.status).toBe(200);

    const messages = await prisma.message.findMany({ where: { providerMessageId: "SM_valid_1" } });
    expect(messages).toHaveLength(1);
  });

  it("acknowledges but drops a webhook to an unrecognized destination number", async () => {
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: "+15550000999", From: FARMER_NUMBER, Body: "nobody owns this number", MessageSid: "SM_unknown_dest" };
    const signature = computeTwilioSignature(url, params);

    const res = await request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params);
    expect(res.status).toBe(200); // still acked so Twilio doesn't retry forever

    const message = await prisma.message.findFirst({ where: { providerMessageId: "SM_unknown_dest" } });
    expect(message).toBeNull();
  });

  it("updates message status via the status callback webhook", async () => {
    const url = `${baseUrl}/webhooks/twilio/status`;
    const params = { MessageSid: "SM_valid_1", MessageStatus: "delivered" };
    const signature = computeTwilioSignature(url, params);

    const res = await request(server).post("/webhooks/twilio/status").set("X-Twilio-Signature", signature).type("form").send(params);
    expect(res.status).toBe(200);

    const message = await prisma.message.findFirst({ where: { providerMessageId: "SM_valid_1" } });
    expect(message?.status).toBe("DELIVERED");
  });

  it("keeps an outbound message QUEUED (not crashing) when Twilio isn't configured", async () => {
    // TWILIO_ACCOUNT_SID is unset in this test run (see tests/setup.ts),
    // so the backend's own sendSms() call is a deliberate no-op.
    const farmer = await prisma.farmer.findFirst({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    const conversation = await prisma.conversation.findFirst({ where: { organizationId, farmerId: farmer!.id } });

    const cookieRes = await seedAndLoginDispatcher(organizationId);
    const res = await request(app)
      .post(`/api/conversations/${conversation!.id}/messages`)
      .set("Cookie", cookieRes)
      .send({ body: "outbound test" });

    expect(res.status).toBe(201);
    expect(res.body.message.status).toBe("QUEUED");
    expect(res.body.message.providerMessageId).toBeNull();
  });
});

async function seedAndLoginDispatcher(organizationId: string) {
  const bcrypt = await import("bcryptjs");
  const email = `twilio-test-dispatcher-${Date.now()}@test.local`;
  const password = "TestPassword123!";
  await prisma.user.create({
    data: {
      organizationId,
      name: "Test Dispatcher",
      email,
      role: "DISPATCHER",
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  const res = await request(app).post("/api/auth/login").send({ email, password });
  return res.headers["set-cookie"];
}
