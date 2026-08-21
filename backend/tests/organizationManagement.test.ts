// CLAUDE.md Phase 12 — organization-aware onboarding: signup (create
// org + owner), phone number configuration, and team invitation, all
// gated by the new OWNER/ADMIN role check.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("signup", () => {
  const createdOrgIds: string[] = [];

  afterAll(async () => {
    for (const id of createdOrgIds) {
      await prisma.organization.delete({ where: { id } }).catch(() => {});
    }
  });

  it("creates a new organization and owner, and logs them in immediately", async () => {
    const email = `signup-test-${Date.now()}@test.local`;
    const res = await request(app).post("/api/auth/signup").send({
      organizationName: "Brand New Org",
      ownerName: "New Owner",
      email,
      password: "SignupPassword123!",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("OWNER");
    expect(res.body.organization.name).toBe("Brand New Org");
    expect(res.headers["set-cookie"]).toBeDefined();
    createdOrgIds.push(res.body.organization.id);

    // Actually logged in — the session cookie works immediately.
    const meRes = await request(app).get("/api/auth/me").set("Cookie", res.headers["set-cookie"]);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(email);
  });

  it("gives two organizations with the same name different slugs", async () => {
    const email1 = `signup-collide-1-${Date.now()}@test.local`;
    const email2 = `signup-collide-2-${Date.now()}@test.local`;

    const res1 = await request(app)
      .post("/api/auth/signup")
      .send({ organizationName: "Same Name Co", ownerName: "Owner One", email: email1, password: "Password123!" });
    const res2 = await request(app)
      .post("/api/auth/signup")
      .send({ organizationName: "Same Name Co", ownerName: "Owner Two", email: email2, password: "Password123!" });

    createdOrgIds.push(res1.body.organization.id, res2.body.organization.id);
    expect(res1.body.organization.slug).not.toBe(res2.body.organization.slug);
  });

  it("rejects signup with an email that's already in use", async () => {
    const email = `signup-dup-${Date.now()}@test.local`;
    const first = await request(app)
      .post("/api/auth/signup")
      .send({ organizationName: "First Org", ownerName: "Owner", email, password: "Password123!" });
    createdOrgIds.push(first.body.organization.id);

    const second = await request(app)
      .post("/api/auth/signup")
      .send({ organizationName: "Second Org", ownerName: "Owner", email, password: "Password123!" });
    expect(second.status).toBe(400);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      organizationName: "Short Password Org",
      ownerName: "Owner",
      email: `signup-short-${Date.now()}@test.local`,
      password: "short",
    });
    expect(res.status).toBe(400);
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

  it("lets an OWNER invite a teammate who can then log in, but not a DISPATCHER", async () => {
    const forbidden = await request(app)
      .post("/api/team")
      .set("Cookie", dispatcherCookie)
      .send({ name: "New Hire", email: `nope-${Date.now()}@test.local`, role: "DISPATCHER", password: "Password123!" });
    expect(forbidden.status).toBe(403);

    const newEmail = `invited-${Date.now()}@test.local`;
    const inviteRes = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "New Hire", email: newEmail, role: "DISPATCHER", password: "Password123!" });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.user.role).toBe("DISPATCHER");

    const loginRes = await request(app).post("/api/auth/login").send({ email: newEmail, password: "Password123!" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.organization.id).toBe(organizationId);
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
      .send({ name: "Sneaky", email: `escalate-${Date.now()}@test.local`, role: "OWNER", password: "Password123!" });
    expect(asAdmin.status).toBe(403);

    const asOwner = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Second Owner", email: `second-owner-${Date.now()}@test.local`, role: "OWNER", password: "Password123!" });
    expect(asOwner.status).toBe(201);
    expect(asOwner.body.user.role).toBe("OWNER");
  });

  it("rejects inviting a teammate with an email already in use", async () => {
    const email = `org-mgmt-owner-conflict-${Date.now()}@test.local`;
    const first = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Dup", email, role: "DISPATCHER", password: "Password123!" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Dup Again", email, role: "DISPATCHER", password: "Password123!" });
    expect(second.status).toBe(400);
  });

  it("lists exactly this organization's team, not another org's", async () => {
    const res = await request(app).get("/api/team").set("Cookie", ownerCookie);
    expect(res.status).toBe(200);
    const names = res.body.users.map((u: { name: string }) => u.name);
    expect(names).toContain("Test Owner");
    expect(names).toContain("Test Dispatcher");
    expect(names).toContain("New Hire");
    expect(names).not.toContain("Other Owner");

    const otherRes = await request(app).get("/api/team").set("Cookie", otherOrgOwnerCookie);
    const otherNames = otherRes.body.users.map((u: { name: string }) => u.name);
    expect(otherNames).not.toContain("Test Dispatcher");
    expect(otherNames).not.toContain("New Hire");
  });
});
