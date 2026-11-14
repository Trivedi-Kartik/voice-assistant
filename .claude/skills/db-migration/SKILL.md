---
name: db-migration
description: Change the Prisma schema and create/validate/apply a Postgres migration safely. Use for any edit to server/prisma/schema.prisma or when applying migrations to production.
disable-model-invocation: true
---

# Database migrations (Prisma + Neon + pgvector)

**`server/.env` `DATABASE_URL` points at the real Neon database.** Never run `prisma migrate dev`, `migrate reset`, or `db push` against it — `migrate dev` can prompt to reset (drop) data, and it's the only data real users have.

## 1. Edit and generate locally against a throwaway Postgres
Memory facts use pgvector, so use a pgvector image:
```bash
docker run -d --name karvix-mig -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=karvix -p 55434:5432 pgvector/pgvector:pg16
cd server
export DATABASE_URL="postgresql://postgres:postgres@localhost:55434/karvix"   # this shell only
npx prisma migrate deploy        # replay history first, proves existing migrations still apply
npx prisma migrate dev --name <what_changed>
npm run typecheck && npm test
docker rm -f karvix-mig
```
Open the generated `migration.sql` and read it. Dropped/renamed columns or tables, type changes, and new NOT NULL columns without defaults are destructive for existing rows — stop and confirm with the user. The `migration-reviewer` agent can do an independent pass.

## 2. Apply to production — only on the user's explicit go-ahead
The Docker image does **not** run migrations on start (`CMD ["node","dist/index.js"]`), and Render won't either. Order matters:
1. Additive/backward-compatible change: apply the migration first, then deploy code.
2. Breaking change: needs a two-step (expand → deploy → contract) plan; don't do it in one release.

```bash
cd server && npm run prisma:migrate:deploy   # uses DATABASE_URL from .env = production
```
If it hangs on the Neon pooled URL (pgbouncer + Prisma's advisory lock), use Neon's non-pooled connection string for this one command (runtime keeps the pooled one). Confirm with `npx prisma migrate status` afterwards.

## 3. Afterwards
Commit schema + the new `migrations/<timestamp>_*` folder together. Never edit or delete an already-applied migration. Log it with `log-change`.
