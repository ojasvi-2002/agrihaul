// Development seed data — two organizations with data across every entity,
// specifically so Phase 3's tenant-isolation tests have two real tenants to
// prove isolation between. Safe to re-run: wipes and recreates all rows.
//
// @prisma/client resolves via ancestor node_modules lookup to the repo
// root — see prisma.config.ts and database/prisma/schema.prisma's
// generator `output`.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Dev-only login for every seeded user. Never used outside local seed data.
const SEED_PASSWORD = "DevPassword123!";

type OrgSeed = {
  name: string;
  slug: string;
  twilioPhoneNumber: string;
  users: { name: string; email: string; role: "OWNER" | "DISPATCHER" }[];
  farmers: {
    name: string;
    phoneNumber: string;
    farm: { name: string; address: string; latitude: number; longitude: number };
  }[];
  drivers: { name: string; phoneNumber: string }[];
  vehicles: {
    name: string;
    registrationNumber: string;
    capacity: number;
    location:
      | { source: "GPS"; lat: number; lon: number }
      | { source: "SMS_REPORTED"; lat: number; lon: number; hoursAgo: number };
  }[];
};

const ORG_SEEDS: OrgSeed[] = [
  {
    name: "Green Farms",
    slug: "green-farms",
    twilioPhoneNumber: "+15550001001",
    users: [
      { name: "Adaeze Okafor", email: "adaeze@greenfarms.test", role: "OWNER" },
      { name: "Tunde Bello", email: "tunde@greenfarms.test", role: "DISPATCHER" },
    ],
    farmers: [
      {
        name: "Amina Diallo",
        phoneNumber: "+221770000001",
        farm: { name: "Diallo Homestead", address: "Thiès, Senegal", latitude: 14.7833, longitude: -16.924 },
      },
      {
        name: "Kofi Mensah",
        phoneNumber: "+233240000002",
        farm: { name: "Mensah Cocoa Plot", address: "Kumasi, Ghana", latitude: 6.6885, longitude: -1.6244 },
      },
      {
        name: "Fatou Traoré",
        phoneNumber: "+225070000003",
        farm: { name: "Traoré Cassava Field", address: "Bouaké, Côte d'Ivoire", latitude: 7.6881, longitude: -5.0317 },
      },
    ],
    drivers: [
      { name: "Ibrahim Bah", phoneNumber: "+221771000001" },
      { name: "Moussa Coulibaly", phoneNumber: "+223661000002" },
    ],
    vehicles: [
      {
        name: "Truck 1",
        registrationNumber: "GF-TRK-001",
        capacity: 2000,
        location: { source: "GPS", lat: 14.6928, lon: -17.4467 },
      },
      {
        name: "Truck 2",
        registrationNumber: "GF-TRK-002",
        capacity: 1500,
        location: { source: "SMS_REPORTED", lat: 12.6392, lon: -8.0029, hoursAgo: 3 },
      },
    ],
  },
  {
    name: "Agricul",
    slug: "agricul",
    twilioPhoneNumber: "+15550002002",
    users: [
      { name: "Priya Nair", email: "priya@agricul.test", role: "OWNER" },
      { name: "Marco Silva", email: "marco@agricul.test", role: "DISPATCHER" },
    ],
    farmers: [
      {
        name: "Ramesh Patil",
        phoneNumber: "+919820000004",
        farm: { name: "Patil Millet Farm", address: "Nashik, India", latitude: 19.9975, longitude: 73.7898 },
      },
      {
        name: "Sunita Deshmukh",
        phoneNumber: "+919820000005",
        farm: { name: "Deshmukh Orchard", address: "Aurangabad, India", latitude: 19.8762, longitude: 75.3433 },
      },
      {
        name: "Vikram Rao",
        phoneNumber: "+919820000006",
        farm: { name: "Rao Cotton Field", address: "Amravati, India", latitude: 20.9374, longitude: 77.7796 },
      },
    ],
    drivers: [
      { name: "Sanjay Kulkarni", phoneNumber: "+919821000001" },
      { name: "Farhan Sheikh", phoneNumber: "+919821000002" },
    ],
    vehicles: [
      {
        name: "Truck A",
        registrationNumber: "AG-TRK-001",
        capacity: 2500,
        location: { source: "GPS", lat: 20.1, lon: 78.5 },
      },
      {
        name: "Truck B",
        registrationNumber: "AG-TRK-002",
        capacity: 1800,
        location: { source: "SMS_REPORTED", lat: 19.9, lon: 76.2, hoursAgo: 6 },
      },
    ],
  },
];

async function seedOrganization(seed: OrgSeed) {
  const organization = await prisma.organization.create({
    data: { name: seed.name, slug: seed.slug },
  });

  await prisma.organizationPhoneNumber.create({
    data: {
      organizationId: organization.id,
      phoneNumber: seed.twilioPhoneNumber,
      twilioPhoneNumber: seed.twilioPhoneNumber,
      friendlyName: `${seed.name} dispatch line`,
    },
  });

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  await prisma.user.createMany({
    data: seed.users.map((u) => ({
      organizationId: organization.id,
      name: u.name,
      email: u.email,
      role: u.role,
      passwordHash,
    })),
  });

  const drivers = await Promise.all(
    seed.drivers.map((d) =>
      prisma.driver.create({
        data: { organizationId: organization.id, name: d.name, phoneNumber: d.phoneNumber },
      }),
    ),
  );

  const vehicles = await Promise.all(
    seed.vehicles.map((v, i) => {
      const locationUpdatedAt =
        v.location.source === "GPS"
          ? new Date()
          : new Date(Date.now() - v.location.hoursAgo * 60 * 60 * 1000);
      return prisma.vehicle.create({
        data: {
          organizationId: organization.id,
          name: v.name,
          registrationNumber: v.registrationNumber,
          capacity: v.capacity,
          // Index-matched with seed.drivers — each vehicle has one driver
          // whose phone reports its location (see schema comment on
          // Vehicle.primaryDriverId).
          primaryDriverId: drivers[i]?.id,
          currentLatitude: v.location.lat,
          currentLongitude: v.location.lon,
          locationSource: v.location.source,
          locationUpdatedAt,
        },
      });
    }),
  );

  const farmers = await Promise.all(
    seed.farmers.map(async (f) => {
      const farmer = await prisma.farmer.create({
        data: { organizationId: organization.id, name: f.name, phoneNumber: f.phoneNumber },
      });
      const farm = await prisma.farm.create({
        data: {
          organizationId: organization.id,
          farmerId: farmer.id,
          name: f.farm.name,
          address: f.farm.address,
          latitude: f.farm.latitude,
          longitude: f.farm.longitude,
        },
      });
      return { farmer, farm };
    }),
  );

  // One full conversation → message → pickup request → assignment thread,
  // built off the first farmer, to exercise every relation end to end.
  const [{ farmer: firstFarmer, farm: firstFarm }] = farmers;

  const conversation = await prisma.conversation.create({
    data: { organizationId: organization.id, farmerId: firstFarmer.id },
  });

  const inboundMessage = await prisma.message.create({
    data: {
      organizationId: organization.id,
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: firstFarmer.phoneNumber,
      recipient: seed.twilioPhoneNumber,
      body: `${firstFarmer.name.split(" ")[0].toUpperCase()} - PRODUCE - 300KG - ${firstFarm.address.split(",")[0].toUpperCase()}`,
      status: "RECEIVED",
      providerMessageId: `SEED-${seed.slug}-inbound-1`,
      receivedAt: new Date(),
    },
  });

  await prisma.message.create({
    data: {
      organizationId: organization.id,
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: seed.twilioPhoneNumber,
      recipient: firstFarmer.phoneNumber,
      body: `Confirmed ${firstFarmer.name.split(" ")[0]}. A truck is being arranged.`,
      status: "SENT",
      providerMessageId: `SEED-${seed.slug}-outbound-1`,
      sentAt: new Date(),
    },
  });

  const pickupRequest = await prisma.pickupRequest.create({
    data: {
      organizationId: organization.id,
      farmerId: firstFarmer.id,
      farmId: firstFarm.id,
      sourceConversationId: conversation.id,
      sourceMessageId: inboundMessage.id,
      quantity: 300,
      unit: "KG",
      status: "ASSIGNED",
    },
  });

  await prisma.assignment.create({
    data: {
      organizationId: organization.id,
      pickupRequestId: pickupRequest.id,
      driverId: drivers[0].id,
      vehicleId: vehicles[0].id,
    },
  });
  // Mirrors what the real assign flow does — otherwise this vehicle would
  // incorrectly still show as AVAILABLE for dispatch recommendations.
  await prisma.vehicle.update({ where: { id: vehicles[0].id }, data: { status: "EN_ROUTE" } });

  return { organization, farmers, drivers, vehicles };
}

async function main() {
  console.log("Wiping existing data...");
  // Order matters: children before parents.
  await prisma.assignment.deleteMany();
  await prisma.pickupRequest.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.farmer.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.organizationPhoneNumber.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  for (const seed of ORG_SEEDS) {
    console.log(`Seeding ${seed.name}...`);
    await seedOrganization(seed);
  }

  // Platform admins are a separate, cross-org concern (CLAUDE.md §34) —
  // upserted rather than wiped, so re-seeding org demo data doesn't log
  // out whoever's testing the platform-admin dashboard locally.
  const platformAdminEmail = "admin@agrihaul.internal";
  const platformAdminPasswordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  await prisma.platformAdmin.upsert({
    where: { email: platformAdminEmail },
    update: {},
    create: { name: "Dev Platform Admin", email: platformAdminEmail, passwordHash: platformAdminPasswordHash },
  });

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
