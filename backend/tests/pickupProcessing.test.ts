// Integration tests for the SMS-processing pipeline wired into the Twilio
// webhook (CLAUDE.md Phase 7 + §42's message-processing scenarios):
// pickup creation, correction, cancellation, farm auto-linking, and the
// needsReview flag for ambiguous messages.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import crypto from "crypto";
import type { Server } from "http";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const ORG_TWILIO_NUMBER = "+15559991111";
const FARMER_NUMBER = "+15559991122";

function computeTwilioSignature(url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("SMS pickup-request processing", () => {
  let organizationId: string;
  let server: Server;
  let baseUrl: string;
  let messageCounter = 0;

  async function sendSms(body: string) {
    const messageSid = `SM_pp_${++messageCounter}`;
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: FARMER_NUMBER, Body: body, MessageSid: messageSid };
    const signature = computeTwilioSignature(url, params);
    const res = await request(server)
      .post("/webhooks/twilio/incoming")
      .set("X-Twilio-Signature", signature)
      .type("form")
      .send(params);
    return { res, messageSid };
  }

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Pickup Processing Test Org", slug: `pickup-processing-test-${Date.now()}` },
    });
    organizationId = organization.id;

    await prisma.organizationPhoneNumber.create({
      data: { organizationId, phoneNumber: ORG_TWILIO_NUMBER, twilioPhoneNumber: ORG_TWILIO_NUMBER },
    });

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

  it("creates a PENDING pickup request from a confident SMS, linked back to the message", async () => {
    const { res, messageSid } = await sendSms("Kwame - Maize - 200KG - Ajumako");
    expect(res.status).toBe(200);

    const farmer = await prisma.farmer.findFirst({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    const pickup = await prisma.pickupRequest.findFirst({ where: { organizationId, farmerId: farmer!.id } });

    expect(pickup).not.toBeNull();
    expect(pickup?.status).toBe("PENDING");
    expect(pickup?.product).toBe("Maize");
    expect(pickup?.quantity).toBe(200);
    expect(pickup?.unit).toBe("KG");

    // The farmer was created with their phone number as a placeholder
    // name (Phase 6) — their first parseable SMS should replace it.
    expect(farmer?.name).toBe("Kwame");

    const message = await prisma.message.findFirst({ where: { providerMessageId: messageSid } });
    expect(pickup?.sourceMessageId).toBe(message?.id);
    expect(message?.needsReview).toBe(false);
  });

  it("flags an ambiguous message for review instead of creating a pickup request", async () => {
    const { messageSid } = await sendSms("Kwame - Maize - not-a-number - Ajumako");

    const message = await prisma.message.findFirst({ where: { providerMessageId: messageSid } });
    expect(message?.needsReview).toBe(true);

    const pickupsForThisMessage = await prisma.pickupRequest.findFirst({
      where: { sourceMessageId: message!.id },
    });
    expect(pickupsForThisMessage).toBeNull();
  });

  it("does not flag ordinary chat, and creates no pickup for it", async () => {
    const { messageSid } = await sendSms("Hello, is this AgriHaul?");
    const message = await prisma.message.findFirst({ where: { providerMessageId: messageSid } });
    expect(message?.needsReview).toBe(false);

    const pickup = await prisma.pickupRequest.findFirst({ where: { sourceMessageId: message!.id } });
    expect(pickup).toBeNull();
  });

  it("treats a second confident SMS as a correction to the still-pending pickup, not a new one", async () => {
    const farmer = await prisma.farmer.findFirst({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    const before = await prisma.pickupRequest.count({ where: { organizationId, farmerId: farmer!.id } });

    await sendSms("Kwame - Maize - 350KG - Ajumako"); // corrected quantity

    const after = await prisma.pickupRequest.count({ where: { organizationId, farmerId: farmer!.id } });
    expect(after).toBe(before); // no new row — the existing PENDING one was updated

    const pickup = await prisma.pickupRequest.findFirst({ where: { organizationId, farmerId: farmer!.id } });
    expect(pickup?.quantity).toBe(350);
  });

  it("cancels the pending pickup on CANCEL", async () => {
    const farmer = await prisma.farmer.findFirst({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    const pending = await prisma.pickupRequest.findFirst({
      where: { organizationId, farmerId: farmer!.id, status: "PENDING" },
    });
    expect(pending).not.toBeNull();

    await sendSms("CANCEL");

    const updated = await prisma.pickupRequest.findUnique({ where: { id: pending!.id } });
    expect(updated?.status).toBe("CANCELLED");
  });

  it("auto-links a farm when the parsed location matches one of the farmer's known farms", async () => {
    const farmer = await prisma.farmer.findFirst({ where: { organizationId, phoneNumber: FARMER_NUMBER } });
    const farm = await prisma.farm.create({
      data: { organizationId, farmerId: farmer!.id, name: "Riverside Plot" },
    });

    await sendSms("Kwame - Cassava - 100KG - Riverside Plot");

    const pickup = await prisma.pickupRequest.findFirst({
      where: { organizationId, farmerId: farmer!.id, status: "PENDING" },
    });
    expect(pickup?.farmId).toBe(farm.id);
  });
});
