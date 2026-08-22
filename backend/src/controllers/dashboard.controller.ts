import { Request, Response } from "express";
import * as dashboardService from "../services/dashboard.service";

export async function getStats(req: Request, res: Response) {
  const stats = await dashboardService.getDashboardStats(req.user!.organizationId);
  res.json({ stats });
}
