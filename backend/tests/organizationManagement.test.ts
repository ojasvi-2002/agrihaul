// CLAUDE.md Phase 12 — organization-aware onboarding: signup (create
// org + owner), phone number configuration, and team invitation, all
// gated by the new OWNER/ADMIN role check.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

// Self-serve signup no longer creates an account directly (developer's
// explicit decision, 2026-08-24): it only files a request, which a
// platform admin must approve before the Organization/User ever exists.
describe("organization signup requests", () => {
  const createdOrgIds: string[] = [];
  let adminCookie: string[];

  beforeAll(async () => {
    const email = `signup-request-admin-${Date.now()}@agrihaul.internal`;
    await prisma.platformAdmin.create({
      data: { name: "Signup Request Test Admin", email, passwordHash: await bcrypt.hash("AdminPassword123!", 10) },
    });
    const loginRes = await request(app)
      .post("/api/platform-admin/auth/login")
      .send({ email, password: "AdminPassword123!" });
    adminCookie = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    for (const id of createdOrgIds) {
      await prisma.organization.delete({ where: { id } }).catch(() => {});
    }
  });

  it("files a request without creating an account or logging anyone in", async () => {
    const email = `signup-request-${Date.now()}@test.local`;
    const res = await request(app)
      .post("/api/signup-requests")
      .send({ organizationName: "Brand New Org", ownerName: "New Owner", email });

    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]).toBeUndefined();

    const stored = await prisma.organizationSignupRequest.findFirst({ where: { email } });
    expect(stored?.status).toBe("PENDING");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects a duplicate request while one is still pending for that email", async () => {
    const email = `signup-request-dup-${Date.now()}@test.local`;
    const first = await request(app)
      .post("/api/signup-requests")
      .send({ organizationName: "First Org", ownerName: "Owner", email });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/signup-requests")
      .send({ organizationName: "Second Org", ownerName: "Owner", email });
    expect(second.status).toBe(400);
  });

  it("rejects a request for an email that's already a real user", async () => {
    const email = `signup-request-existing-${Date.now()}@test.local`;
    const org = await prisma.organization.create({
      data: { name: "Existing User Org", slug: `existing-user-org-${Date.now()}` },
    });
    createdOrgIds.push(org.id);
    await prisma.user.create({
      data: { organizationId: org.id, name: "Existing", email, role: "OWNER", passwordHash: "x" },
    });

    const res = await request(app)
      .post("/api/signup-requests")
      .send({ organizationName: "Another Org", ownerName: "Owner", email });
    expect(res.status).toBe(400);
  });

  it("lists pending requests for the platform admin, newest first", async () => {
    const email = `signup-request-list-${Date.now()}@test.local`;
    await request(app)
      .post("/api/signup-requests")
      .send({ organizationName: "Listed Org", ownerName: "Owner", email });

    const listed = await request(app).get("/api/platform-admin/signup-requests").set("Cookie", adminCookie);
    expect(listed.status).toBe(200);
    expect(listed.body.requests.map((r: { email: string }) => r.email)).toContain(email);
  });

  it("refuses list/approve/reject to anyone but a platform admin", async () => {
    const unauth = await request(app).get("/api/platform-admin/signup-requests");
    expect(unauth.status).toBe(401);
  });

  it("approving creates the organization and an OWNER invite, and can't be approved twice", async () => {
    const email = `signup-request-approve-${Date.now()}@test.local`;
    const submitted = await request(app)
      .post("/api/signup-requests")
      .send({ organizationName: "Approved Org", ownerName: "Future Owner", email });
    expect(submitted.status).toBe(201);

    const request_ = await prisma.organizationSignupRequest.findFirstOrThrow({ where: { email } });

    const approve = await request(app)
      .post(`/api/platform-admin/signup-requests/${request_.id}/approve`)
      .set("Cookie", adminCookie);
    expect(approve.status).toBe(200);
    expect(approve.body.organization.name).toBe("Approved Org");
    createdOrgIds.push(approve.body.organization.id);

    const invite = await prisma.teamInvite.findFirst({ where: { organizationId: approve.body.organization.id, email } });
    expect(invite?.role).toBe("OWNER");
    expect(invite?.invitedByUserId).toBeNull();

    const reviewed = await prisma.organizationSignupRequest.findUnique({ where: { id: request_.id } });
    expect(reviewed?.status).toBe("APPROVED");
    expect(reviewed?.createdOrganizationId).toBe(approve.body.organization.id);

    const secondApprove = await request(app)
      .post(`/api/platform-admin/signup-requests/${request_.id}/approve`)
      .set("Cookie", adminCookie);
    expect(secondApprove.status).toBe(400);
  });

  it("rejecting marks the request rejected without creating an organization", async () => {
    const email = `signup-request-reject-${Date.now()}@test.local`;
    await request(app).post("/api/signup-requests").send({ organizationName: "Rejected Org", ownerName: "Owner", email });
    const request_ = await prisma.organizationSignupRequest.findFirstOrThrow({ where: { email } });

    const reject = await request(app)
      .post(`/api/platform-admin/signup-requests/${request_.id}/reject`)
      .set("Cookie", adminCookie);
    expect(reject.status).toBe(204);

    const reviewed = await prisma.organizationSignupRequest.findUnique({ where: { id: request_.id } });
    expect(reviewed?.status).toBe("REJECTED");
    expect(reviewed?.createdOrganizationId).toBeNull();
    expect(await prisma.organization.findFirst({ where: { name: "Rejected Org" } })).toBeNull();
  });
});

describe("organization settings, phone numbers, and team management", () => {
  let organizationId: string;
  let ownerCookie: string[];
  let dispatcherCookie: string[];
  let adminCookie: string[];
  let otherOrgId: string;
  let otherOrgOwnerCookie: string[];

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Org Mgmt Test Org", slug: `org-mgmt-test-${Date.now()}` },
    });
    organizationId = organization.id;

    const ownerEmail = `org-mgmt-owner-${Date.now()}@test.local`;
    await prisma.user.create({
      data: {
        organizationId,
        name: "Test Owner",
        email: ownerEmail,
        role: "OWNER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const ownerLogin = await request(app).post("/api/auth/login").send({ email: ownerEmail, password: "TestPassword123!" });
    ownerCookie = ownerLogin.headers["set-cookie"];

    const dispatcherEmail = `org-mgmt-dispatcher-${Date.now()}@test.local`;
    await prisma.user.create({
      data: {
        organizationId,
        name: "Test Dispatcher",
        email: dispatcherEmail,
        role: "DISPATCHER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const dispatcherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: dispatcherEmail, password: "TestPassword123!" });
    dispatcherCookie = dispatcherLogin.headers["set-cookie"];

    const adminEmail = `org-mgmt-admin-${Date.now()}@test.local`;
    await prisma.user.create({
      data: {
        organizationId,
        name: "Test Admin",
        email: adminEmail,
        role: "ADMIN",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const adminLogin = await request(app).post("/api/auth/login").send({ email: adminEmail, password: "TestPassword123!" });
    adminCookie = adminLogin.headers["set-cookie"];

    const otherOrg = await prisma.organization.create({
      data: { name: "Other Org", slug: `org-mgmt-other-${Date.now()}` },
    });
    otherOrgId = otherOrg.id;
    const otherOwnerEmail = `org-mgmt-other-owner-${Date.now()}@test.local`;
    await prisma.user.create({
      data: {
        organizationId: otherOrgId,
        name: "Other Owner",
        email: otherOwnerEmail,
        role: "OWNER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const otherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: otherOwnerEmail, password: "TestPassword123!" });
    otherOrgOwnerCookie = otherLogin.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
    await prisma.$disconnect();
  });

  it("lets an OWNER rename the organization, but not a DISPATCHER", async () => {
    const forbidden = await request(app)
      .patch("/api/organizations/current")
      .set("Cookie", dispatcherCookie)
      .send({ name: "Hacked Name" });
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .patch("/api/organizations/current")
      .set("Cookie", ownerCookie)
      .send({ name: "Renamed Org" });
    expect(allowed.status).toBe(200);

    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    expect(org?.name).toBe("Renamed Org");
  });

  it("lets an OWNER add a phone number, but not a DISPATCHER", async () => {
    const forbidden = await request(app)
      .post("/api/organizations/current/phone-numbers")
      .set("Cookie", dispatcherCookie)
      .send({ twilioPhoneNumber: "+15559990001" });
    expect(forbidden.status).toBe(403);

    const allowed = await request(app)
      .post("/api/organizations/current/phone-numbers")
      .set("Cookie", ownerCookie)
      .send({ twilioPhoneNumber: "+15559990001", friendlyName: "Main line" });
    expect(allowed.status).toBe(201);
    expect(allowed.body.phoneNumber.active).toBe(true);
  });

  it("rejects a phone number not in E.164 format", async () => {
    const res = await request(app)
      .post("/api/organizations/current/phone-numbers")
      .set("Cookie", ownerCookie)
      .send({ twilioPhoneNumber: "0771234567" });
    expect(res.status).toBe(400);
  });

  it("refuses a phone number already registered to another organization", async () => {
    const res = await request(app)
      .post("/api/organizations/current/phone-numbers")
      .set("Cookie", otherOrgOwnerCookie)
      .send({ twilioPhoneNumber: "+15559990001" }); // already claimed above
    expect(res.status).toBe(400);
  });

  it("lets an OWNER deactivate a phone number", async () => {
    const listRes = await request(app).get("/api/organizations/current/phone-numbers").set("Cookie", ownerCookie);
    const phoneId = listRes.body.phoneNumbers[0].id;

    const res = await request(app)
      .patch(`/api/organizations/current/phone-numbers/${phoneId}`)
      .set("Cookie", ownerCookie)
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.phoneNumber.active).toBe(false);
  });

  it("does not leak phone numbers across organizations", async () => {
    const res = await request(app).get("/api/organizations/current/phone-numbers").set("Cookie", otherOrgOwnerCookie);
    expect(res.body.phoneNumbers).toHaveLength(0);
  });

  it("lets an OWNER create a team invite, but not a DISPATCHER", async () => {
    const forbidden = await request(app)
      .post("/api/team")
      .set("Cookie", dispatcherCookie)
      .send({ name: "New Hire", email: `nope-${Date.now()}@test.local`, role: "DISPATCHER" });
    expect(forbidden.status).toBe(403);

    const newEmail = `invited-${Date.now()}@test.local`;
    const inviteRes = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "New Hire", email: newEmail, role: "DISPATCHER" });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.invite.role).toBe("DISPATCHER");
    // Inviting alone must not create a usable account — only accepting
    // the invite does (see tests/teamInvite.test.ts for that full loop).
    const loginAttempt = await request(app).post("/api/auth/login").send({ email: newEmail, password: "anything" });
    expect(loginAttempt.status).toBe(401);
  });

  it("never includes passwordHash in the team list response", async () => {
    const res = await request(app).get("/api/team").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    for (const user of res.body.users) {
      expect(user.passwordHash).toBeUndefined();
    }
  });

  it("does not let an ADMIN grant the OWNER role, only an OWNER can", async () => {
    const asAdmin = await request(app)
      .post("/api/team")
      .set("Cookie", adminCookie)
      .send({ name: "Sneaky", email: `escalate-${Date.now()}@test.local`, role: "OWNER" });
    expect(asAdmin.status).toBe(403);

    const asOwner = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Second Owner", email: `second-owner-${Date.now()}@test.local`, role: "OWNER" });
    expect(asOwner.status).toBe(201);
    expect(asOwner.body.invite.role).toBe("OWNER");
  });

  it("rejects inviting an email that already has a pending invite", async () => {
    const email = `org-mgmt-owner-conflict-${Date.now()}@test.local`;
    const first = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Dup", email, role: "DISPATCHER" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Dup Again", email, role: "DISPATCHER" });
    expect(second.status).toBe(400);
  });

  it("lists exactly this organization's team (actual users, not pending invites), not another org's", async () => {
    const res = await request(app).get("/api/team").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    const names = res.body.users.map((u: { name: string }) => u.name);
    expect(names).toContain("Test Owner");
    expect(names).toContain("Test Dispatcher");
    expect(names).not.toContain("New Hire"); // only invited, never accepted — not a real user
    expect(names).not.toContain("Other Owner");

    const otherRes = await request(app).get("/api/team").set("Cookie", otherOrgOwnerCookie);
    const otherNames = otherRes.body.users.map((u: { name: string }) => u.name);
    expect(otherNames).not.toContain("Test Dispatcher");
  });
});
