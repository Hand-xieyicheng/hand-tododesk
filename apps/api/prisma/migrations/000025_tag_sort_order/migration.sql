ALTER TABLE `Tag`
  ADD COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0;

CREATE INDEX `Tag_userId_sortOrder_createdAt_id_idx`
  ON `Tag` (`userId`, `sortOrder`, `createdAt`, `id`);
