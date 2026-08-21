// Integration test for GET /api/realtime/events — proves the full wire
// path: auth is required, a connected client actually receives an SSE
// frame when a real outbound message is created through the ordinary
// REST API (message.service.ts's broadcast call).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import http from "http";
import type { Server } from "http";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("GET /api/realtime/events", () => {
  let organizationId: string;
  let dispatcherCookie: string[];
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Realtime Test Org", slug: `realtime-test-${Date.now()}` },
    });
    organizationId = organization.id;

    await prisma.organizationPhoneNumber.create({
      data: { organizationId, phoneNumber: "+15559990102", twilioPhoneNumber: "+15559990102" },
    });

    const dispatcher = await prisma.user.create({
      data: {
        organizationId,
        name: "Realtime Dispatcher",
        email: `realtime-test-${Date.now()}@test.local`,
        role: "DISPATCHER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: dispatcher.email, password: "TestPassword123!" });
    dispatcherCookie = login.headers["set-cookie"];

    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Failed to start test server");
    port = address.port;
  });

  afterAll(async () => {
    server.close();
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("rejects an unauthenticated connection", async () => {
    const res = await request(app).get("/api/realtime/events");
    expect(res.status).toBe(401);
  });

  it("streams a live broadcast to a connected, authenticated client", async () => {
    const farmer = await prisma.farmer.create({
      data: { organizationId, name: "SSE Farmer", phoneNumber: "+15559990101" },
    });
    const conversation = await prisma.conversation.create({
      data: { organizationId, farmerId: farmer.id, channel: "SMS", status: "OPEN" },
    });

    // supertest's Set-Cookie strings carry attributes (Path=, Expires=,
    // ...) — only the name=value pair before the first ";" is valid in a
    // request's Cookie header.
    const cookiePair = dispatcherCookie[0].split(";")[0];

    const received = await new Promise<string>((resolve, reject) => {
      const req = http.get(
        { hostname: "127.0.0.1", port, path: "/api/realtime/events", headers: { Cookie: cookiePair } },
        (res) => {
          let buffer = "";
          const timeout = setTimeout(() => {
            req.destroy();
            reject(new Error("Timed out waiting for the broadcast SSE event"));
          }, 5000);
          res.on("data", (chunk) => {
            buffer += chunk.toString();
            if (buffer.includes("event: message")) {
              clearTimeout(timeout);
              req.destroy();
              resolve(buffer);
            }
          });
          res.on("error", reject);
        },
      );
      req.on("error", reject);

      // Give the SSE connection a moment to actually register as a
      // subscriber (subscribe() runs synchronously in the handler, but
      // the socket needs to actually be open) before triggering the
      // broadcast through the ordinary REST path.
      setTimeout(() => {
        request(app)
          .post(`/api/conversations/${conversation.id}/messages`)
          .set("Cookie", dispatcherCookie)
          .send({ body: "Hello via realtime" })
          .catch(reject);
      }, 200);
    });

    expect(received).toContain("event: message");
    expect(received).toContain("Hello via realtime");
    expect(received).toContain(conversation.id);
  });
});
