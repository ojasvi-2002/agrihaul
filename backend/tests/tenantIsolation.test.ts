// Proves CLAUDE.md §22-§24: an authenticated user from one organization
// can never read, modify, or otherwise reach another organization's data
// through the API. Runs against the real local Postgres — this is an
// integration test, not a mock-based unit test, because the thing being
// proven is that the actual database queries are scoped correctly.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

const TEST_PASSWORD = "TestPassword123!";

async function createTestOrg(label: string) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const organization = await prisma.organization.create({
    data: { name: `Isolation Test Org ${label}`, slug: `isolation-test-${label.toLowerCase()}-${Date.now()}` },
  });

  const user = await prisma.user.create({
    data: {
      organizationId: organization.id,
      name: `Test User ${label}`,
      email: `isolation-${label.toLowerCase()}-${Date.now()}@test.local`,
      role: "OWNER",
      passwordHash,
    },
  });

  const farmer = await prisma.farmer.create({
    data: { organizationId: organization.id, name: `Farmer ${label}`, phoneNumber: `+1000000${label}001` },
  });

  const farm = await prisma.farm.create({
    data: { organizationId: organization.id, farmerId: farmer.id, name: `Farm ${label}` },
  });

  const driver = await prisma.driver.create({
    data: { organizationId: organization.id, name: `Driver ${label}`, phoneNumber: `+1000000${label}002` },
  });

  const vehicle = await prisma.vehicle.create({
    data: { organizationId: organization.id, name: `Vehicle ${label}`, registrationNumber: `REG-${label}-1` },
  });

  const conversation = await prisma.conversation.create({
    data: { organizationId: organization.id, farmerId: farmer.id },
  });

  const message = await prisma.message.create({
    data: {
      organizationId: organization.id,
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: farmer.phoneNumber,
      recipient: "+10000000000",
      body: `Test message ${label}`,
      status: "RECEIVED",
    },
  });

  const pickup = await prisma.pickupRequest.create({
    data: { organizationId: organization.id, farmerId: farmer.id, farmId: farm.id, quantity: 100, unit: "KG" },
  });

  return { organization, user, farmer, farm, driver, vehicle, conversation, message, pickup };
}

describe("tenant isolation", () => {
  let orgA: Awaited<ReturnType<typeof createTestOrg>>;
  let orgB: Awaited<ReturnType<typeof createTestOrg>>;
  const agentA = request.agent(app);
  const agentB = request.agent(app);

  beforeAll(async () => {
    orgA = await createTestOrg("A");
    orgB = await createTestOrg("B");

    await agentA.post("/api/auth/login").send({ email: orgA.user.email, password: TEST_PASSWORD });
    await agentB.post("/api/auth/login").send({ email: orgB.user.email, password: TEST_PASSWORD });
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: orgA.organization.id } });
    await prisma.organization.delete({ where: { id: orgB.organization.id } });
    await prisma.$disconnect();
  });

  it("logs in as the correct organization", async () => {
    const res = await agentA.get("/api/organizations/current");
    expect(res.status).toBe(200);
    expect(res.body.organization.id).toBe(orgA.organization.id);
  });

  it("only lists its own organization's farmers", async () => {
    const res = await agentA.get("/api/farmers");
    expect(res.status).toBe(200);
    const ids = res.body.farmers.map((f: { id: string }) => f.id);
    expect(ids).toContain(orgA.farmer.id);
    expect(ids).not.toContain(orgB.farmer.id);
  });

  it("cannot GET another organization's farmer by id (404, not 403)", async () => {
    const res = await agentA.get(`/api/farmers/${orgB.farmer.id}`);
    expect(res.status).toBe(404);
  });

  it("cannot PATCH another organization's farmer", async () => {
    const res = await agentA.patch(`/api/farmers/${orgB.farmer.id}`).send({ name: "Hijacked" });
    expect(res.status).toBe(404);

    const stillOriginal = await prisma.farmer.findUnique({ where: { id: orgB.farmer.id } });
    expect(stillOriginal?.name).toBe("Farmer B");
  });

  it("cannot create a farm attached to another organization's farmer", async () => {
    const res = await agentA.post("/api/farms").send({ farmerId: orgB.farmer.id, name: "Stolen Farm" });
    expect(res.status).toBe(400);
  });

  it("cannot GET another organization's conversation", async () => {
    const res = await agentA.get(`/api/conversations/${orgB.conversation.id}`);
    expect(res.status).toBe(404);
  });

  it("cannot list another organization's conversation messages via the nested route", async () => {
    const res = await agentA.get(`/api/conversations/${orgB.conversation.id}/messages`);
    expect(res.status).toBe(404);
  });

  it("cannot send a message into another organization's conversation", async () => {
    const res = await agentA
      .post(`/api/conversations/${orgB.conversation.id}/messages`)
      .send({ body: "Injected message" });
    expect(res.status).toBe(404);

    const messages = await prisma.message.findMany({ where: { conversationId: orgB.conversation.id } });
    expect(messages).toHaveLength(1); // only the original seeded message
  });

  it("cannot GET another organization's message directly", async () => {
    const res = await agentA.get(`/api/messages/${orgB.message.id}`);
    expect(res.status).toBe(404);
  });

  it("cannot GET another organization's pickup request", async () => {
    const res = await agentA.get(`/api/pickups/${orgB.pickup.id}`);
    expect(res.status).toBe(404);
  });

  it("cannot PATCH another organization's pickup request", async () => {
    const res = await agentA.patch(`/api/pickups/${orgB.pickup.id}`).send({ status: "CANCELLED" });
    expect(res.status).toBe(404);

    const stillPending = await prisma.pickupRequest.findUnique({ where: { id: orgB.pickup.id } });
    expect(stillPending?.status).toBe("PENDING");
  });

  it("cannot GET another organization's driver or vehicle", async () => {
    const driverRes = await agentA.get(`/api/drivers/${orgB.driver.id}`);
    expect(driverRes.status).toBe(404);

    const vehicleRes = await agentA.get(`/api/vehicles/${orgB.vehicle.id}`);
    expect(vehicleRes.status).toBe(404);
  });

  it("sanity check: org B can access all the same resources for itself", async () => {
    expect((await agentB.get(`/api/farmers/${orgB.farmer.id}`)).status).toBe(200);
    expect((await agentB.get(`/api/conversations/${orgB.conversation.id}`)).status).toBe(200);
    expect((await agentB.get(`/api/conversations/${orgB.conversation.id}/messages`)).status).toBe(200);
    expect((await agentB.get(`/api/messages/${orgB.message.id}`)).status).toBe(200);
    expect((await agentB.get(`/api/pickups/${orgB.pickup.id}`)).status).toBe(200);
    expect((await agentB.get(`/api/drivers/${orgB.driver.id}`)).status).toBe(200);
    expect((await agentB.get(`/api/vehicles/${orgB.vehicle.id}`)).status).toBe(200);
  });

  it("rejects all of this without authentication in the first place", async () => {
    const res = await request(app).get("/api/farmers");
    expect(res.status).toBe(401);
  });
});
