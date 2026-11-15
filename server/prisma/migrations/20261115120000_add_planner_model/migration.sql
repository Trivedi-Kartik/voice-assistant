-- AlterTable: optional user-chosen model for the PC agent (additive; no existing row is touched).
ALTER TABLE "users" ADD COLUMN "planner_provider" TEXT,
ADD COLUMN "planner_model" TEXT,
ADD COLUMN "planner_api_key_enc" BYTEA;
