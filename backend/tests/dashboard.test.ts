// CLAUDE.md §32 — dashboard built on top of existing data, not before it.
// Covers: real counts per metric, and that the counts are correctly
// scoped to the caller's own organization (never another tenant's).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("GET /api/dashboard/stats", () => {
  let organizationId: string;
  let dispatcherCookie: string[];
  let otherOrgId: string;
  let otherOrgCookie: string[];

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Dashboard Test Org", slug: `dashboard-test-${Date.now()}` },
    });
    organizationId = organization.id;

    const dispatcher = await prisma.user.create({
      data: {
        organizationId,
        name: "Dashboard Dispatcher",
        email: `dashboard-test-${Date.now()}@test.local`,
        role: "DISPATCHER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: dispatcher.email, password: "TestPassword123!" });
    dispatcherCookie = login.headers["set-cookie"];

    const farmer = await prisma.farmer.create({
      data: { organizationId, name: "Dashboard Farmer", phoneNumber: `+1${Date.now()}`.slice(0, 15) },
    });

    // One of each status this dashboard counts, so every metric has a
    // real, non-zero, distinguishable value to assert on.
    await prisma.pickupRequest.create({ data: { organizationId, farmerId: farmer.id, status: "PENDING" } });
    await prisma.pickupRequest.create({ data: { organizationId, farmerId: farmer.id, status: "CONFIRMED" } });
    await prisma.pickupRequest.create({ data: { organizationId, farmerId: farmer.id, status: "COMPLETED" } });

    await prisma.driver.create({
      data: { organizationId, name: "Active Driver", phoneNumber: `+2${Date.now()}`.slice(0, 15), status: "ACTIVE" },
    });
    await prisma.driver.create({
      data: {
        organizationId,
        name: "Inactive Driver",
        phoneNumber: `+3${Date.now()}`.slice(0, 15),
        status: "INACTIVE",
      },
    });

    const conversation = await prisma.conversation.create({ data: { organizationId, farmerId: farmer.id } });
    await prisma.message.create({
      data: {
        organizationId,
        conversationId: conversation.id,
        direction: "INBOUND",
        status: "RECEIVED",
        sender: farmer.phoneNumber,
        recipient: "+15550000000",
        body: "unclear message",
        needsReview: true,
      },
    });

    // A second, unrelated organization with its own data — proves the
    // stats never leak across tenants.
    const otherOrg = await prisma.organization.create({
      data: { name: "Dashboard Other Org", slug: `dashboard-other-${Date.now()}` },
    });
    otherOrgId = otherOrg.id;
    const otherUser = await prisma.user.create({
      data: {
        organizationId: otherOrgId,
        name: "Other Org User",
        email: `dashboard-other-${Date.now()}@test.local`,
        role: "OWNER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const otherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: otherUser.email, password: "TestPassword123!" });
    otherOrgCookie = otherLogin.headers["set-cookie"];

    const otherFarmer = await prisma.farmer.create({
      data: { organizationId: otherOrgId, name: "Other Farmer", phoneNumber: `+4${Date.now()}`.slice(0, 15) },
    });
    // Five PENDING pickups in the other org — if this ever leaked into
    // the target org's count, the assertion below would catch it.
    for (let i = 0; i < 5; i++) {
      await prisma.pickupRequest.create({
        data: { organizationId: otherOrgId, farmerId: otherFarmer.id, status: "PENDING" },
      });
    }
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
    await prisma.$disconnect();
  });

  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/dashboard/stats");
    expect(res.status).toBe(401);
  });

  it("returns real counts scoped to the caller's own organization only", async () => {
    const res = await request(app).get("/api/dashboard/stats").set("Cookie", dispatcherCookie);
    expect(res.status).toBe(200);
    expect(res.body.stats).toEqual({
      pendingPickups: 1,
      unassignedPickups: 1,
      pickupsToday: 3,
      completedToday: 1,
      activeDrivers: 1,
      messagesNeedingReview: 1,
    });
  });

  it("never reflects another organization's data", async () => {
    const res = await request(app).get("/api/dashboard/stats").set("Cookie", otherOrgCookie);
    expect(res.status).toBe(200);
    expect(res.body.stats.pendingPickups).toBe(5);
    expect(res.body.stats.activeDrivers).toBe(0);
  });
});
