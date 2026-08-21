// Tests the dispatch model designed with the developer: nearest-vehicle
// recommendation (GPS or SMS-reported location), broadcasting a job to
// available trucks, a driver's LOC reply updating the right vehicle, and
// assignment always being a dispatcher action, never automatic.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import type { Server } from "http";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";
import * as twilioClient from "../src/integrations/twilio/client";

// A unique sid per call, matching real Twilio behavior — a fixed sid
// would collide with Message's (provider, providerMessageId) unique
// constraint the moment more than one outbound message gets sent.
let mockSidCounter = 0;
vi.spyOn(twilioClient, "sendSms").mockImplementation(async () => ({
  sent: true,
  sid: `SM_mock_${++mockSidCounter}`,
  status: "queued",
}));

const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN!;
const ORG_TWILIO_NUMBER = "+15559993333";

function computeTwilioSignature(url: string, params: Record<string, string>) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", AUTH_TOKEN).update(Buffer.from(data, "utf-8")).digest("base64");
}

describe("dispatch: recommendation, broadcast, driver location, assignment", () => {
  let organizationId: string;
  let dispatcherCookie: string[];
  let server: Server;
  let baseUrl: string;

  // Farm at (10.0, 20.0). Vehicle A (GPS) is close; Vehicle B (SMS-reported)
  // is far; Vehicle C is AVAILABLE but its driver is INACTIVE (excluded);
  // Vehicle D has a location but is in MAINTENANCE (excluded).
  let farmerId: string;
  let farmId: string;
  let pickupId: string;
  let pickupWithNoFarmId: string;
  let vehicleAId: string;
  let vehicleBId: string;
  let driverAId: string;
  let driverBId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Dispatch Test Org", slug: `dispatch-test-${Date.now()}` },
    });
    organizationId = organization.id;

    await prisma.organizationPhoneNumber.create({
      data: { organizationId, phoneNumber: ORG_TWILIO_NUMBER, twilioPhoneNumber: ORG_TWILIO_NUMBER },
    });

    const dispatcher = await prisma.user.create({
      data: {
        organizationId,
        name: "Dispatcher",
        email: `dispatch-test-${Date.now()}@test.local`,
        role: "DISPATCHER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });

    const farmer = await prisma.farmer.create({
      data: { organizationId, name: "Test Farmer", phoneNumber: "+15559994444" },
    });
    farmerId = farmer.id;

    const farm = await prisma.farm.create({
      data: { organizationId, farmerId, name: "Test Farm", latitude: 10.0, longitude: 20.0 },
    });
    farmId = farm.id;

    const pickup = await prisma.pickupRequest.create({
      data: { organizationId, farmerId, farmId, product: "Maize", quantity: 200, unit: "KG" },
    });
    pickupId = pickup.id;

    const pickupNoFarm = await prisma.pickupRequest.create({ data: { organizationId, farmerId } });
    pickupWithNoFarmId = pickupNoFarm.id;

    const driverA = await prisma.driver.create({
      data: { organizationId, name: "Driver A", phoneNumber: "+15559995551" },
    });
    driverAId = driverA.id;
    const vehicleA = await prisma.vehicle.create({
      data: {
        organizationId,
        name: "Truck A",
        registrationNumber: "REG-A",
        primaryDriverId: driverA.id,
        currentLatitude: 10.01,
        currentLongitude: 20.01,
        locationSource: "GPS",
        locationUpdatedAt: new Date(),
      },
    });
    vehicleAId = vehicleA.id;

    const driverB = await prisma.driver.create({
      data: { organizationId, name: "Driver B", phoneNumber: "+15559995552" },
    });
    driverBId = driverB.id;
    const vehicleB = await prisma.vehicle.create({
      data: {
        organizationId,
        name: "Truck B",
        registrationNumber: "REG-B",
        primaryDriverId: driverB.id,
        currentLatitude: 15.0,
        currentLongitude: 25.0,
        locationSource: "SMS_REPORTED",
        locationUpdatedAt: new Date(),
      },
    });
    vehicleBId = vehicleB.id;

    const driverC = await prisma.driver.create({
      data: { organizationId, name: "Driver C", phoneNumber: "+15559995553", status: "INACTIVE" },
    });
    await prisma.vehicle.create({
      data: {
        organizationId,
        name: "Truck C",
        registrationNumber: "REG-C",
        primaryDriverId: driverC.id,
        currentLatitude: 10.0,
        currentLongitude: 20.0,
        locationSource: "GPS",
        locationUpdatedAt: new Date(),
      },
    });

    const driverD = await prisma.driver.create({
      data: { organizationId, name: "Driver D", phoneNumber: "+15559995554" },
    });
    await prisma.vehicle.create({
      data: {
        organizationId,
        name: "Truck D",
        registrationNumber: "REG-D",
        primaryDriverId: driverD.id,
        status: "MAINTENANCE",
        currentLatitude: 10.0,
        currentLongitude: 20.0,
        locationSource: "GPS",
        locationUpdatedAt: new Date(),
      },
    });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: dispatcher.email, password: "TestPassword123!" });
    dispatcherCookie = loginRes.headers["set-cookie"];

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

  it("reports unavailable when the pickup has no farm location on file", async () => {
    const res = await request(app)
      .get(`/api/pickups/${pickupWithNoFarmId}/recommendation`)
      .set("Cookie", dispatcherCookie);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(false);
  });

  it("ranks candidates nearest-first and excludes unavailable/inactive-driver vehicles", async () => {
    const res = await request(app).get(`/api/pickups/${pickupId}/recommendation`).set("Cookie", dispatcherCookie);
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);

    const ids = res.body.candidates.map((c: { vehicleId: string }) => c.vehicleId);
    expect(ids).toEqual([vehicleAId, vehicleBId]); // A (closer) before B; C and D excluded
    expect(res.body.candidates[0].distanceKm).toBeLessThan(res.body.candidates[1].distanceKm);
  });

  it("a driver's LOC reply updates their own vehicle's location, not anyone else's", async () => {
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: "+15559995551", Body: "LOC 12.5 22.5", MessageSid: "SM_driver_loc_1" };
    const signature = computeTwilioSignature(url, params);

    const res = await request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params);
    expect(res.status).toBe(200);

    const vehicleA = await prisma.vehicle.findUnique({ where: { id: vehicleAId } });
    expect(vehicleA?.currentLatitude).toBe(12.5);
    expect(vehicleA?.currentLongitude).toBe(22.5);
    expect(vehicleA?.locationSource).toBe("SMS_REPORTED");

    const vehicleB = await prisma.vehicle.findUnique({ where: { id: vehicleBId } });
    expect(vehicleB?.currentLatitude).toBe(15.0); // untouched

    // A driver's LOC text must never be treated as farmer intake.
    const farmerFromDriverPhone = await prisma.farmer.findFirst({ where: { phoneNumber: "+15559995551" } });
    expect(farmerFromDriverPhone).toBeNull();
  });

  it("broadcasts the job to every available vehicle with an active driver", async () => {
    const res = await request(app).post(`/api/pickups/${pickupId}/broadcast`).set("Cookie", dispatcherCookie);
    expect(res.status).toBe(200);
    expect(res.body.sentTo).toBe(2); // A and B — C (inactive driver) and D (maintenance) excluded

    const calledNumbers = twilioClient.sendSms.mock.calls.map((c) => c[0]);
    expect(calledNumbers).toContain("+15559995551");
    expect(calledNumbers).toContain("+15559995552");
    expect(calledNumbers).not.toContain("+15559995553");
    expect(calledNumbers).not.toContain("+15559995554");
  });

  it("assigns a vehicle, updates statuses, and dispatches the driver — always a deliberate action", async () => {
    const res = await request(app)
      .post(`/api/pickups/${pickupId}/assign`)
      .set("Cookie", dispatcherCookie)
      .send({ driverId: driverAId, vehicleId: vehicleAId });
    expect(res.status).toBe(201);

    const pickup = await prisma.pickupRequest.findUnique({ where: { id: pickupId } });
    expect(pickup?.status).toBe("ASSIGNED");

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleAId } });
    expect(vehicle?.status).toBe("EN_ROUTE");

    const assignment = await prisma.assignment.findFirst({ where: { pickupRequestId: pickupId } });
    expect(assignment?.driverId).toBe(driverAId);
    expect(assignment?.vehicleId).toBe(vehicleAId);

    // Closes the loop on the farmer's side, not just the driver's.
    const conversation = await prisma.conversation.findFirst({ where: { organizationId, farmerId } });
    const farmerMessage = await prisma.message.findFirst({
      where: { conversationId: conversation!.id, direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
    });
    expect(farmerMessage?.body).toContain("Driver A");
  });

  it("refuses to assign an already-assigned pickup", async () => {
    const res = await request(app)
      .post(`/api/pickups/${pickupId}/assign`)
      .set("Cookie", dispatcherCookie)
      .send({ driverId: driverBId, vehicleId: vehicleBId });
    expect(res.status).toBe(400);
  });

  it("under a race, only one of two concurrent assign requests for the same pickup wins", async () => {
    // Self-contained fixtures so this doesn't disturb the sequential
    // pickupId/vehicleAId state the surrounding tests depend on.
    const racePickup = await prisma.pickupRequest.create({
      data: { organizationId, farmerId, farmId, product: "Rice", quantity: 50, unit: "KG" },
    });

    const raceDriverA = await prisma.driver.create({
      data: { organizationId, name: "Race Driver A", phoneNumber: "+15559997771" },
    });
    const raceVehicleA = await prisma.vehicle.create({
      data: { organizationId, name: "Race Truck A", registrationNumber: "REG-RACE-A", primaryDriverId: raceDriverA.id },
    });
    const raceDriverB = await prisma.driver.create({
      data: { organizationId, name: "Race Driver B", phoneNumber: "+15559997772" },
    });
    const raceVehicleB = await prisma.vehicle.create({
      data: { organizationId, name: "Race Truck B", registrationNumber: "REG-RACE-B", primaryDriverId: raceDriverB.id },
    });

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/pickups/${racePickup.id}/assign`)
        .set("Cookie", dispatcherCookie)
        .send({ driverId: raceDriverA.id, vehicleId: raceVehicleA.id }),
      request(app)
        .post(`/api/pickups/${racePickup.id}/assign`)
        .set("Cookie", dispatcherCookie)
        .send({ driverId: raceDriverB.id, vehicleId: raceVehicleB.id }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const assignments = await prisma.assignment.findMany({ where: { pickupRequestId: racePickup.id } });
    expect(assignments).toHaveLength(1);

    const winner = resA.status === 201 ? raceVehicleA.id : raceVehicleB.id;
    const loser = resA.status === 201 ? raceVehicleB.id : raceVehicleA.id;
    const winnerVehicle = await prisma.vehicle.findUnique({ where: { id: winner } });
    const loserVehicle = await prisma.vehicle.findUnique({ where: { id: loser } });
    expect(winnerVehicle?.status).toBe("EN_ROUTE");
    expect(loserVehicle?.status).toBe("AVAILABLE"); // never claimed — must not be left dangling
  });

  it("marking the pickup COMPLETED frees the vehicle back up", async () => {
    const res = await request(app)
      .patch(`/api/pickups/${pickupId}`)
      .set("Cookie", dispatcherCookie)
      .send({ status: "COMPLETED" });
    expect(res.status).toBe(200);

    const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleAId } });
    expect(vehicle?.status).toBe("AVAILABLE");

    const assignment = await prisma.assignment.findFirst({ where: { pickupRequestId: pickupId } });
    expect(assignment?.status).toBe("COMPLETED");
  });

  it("a driver's DONE reply completes their active job and frees the vehicle", async () => {
    const pickup2 = await prisma.pickupRequest.create({
      data: { organizationId, farmerId, farmId, product: "Millet", quantity: 100, unit: "KG" },
    });
    await request(app)
      .post(`/api/pickups/${pickup2.id}/assign`)
      .set("Cookie", dispatcherCookie)
      .send({ driverId: driverBId, vehicleId: vehicleBId });

    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: "+15559995552", Body: "DONE", MessageSid: "SM_driver_done_1" };
    const signature = computeTwilioSignature(url, params);
    const res = await request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params);
    expect(res.status).toBe(200);

    const pickupAfter = await prisma.pickupRequest.findUnique({ where: { id: pickup2.id } });
    expect(pickupAfter?.status).toBe("COMPLETED");

    const vehicleB = await prisma.vehicle.findUnique({ where: { id: vehicleBId } });
    expect(vehicleB?.status).toBe("AVAILABLE");

    const assignment = await prisma.assignment.findFirst({ where: { pickupRequestId: pickup2.id } });
    expect(assignment?.status).toBe("COMPLETED");

    const conversation = await prisma.conversation.findFirst({ where: { organizationId, farmerId } });
    const farmerMessage = await prisma.message.findFirst({
      where: { conversationId: conversation!.id, direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
    });
    expect(farmerMessage?.body).toContain("completed");
  });

  it("a DONE reply from a driver with no active job is a harmless no-op", async () => {
    // driverA's only job was already completed in an earlier test.
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: "+15559995551", Body: "DONE", MessageSid: "SM_driver_done_noop" };
    const signature = computeTwilioSignature(url, params);
    const res = await request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params);
    expect(res.status).toBe(200); // still acked, nothing crashes
  });

  it("two concurrent DONE deliveries for the same job complete it only once (one farmer notification, not two)", async () => {
    const racePickup = await prisma.pickupRequest.create({
      data: { organizationId, farmerId, farmId, product: "Yam", quantity: 80, unit: "KG" },
    });
    const raceDriver = await prisma.driver.create({
      data: { organizationId, name: "Race Done Driver", phoneNumber: "+15559998881" },
    });
    const raceVehicle = await prisma.vehicle.create({
      data: {
        organizationId,
        name: "Race Done Truck",
        registrationNumber: "REG-DONE-RACE",
        primaryDriverId: raceDriver.id,
      },
    });
    await request(app)
      .post(`/api/pickups/${racePickup.id}/assign`)
      .set("Cookie", dispatcherCookie)
      .send({ driverId: raceDriver.id, vehicleId: raceVehicle.id });

    const conversation = await prisma.conversation.findFirst({ where: { organizationId, farmerId } });
    const beforeCount = await prisma.message.count({
      where: { conversationId: conversation!.id, direction: "OUTBOUND", body: { contains: "completed" } },
    });

    // Same MessageSid on both — simulates a redelivered Twilio webhook,
    // though the underlying bug is identical for two distinct driver
    // texts: driver messages get no providerMessageId dedup at all
    // (twilioWebhook.service.ts), so the atomic guard in
    // pickupRequest.repository.ts is what has to catch this, not dedup.
    const url = `${baseUrl}/webhooks/twilio/incoming`;
    const params = { To: ORG_TWILIO_NUMBER, From: raceDriver.phoneNumber, Body: "DONE", MessageSid: "SM_driver_done_race" };
    const signature = computeTwilioSignature(url, params);

    const [resA, resB] = await Promise.all([
      request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params),
      request(server).post("/webhooks/twilio/incoming").set("X-Twilio-Signature", signature).type("form").send(params),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const pickupAfter = await prisma.pickupRequest.findUnique({ where: { id: racePickup.id } });
    expect(pickupAfter?.status).toBe("COMPLETED");

    const vehicleAfter = await prisma.vehicle.findUnique({ where: { id: raceVehicle.id } });
    expect(vehicleAfter?.status).toBe("AVAILABLE");

    const afterCount = await prisma.message.count({
      where: { conversationId: conversation!.id, direction: "OUTBOUND", body: { contains: "completed" } },
    });
    expect(afterCount - beforeCount).toBe(1); // exactly one "completed" notification, not two
  });
});
