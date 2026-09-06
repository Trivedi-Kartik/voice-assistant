-- CreateTable
CREATE TABLE "automation_steps" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "step_index" INTEGER NOT NULL,
    "action" JSONB NOT NULL,
    "risk" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "result_ok" BOOLEAN,
    "result_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "automation_steps_task_id_idx" ON "automation_steps"("task_id");

-- CreateIndex
CREATE INDEX "automation_steps_user_id_created_at_idx" ON "automation_steps"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "automation_steps" ADD CONSTRAINT "automation_steps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
