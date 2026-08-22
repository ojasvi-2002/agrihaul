// Drivers never get a platform login — the separate Driver type (below)
// is the real driver concept, SMS-only, same as Farmer.
export type UserRole = "OWNER" | "ADMIN" | "DISPATCHER";

export type Organization = {
  id: string;
  name: string;
  slug: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

export type TeamInvite = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
};

export type PlatformAdmin = {
  id: string;
  name: string;
  email: string;
};

export type OrganizationWithCounts = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  _count: { users: number; farmers: number; pickupRequests: number };
};

export type PlatformStats = {
  totalOrganizations: number;
  activeOrganizations: number;
  suspendedOrganizations: number;
  totalUsers: number;
  totalFarmers: number;
  totalPickups: number;
};

export type DashboardStats = {
  pendingPickups: number;
  unassignedPickups: number;
  pickupsToday: number;
  completedToday: number;
  activeDrivers: number;
  messagesNeedingReview: number;
};

export type OrganizationDetail = {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  lastActivityAt: string | null;
  _count: {
    users: number;
    farmers: number;
    farms: number;
    drivers: number;
    vehicles: number;
    conversations: number;
    messages: number;
    pickupRequests: number;
  };
  users: { id: string; name: string; email: string; role: UserRole; createdAt: string }[];
  phoneNumbers: { id: string; twilioPhoneNumber: string; friendlyName: string | null; active: boolean }[];
};

// Platform-admin org-detail tabs — Drivers and Farmers are read-only
// views for the platform admin, not the org-scoped Driver/Farmer types
// above (which power the org's own CRUD pages), but share the same core
// shape plus one extra field each tab needs.
export type PlatformDriver = Driver & { primaryVehicle: Vehicle | null };
export type PlatformFarmer = Farmer & { _count: { farms: number } };

export type Farmer = {
  id: string;
  name: string;
  phoneNumber: string;
};

export type OrganizationPhoneNumber = {
  id: string;
  twilioPhoneNumber: string;
  friendlyName: string | null;
  active: boolean;
};

export type Conversation = {
  id: string;
  farmerId: string;
  channel: "SMS";
  status: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
  farmer: Farmer;
};

export type Message = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  sender: string;
  recipient: string;
  body: string;
  status: string;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
};

export type Farm = {
  id: string;
  farmerId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type Driver = {
  id: string;
  name: string;
  phoneNumber: string;
  status: "ACTIVE" | "INACTIVE";
};

export type Vehicle = {
  id: string;
  name: string;
  registrationNumber: string;
  capacity: number | null;
  status: "AVAILABLE" | "EN_ROUTE" | "MAINTENANCE" | "INACTIVE";
  primaryDriverId: string | null;
  primaryDriver: Driver | null;
  currentLatitude: number | null;
  currentLongitude: number | null;
  locationSource: "GPS" | "SMS_REPORTED" | null;
  locationUpdatedAt: string | null;
};

export type PickupStatus = "PENDING" | "CONFIRMED" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type Assignment = {
  id: string;
  status: string;
  driver: Driver;
  vehicle: Vehicle;
  assignedAt: string;
  completedAt: string | null;
};

export type PickupRequest = {
  id: string;
  farmerId: string;
  farmId: string | null;
  product: string | null;
  locationText: string | null;
  quantity: number | null;
  unit: string | null;
  requestedPickupDate: string | null;
  status: PickupStatus;
  notes: string | null;
  createdAt: string;
  farmer: Farmer;
  farm: Farm | null;
  assignments: Assignment[];
};

export type RecommendationCandidate = {
  vehicleId: string;
  vehicleName: string;
  registrationNumber: string;
  driverId: string;
  driverName: string;
  distanceKm: number;
  locationSource: "GPS" | "SMS_REPORTED";
  locationUpdatedAt: string;
};

export type RecommendationResult =
  | { available: true; candidates: RecommendationCandidate[] }
  | { available: false; reason: string };
