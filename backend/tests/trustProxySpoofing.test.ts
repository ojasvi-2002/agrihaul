// Proves the trust-proxy fix (app.ts's `trust proxy` now driven by
// env.trustProxyHops, defaulting to 0) actually closes the rate-limit
// bypass: with `trust proxy: true` (the old setting), a client could send
// a different X-Forwarded-For value on every request and get bucketed as
// a "new" IP each time, defeating loginRateLimiter entirely. Kept in its
// own file, like authRateLimit.test.ts, since it needs a fresh in-memory
// limiter store (see vitest.config.mts's isolate: true).
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app";

describe("trust proxy vs. rate limiting", () => {
  it("still enforces the login limit even when every request claims a different X-Forwarded-For IP", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", `10.0.0.${i}`) // a different apparent client IP each time
        .send({ email: "nobody-spoof@test.local", password: "WrongPassword123!" });
    }
    // If the spoofed header were trusted, all 11 would land in different
    // buckets and none would ever hit 429 — trust proxy defaulting to 0
    // means express-rate-limit keys on the real socket address instead,
    // so this behaves identically to no header being sent at all.
    expect(last!.status).toBe(429);
  });
});
