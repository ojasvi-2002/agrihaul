import crypto from "crypto";
import { findBySlug } from "../repositories/organization.repository";

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "org"
  );
}

export async function uniqueSlugFor(name: string) {
  const base = slugify(name);
  return (await findBySlug(base)) ? `${base}-${crypto.randomBytes(3).toString("hex")}` : base;
}
