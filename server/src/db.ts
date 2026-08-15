import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the process — hosted as one long-lived
// Node process (Render, see render.yaml), not a per-request serverless
// function, so there's no cold-start-per-connection concern to work around
// here (only a cold-start-per-idle-service one, see docs/SETUP.md).
export const db = new PrismaClient();
