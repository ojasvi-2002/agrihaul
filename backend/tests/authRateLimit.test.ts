// Proves the login/signup rate limiters (rateLimit.middleware.ts) actually
// trigger, not just that they're wired up. Each `it` here needs its own
// fresh limiter window, so keep this the only file that hammers these
// routes past their limit — vitest's per-file module isolation gives each
// test file its own in-memory limiter store, but not each `it` within one.
import { describe, it, expect, afterAll } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("rate limiting on auth endpoints", () => {
  let signupRequestEmail: string | undefined;

  afterAll(async () => {
    if (signupRequestEmail) {
      await prisma.organizationSignupRequest.deleteMany({ where: { email: signupRequestEmail } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("blocks login attempts past the limit with 429, regardless of credentials", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app)
        .post("/api/auth/login")
        .send({ email: "nobody@test.local", password: "WrongPassword123!" });
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.message).toMatch(/too many/i);
  });

  it("blocks signup-request attempts past the limit with 429", async () => {
    const email = `rate-limit-signup-${Date.now()}@test.local`;
    signupRequestEmail = email;
    let last;
    for (let i = 0; i < 11; i++) {
      // Only the first of these succeeds (201); the rest 400 on the
      // still-pending duplicate request — every one of them still counts
      // against the limiter, since it runs before the controller either way.
      last = await request(app)
        .post("/api/signup-requests")
        .send({ organizationName: "Rate Limit Test Org", ownerName: "Owner", email });
    }
    expect(last!.status).toBe(429);
  });

  it("blocks platform-admin login attempts past its (stricter) limit with 429", async () => {
    let last;
    for (let i = 0; i < 6; i++) {
      last = await request(app)
        .post("/api/platform-admin/auth/login")
        .send({ email: "nobody@test.local", password: "WrongPassword123!" });
    }
    expect(last!.status).toBe(429);
    expect(last!.body.error.message).toMatch(/too many/i);
  });
});
