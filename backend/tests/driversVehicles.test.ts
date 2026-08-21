// Phase 9: create/update for Driver and Vehicle (Phase 3 only built reads
// for these — CRUD is added now that the Fleet Management UI needs it).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app";
import { prisma } from "../src/lib/prisma";

describe("driver and vehicle CRUD", () => {
  let organizationId: string;
  let cookie: string[];

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { name: "Fleet Test Org", slug: `fleet-test-${Date.now()}` },
    });
    organizationId = organization.id;

    const email = `fleet-test-${Date.now()}@test.local`;
    await prisma.user.create({
      data: {
        organizationId,
        name: "Fleet Dispatcher",
        email,
        role: "DISPATCHER",
        passwordHash: await bcrypt.hash("TestPassword123!", 10),
      },
    });

    const loginRes = await request(app).post("/api/auth/login").send({ email, password: "TestPassword123!" });
    cookie = loginRes.headers["set-cookie"];
  });

  afterAll(async () => {
    await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  });

  it("creates and updates a driver", async () => {
    const createRes = await request(app)
      .post("/api/drivers")
      .set("Cookie", cookie)
      .send({ name: "New Driver", phoneNumber: "+15559997001" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.driver.status).toBe("ACTIVE");

    const updateRes = await request(app)
      .patch(`/api/drivers/${createRes.body.driver.id}`)
      .set("Cookie", cookie)
      .send({ status: "INACTIVE" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.driver.status).toBe("INACTIVE");
  });

  it("creates and updates a vehicle, optionally linked to a driver", async () => {
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Cookie", cookie)
      .send({ name: "Vehicle Owner", phoneNumber: "+15559997002" });
    const driverId = driverRes.body.driver.id;

    const createRes = await request(app)
      .post("/api/vehicles")
      .set("Cookie", cookie)
      .send({ name: "New Truck", registrationNumber: "REG-NEW-1", primaryDriverId: driverId });
    expect(createRes.status).toBe(201);
    expect(createRes.body.vehicle.primaryDriverId).toBe(driverId);

    const updateRes = await request(app)
      .patch(`/api/vehicles/${createRes.body.vehicle.id}`)
      .set("Cookie", cookie)
      .send({ status: "MAINTENANCE" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.vehicle.status).toBe("MAINTENANCE");
  });

  it("refuses to assign a driver who already primarily drives another vehicle", async () => {
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Cookie", cookie)
      .send({ name: "Busy Driver", phoneNumber: "+15559997003" });
    const driverId = driverRes.body.driver.id;

    await request(app)
      .post("/api/vehicles")
      .set("Cookie", cookie)
      .send({ name: "Truck One", registrationNumber: "REG-CONFLICT-1", primaryDriverId: driverId });

    const conflictRes = await request(app)
      .post("/api/vehicles")
      .set("Cookie", cookie)
      .send({ name: "Truck Two", registrationNumber: "REG-CONFLICT-2", primaryDriverId: driverId });
    expect(conflictRes.status).toBe(400);
  });

  it("allows re-saving a vehicle's own existing primaryDriverId without conflict", async () => {
    const driverRes = await request(app)
      .post("/api/drivers")
      .set("Cookie", cookie)
      .send({ name: "Self Driver", phoneNumber: "+15559997004" });
    const driverId = driverRes.body.driver.id;

    const vehicleRes = await request(app)
      .post("/api/vehicles")
      .set("Cookie", cookie)
      .send({ name: "Self Truck", registrationNumber: "REG-SELF-1", primaryDriverId: driverId });

    const updateRes = await request(app)
      .patch(`/api/vehicles/${vehicleRes.body.vehicle.id}`)
      .set("Cookie", cookie)
      .send({ primaryDriverId: driverId, name: "Self Truck Renamed" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.vehicle.name).toBe("Self Truck Renamed");
  });
});
