import { Request } from "express";

// Express 5's types allow route params to be string[] (for wildcard
// routes). None of ours are wildcards, so this is always a single string.
export function idParam(req: Request, name = "id"): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}
