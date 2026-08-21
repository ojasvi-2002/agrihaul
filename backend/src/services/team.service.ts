import bcrypt from "bcryptjs";
import * as userRepo from "../repositories/user.repository";
import { ServiceError } from "../utils/serviceErrors";

export const listTeam = userRepo.listUsersForOrg;

// No email-invite infrastructure exists yet (Twilio here is SMS-only,
// and CLAUDE.md §50 says not to assume paid email services) — the
// OWNER/ADMIN sets an initial password directly and shares it with the
// new teammate out of band. A proper invite-link flow can replace this
// once email sending exists.
export async function inviteUser(
  organizationId: string,
  inviterRole: "OWNER" | "ADMIN" | "DISPATCHER" | "DRIVER",
  data: { name: string; email: string; role: "OWNER" | "ADMIN" | "DISPATCHER" | "DRIVER"; password: string },
) {
  // Only an OWNER can create another OWNER — otherwise an ADMIN could
  // mint themselves (or an accomplice) full ownership of the org.
  if (data.role === "OWNER" && inviterRole !== "OWNER") {
    throw new ServiceError(403, "Only an owner can grant the owner role");
  }

  const existing = await userRepo.findUserByEmail(data.email);
  if (existing) {
    throw new ServiceError(400, "A user with this email already exists");
  }
  const passwordHash = await bcrypt.hash(data.password, 10);
  return userRepo.createUser(organizationId, {
    name: data.name,
    email: data.email,
    role: data.role,
    passwordHash,
  });
}
