import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the process — Fly.io runs this as one
// long-lived Node process, not a per-request serverless function, so there's
// no cold-start-per-connection concern to work around here.
export const db = new PrismaClient();
