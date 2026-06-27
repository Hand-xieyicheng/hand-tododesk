ALTER TABLE `Task`
  ADD COLUMN `sortOrder` INTEGER NULL;

CREATE INDEX `Task_userId_sortOrder_createdAt_id_idx`
  ON `Task` (`userId`, `sortOrder`, `createdAt`, `id`);
