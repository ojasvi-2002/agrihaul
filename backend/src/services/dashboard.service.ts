import {
  countPendingPickups,
  countUnassignedPickups,
  countPickupsCreatedSince,
  countCompletedSince,
} from "../repositories/pickupRequest.repository";
import { countActiveDrivers } from "../repositories/driver.repository";
import { countNeedsReview } from "../repositories/message.repository";

// CLAUDE.md §32 — "build the underlying data first" before a dashboard.
// That data (pickups, drivers, messages) now exists, so this is the
// first real pass: real counts only, nothing fabricated. Deliberately a
// small, distinct set rather than every metric §32 lists, to avoid
// redundant/overlapping numbers (see pickupRequest.repository.ts's
// comments on why "pending" and "unassigned" are kept as two different
// things, not one).
export async function getDashboardStats(organizationId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pendingPickups, unassignedPickups, pickupsToday, completedToday, activeDrivers, messagesNeedingReview] =
    await Promise.all([
      countPendingPickups(organizationId),
      countUnassignedPickups(organizationId),
      countPickupsCreatedSince(organizationId, startOfToday),
      countCompletedSince(organizationId, startOfToday),
      countActiveDrivers(organizationId),
      countNeedsReview(organizationId),
    ]);

  return { pendingPickups, unassignedPickups, pickupsToday, completedToday, activeDrivers, messagesNeedingReview };
}
