// "View as" mode (CLAUDE.md's role model + notes.png's "org admin can log
// in into any employee account", confirmed via AskUserQuestion as a
// banner-visible overlay with a full audit trail, never a silent session
// swap). Exercises the real HTTP API end to end — start/stop, permission
// boundaries while impersonating, and the ImpersonationLog audit trail.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("impersonation (\"view as\")", () => {
  let organizationId: string;
  let ownerCookie: string[];
  let dispatcherId: string;
  let otherAdminId: string;
  let dispatcherCookie: string[];
  let otherOrgId: string;
  let otherOrgDispatcherId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Impersonation Test Org", slug: `impersonation-test-${Date.now()}` },
    });
    organizationId = organization.id;

    const passwordHash = await bcrypt.hash("TestPassword123!", 10);

    const owner = await prisma.user.create({
      data: { organizationId, name: "Test Owner", email: `imp-owner-${Date.now()}@test.local`, role: "OWNER", passwordHash },
    });
    const ownerLogin = await request(app).post("/api/auth/login").send({ email: owner.email, password: "TestPassword123!" });
    ownerCookie = ownerLogin.headers["set-cookie"];

    const otherAdmin = await prisma.user.create({
      data: { organizationId, name: "Test Admin", email: `imp-admin-${Date.now()}@test.local`, role: "ADMIN", passwordHash },
    });
    otherAdminId = otherAdmin.id;

    const dispatcher = await prisma.user.create({
      data: { organizationId, name: "Test Dispatcher", email: `imp-dispatcher-${Date.now()}@test.local`, role: "DISPATCHER", passwordHash },
    });
    dispatcherId = dispatcher.id;
    const dispatcherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: dispatcher.email, password: "TestPassword123!" });
    dispatcherCookie = dispatcherLogin.headers["set-cookie"];

    const otherOrg = await prisma.organization.create({
      data: { name: "Other Impersonation Org", slug: `impersonation-test-other-${Date.now()}` },
    });
    otherOrgId = otherOrg.id;
    const otherOrgDispatcher = await prisma.user.create({
      data: {
        organizationId: otherOrgId,
        name: "Other Org Dispatcher",
        email: `imp-other-dispatcher-${Date.now()}@test.local`,
        role: "DISPATCHER",
        passwordHash,
      },
    });
    otherOrgDispatcherId = otherOrgDispatcher.id;
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
    await prisma.$disconnect();
  });

  it("lets an owner view as a dispatcher, and reverts on stop — with a banner-visible /me shape both ways", async () => {
    const start = await request(app).post(`/api/team/${dispatcherId}/impersonate`).set("Cookie", ownerCookie);
    expect(start.status).toBe(204);

    const meWhileViewing = await request(app).get("/api/auth/me").set("Cookie", ownerCookie);
    expect(meWhileViewing.status).toBe(200);
    expect(meWhileViewing.body.user.id).toBe(dispatcherId);
    expect(meWhileViewing.body.user.role).toBe("DISPATCHER");
    expect(meWhileViewing.body.user.impersonatedBy).toMatchObject({ role: "OWNER" });

    const log = await prisma.impersonationLog.findFirst({
      where: { organizationId, targetUserId: dispatcherId, endedAt: null },
    });
    expect(log).not.toBeNull();
    expect(log?.adminUserId).toBeDefined();

    const stop = await request(app).post("/api/auth/stop-impersonation").set("Cookie", ownerCookie);
    expect(stop.status).toBe(204);

    const meAfterStop = await request(app).get("/api/auth/me").set("Cookie", ownerCookie);
    expect(meAfterStop.body.user.role).toBe("OWNER");
    expect(meAfterStop.body.user.impersonatedBy).toBeFalsy();

    const closedLog = await prisma.impersonationLog.findUnique({ where: { id: log!.id } });
    expect(closedLog?.endedAt).not.toBeNull();
  });

  it("behaves exactly as the target dispatcher while viewing as them — no retained admin privileges", async () => {
    const start = await request(app).post(`/api/team/${dispatcherId}/impersonate`).set("Cookie", ownerCookie);
    expect(start.status).toBe(204);

    // OWNER/ADMIN-only action — must be rejected while the effective role
    // is DISPATCHER, proving this is a real permission overlay, not a
    // cosmetic banner on top of unchanged admin access.
    const inviteAttempt = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Should Fail", email: `should-fail-${Date.now()}@test.local`, role: "DISPATCHER" });
    expect(inviteAttempt.status).toBe(403);

    await request(app).post("/api/auth/stop-impersonation").set("Cookie", ownerCookie);
  });

  it("rejects a non-owner/admin trying to start impersonation", async () => {
    const res = await request(app).post(`/api/team/${otherAdminId}/impersonate`).set("Cookie", dispatcherCookie);
    expect(res.status).toBe(403);
  });

  it("rejects impersonating another owner/admin", async () => {
    const res = await request(app).post(`/api/team/${otherAdminId}/impersonate`).set("Cookie", ownerCookie);
    expect(res.status).toBe(403);
  });

  it("rejects impersonating a user in a different organization", async () => {
    const res = await request(app).post(`/api/team/${otherOrgDispatcherId}/impersonate`).set("Cookie", ownerCookie);
    expect(res.status).toBe(404);
  });

  it("blocks nested impersonation — starting a second one while already viewing as someone", async () => {
    const start = await request(app).post(`/api/team/${dispatcherId}/impersonate`).set("Cookie", ownerCookie);
    expect(start.status).toBe(204);

    // The effective role is now DISPATCHER, so the OWNER/ADMIN-only route
    // itself already refuses this — the service-level nested-impersonation
    // check is a second line of defense behind it.
    const nested = await request(app).post(`/api/team/${otherAdminId}/impersonate`).set("Cookie", ownerCookie);
    expect(nested.status).toBe(403);

    await request(app).post("/api/auth/stop-impersonation").set("Cookie", ownerCookie);
  });

  it("stopping impersonation when not impersonating anyone is a harmless no-op", async () => {
    const res = await request(app).post("/api/auth/stop-impersonation").set("Cookie", ownerCookie);
    expect(res.status).toBe(204);
  });

  it("closes the open impersonation log if the admin logs out while still viewing as someone", async () => {
    const start = await request(app).post(`/api/team/${dispatcherId}/impersonate`).set("Cookie", ownerCookie);
    expect(start.status).toBe(204);

    const log = await prisma.impersonationLog.findFirst({
      where: { organizationId, targetUserId: dispatcherId, endedAt: null },
      orderBy: { startedAt: "desc" },
    });
    expect(log).not.toBeNull();

    const logout = await request(app).post("/api/auth/logout").set("Cookie", ownerCookie);
    expect(logout.status).toBe(204);

    const closedLog = await prisma.impersonationLog.findUnique({ where: { id: log!.id } });
    expect(closedLog?.endedAt).not.toBeNull();

    // The session itself is gone too — logged out for real, not just
    // reverted to the admin's own identity.
    const meAfterLogout = await request(app).get("/api/auth/me").set("Cookie", ownerCookie);
    expect(meAfterLogout.status).toBe(401);

    // Re-establish ownerCookie for any tests that might run after this
    // one in the same file (none currently do, but keeps the suite from
    // being order-dependent if more are added later).
    const relogin = await request(app)
      .post("/api/auth/login")
      .send({ email: (await prisma.user.findFirst({ where: { organizationId, role: "OWNER" } }))!.email, password: "TestPassword123!" });
    ownerCookie = relogin.headers["set-cookie"];
  });
});
