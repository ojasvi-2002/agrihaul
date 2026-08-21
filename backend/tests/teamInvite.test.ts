// Full email-based team invite loop (CLAUDE.md Phase 12's original
// "OWNER sets a password directly" flow, replaced now that email sending
// exists — see integrations/email/client.ts). The raw invite token is
// only ever available in memory at creation time (only its hash is
// stored) and the API deliberately never returns it — so these tests
// call team.service.ts's createInvite() directly to capture it, exactly
// as a real invitee would read it off their email link, then exercise
// every other step through the real HTTP API.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import * as teamService from "../src/services/team.service";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("team invites", () => {
  let organizationId: string;
  let organizationName: string;
  let ownerId: string;
  let ownerCookie: string[];
  let otherOrgId: string;
  let otherOrgOwnerCookie: string[];

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Invite Test Org", slug: `invite-test-${Date.now()}` },
    });
    organizationId = organization.id;
    organizationName = organization.name;

    const owner = await prisma.user.create({
      data: {
        organizationId,
        name: "Invite Test Owner",
        email: `invite-test-owner-${Date.now()}@test.local`,
        role: "OWNER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    ownerId = owner.id;
    const ownerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: owner.email, password: "TestPassword123!" });
    ownerCookie = ownerLogin.headers["set-cookie"];

    const otherOrg = await prisma.organization.create({
      data: { name: "Other Invite Test Org", slug: `invite-test-other-${Date.now()}` },
    });
    otherOrgId = otherOrg.id;
    const otherOwner = await prisma.user.create({
      data: {
        organizationId: otherOrgId,
        name: "Other Org Owner",
        email: `invite-test-other-owner-${Date.now()}@test.local`,
        role: "OWNER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const otherLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: otherOwner.email, password: "TestPassword123!" });
    otherOrgOwnerCookie = otherLogin.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.organization.delete({ where: { id: otherOrgId } });
    await prisma.$disconnect();
  });

  it("previews a valid invite without requiring a session, and rejects a bogus token", async () => {
    const email = `preview-${Date.now()}@test.local`;
    const invite = await teamService.createInvite(organizationId, ownerId, "OWNER", {
      name: "Preview Person",
      email,
      role: "DISPATCHER",
    });

    const valid = await request(app).get("/api/team/invites/preview").query({ token: invite.rawToken });
    expect(valid.status).toBe(200);
    expect(valid.body).toEqual({
      name: "Preview Person",
      email,
      role: "DISPATCHER",
      organizationName,
    });

    const bogus = await request(app).get("/api/team/invites/preview").query({ token: "not-a-real-token" });
    expect(bogus.status).toBe(400);
  });

  it("accepts an invite, creates the account, and logs the invitee straight in", async () => {
    const email = `accept-${Date.now()}@test.local`;
    const invite = await teamService.createInvite(organizationId, ownerId, "ADMIN", {
      name: "Accepted Person",
      email,
      role: "ADMIN",
    });

    const accept = await request(app)
      .post("/api/team/invites/accept")
      .send({ token: invite.rawToken, password: "BrandNewPassword123!" });
    expect(accept.status).toBe(201);
    expect(accept.body.user.role).toBe("ADMIN");
    expect(accept.body.organization.id).toBe(organizationId);
    expect(accept.headers["set-cookie"]).toBeDefined(); // logged in immediately, like signup

    // The new account actually works for a normal, separate login too.
    const login = await request(app).post("/api/auth/login").send({ email, password: "BrandNewPassword123!" });
    expect(login.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.organizationId).toBe(organizationId);
  });

  it("refuses to accept the same invite twice", async () => {
    const email = `accept-once-${Date.now()}@test.local`;
    const invite = await teamService.createInvite(organizationId, ownerId, "DISPATCHER", {
      name: "One Time Person",
      email,
      role: "DISPATCHER",
    });

    const first = await request(app)
      .post("/api/team/invites/accept")
      .send({ token: invite.rawToken, password: "Password123!" });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post("/api/team/invites/accept")
      .send({ token: invite.rawToken, password: "DifferentPassword123!" });
    expect(second.status).toBe(400);
  });

  it("won't invite an email that's already a real user in the organization", async () => {
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });

    const res = await request(app)
      .post("/api/team")
      .set("Cookie", ownerCookie)
      .send({ name: "Duplicate", email: owner!.email, role: "DISPATCHER" });
    expect(res.status).toBe(400);
  });

  it("lists and revokes pending invites, scoped to the calling organization", async () => {
    const email = `revoke-me-${Date.now()}@test.local`;
    const invite = await teamService.createInvite(organizationId, ownerId, "DISPATCHER", {
      name: "Revoke Me",
      email,
      role: "DISPATCHER",
    });

    const listed = await request(app).get("/api/team/invites").set("Cookie", ownerCookie);
    expect(listed.status).toBe(200);
    expect(listed.body.invites.map((i: { email: string }) => i.email)).toContain(email);

    // Never visible to a different organization.
    const otherListed = await request(app).get("/api/team/invites").set("Cookie", otherOrgOwnerCookie);
    expect(otherListed.body.invites.map((i: { email: string }) => i.email)).not.toContain(email);

    // A different org can't revoke it either — not found, not a leak.
    const wrongRevoke = await request(app)
      .delete(`/api/team/invites/${invite.id}`)
      .set("Cookie", otherOrgOwnerCookie);
    expect(wrongRevoke.status).toBe(404);

    const revoke = await request(app).delete(`/api/team/invites/${invite.id}`).set("Cookie", ownerCookie);
    expect(revoke.status).toBe(204);

    // Revoked — the accept link is dead now.
    const acceptAfterRevoke = await request(app)
      .post("/api/team/invites/accept")
      .send({ token: invite.rawToken, password: "Password123!" });
    expect(acceptAfterRevoke.status).toBe(400);
  });
});
