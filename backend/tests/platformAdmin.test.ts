// CLAUDE.md §34/Phase 13 — platform administration, deliberately a
// separate identity/session realm from organization users (not a role
// on User). Covers: platform-admin auth, org list/create/suspend, that
// suspension actually blocks the org's own users from logging in, and
// that the two auth realms can never be used interchangeably.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("platform admin", () => {
  let adminId: string;
  let adminCookie: string[];
  let testOrgId: string;
  let testOrgOwnerEmail: string;

  beforeAll(async () => {
    const email = `platform-admin-test-${Date.now()}@agrihaul.internal`;
    const admin = await prisma.platformAdmin.create({
      data: { name: "Test Platform Admin", email, passwordHash: await bcrypt.hash("AdminPassword123!", 10) },
    });
    adminId = admin.id;

    const loginRes = await request(app)
      .post("/api/platform-admin/auth/login")
      .send({ email, password: "AdminPassword123!" });
    adminCookie = loginRes.headers["set-cookie"];

    const org = await prisma.organization.create({
      data: { name: "Platform Admin Target Org", slug: `platform-admin-target-${Date.now()}` },
    });
    testOrgId = org.id;
    testOrgOwnerEmail = `platform-admin-target-owner-${Date.now()}@test.local`;
    await prisma.user.create({
      data: {
        organizationId: testOrgId,
        name: "Target Owner",
        email: testOrgOwnerEmail,
        role: "OWNER",
        passwordHash: await bcrypt.hash("OwnerPassword123!", 10),
      },
    });
  });

  afterAll(async () => {
    await prisma.platformAdmin.delete({ where: { id: adminId } });
    await prisma.organization.delete({ where: { id: testOrgId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it("logs a platform admin in and confirms identity via /me", async () => {
    expect(adminCookie).toBeDefined();
    const res = await request(app).get("/api/platform-admin/auth/me").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.admin.id).toBe(adminId);
  });

  it("rejects wrong credentials", async () => {
    const res = await request(app)
      .post("/api/platform-admin/auth/login")
      .send({ email: "nobody@agrihaul.internal", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("rejects platform-admin routes without a session", async () => {
    const res = await request(app).get("/api/platform-admin/organizations");
    expect(res.status).toBe(401);
  });

  it("an organization user's session cannot access platform-admin routes", async () => {
    const orgLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: testOrgOwnerEmail, password: "OwnerPassword123!" });
    const orgUserCookie = orgLogin.headers["set-cookie"];

    const res = await request(app).get("/api/platform-admin/organizations").set("Cookie", orgUserCookie);
    expect(res.status).toBe(401); // different cookie name entirely — never even recognized
  });

  it("a platform-admin session cannot access organization-user routes", async () => {
    const res = await request(app).get("/api/auth/me").set("Cookie", adminCookie);
    expect(res.status).toBe(401);
  });

  it("lists organizations with basic counts, spanning every tenant", async () => {
    const res = await request(app).get("/api/platform-admin/organizations").set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    const org = res.body.organizations.find((o: { id: string }) => o.id === testOrgId);
    expect(org).toBeDefined();
    expect(org._count.users).toBe(1);
  });

  it("creates a new organization with an owner who can immediately log in", async () => {
    const email = `platform-admin-created-${Date.now()}@test.local`;
    const res = await request(app)
      .post("/api/platform-admin/organizations")
      .set("Cookie", adminCookie)
      .send({ organizationName: "Admin Created Org", ownerName: "New Owner", email, password: "Password123!" });
    expect(res.status).toBe(201);

    const loginRes = await request(app).post("/api/auth/login").send({ email, password: "Password123!" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe("OWNER");

    await prisma.organization.delete({ where: { id: res.body.organization.id } });
  });

  it("suspending an organization actually blocks its users from using the API, not just a status label", async () => {
    const orgLoginBefore = await request(app)
      .post("/api/auth/login")
      .send({ email: testOrgOwnerEmail, password: "OwnerPassword123!" });
    expect(orgLoginBefore.status).toBe(200); // works before suspension
    const cookieBeforeSuspend = orgLoginBefore.headers["set-cookie"];

    const suspendRes = await request(app)
      .post(`/api/platform-admin/organizations/${testOrgId}/suspend`)
      .set("Cookie", adminCookie);
    expect(suspendRes.status).toBe(200);

    // An already-issued session for that org is now blocked too.
    const blockedRes = await request(app).get("/api/farmers").set("Cookie", cookieBeforeSuspend);
    expect(blockedRes.status).toBe(403);

    // A fresh login attempt is rejected immediately, with a clear
    // reason, rather than succeeding and then hitting a wall everywhere.
    const loginWhileSuspended = await request(app)
      .post("/api/auth/login")
      .send({ email: testOrgOwnerEmail, password: "OwnerPassword123!" });
    expect(loginWhileSuspended.status).toBe(403);

    const org = await prisma.organization.findUnique({ where: { id: testOrgId } });
    expect(org?.status).toBe("SUSPENDED");
  });

  it("reactivating restores access", async () => {
    const activateRes = await request(app)
      .post(`/api/platform-admin/organizations/${testOrgId}/activate`)
      .set("Cookie", adminCookie);
    expect(activateRes.status).toBe(200);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: testOrgOwnerEmail, password: "OwnerPassword123!" });
    expect(loginRes.status).toBe(200);

    const res = await request(app).get("/api/farmers").set("Cookie", loginRes.headers["set-cookie"]);
    expect(res.status).toBe(200);
  });

  it("logs the platform admin out, invalidating the session", async () => {
    const logoutRes = await request(app).post("/api/platform-admin/auth/logout").set("Cookie", adminCookie);
    expect(logoutRes.status).toBe(204);

    const meRes = await request(app).get("/api/platform-admin/auth/me").set("Cookie", adminCookie);
    expect(meRes.status).toBe(401);

    // Re-login for any tests that might run after this in the same file.
    const admin = await prisma.platformAdmin.findUnique({ where: { id: adminId } });
    const reLogin = await request(app)
      .post("/api/platform-admin/auth/login")
      .send({ email: admin!.email, password: "AdminPassword123!" });
    adminCookie = reLogin.headers["set-cookie"];
  });
});
