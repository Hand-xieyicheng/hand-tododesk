CREATE TABLE `Memo` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `contentHtml` MEDIUMTEXT NOT NULL,
  `excerpt` VARCHAR(500) NULL,
  `isPinned` BOOLEAN NOT NULL DEFAULT FALSE,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Memo_userId_isPinned_idx` (`userId`, `isPinned`),
  INDEX `Memo_userId_updatedAt_idx` (`userId`, `updatedAt`),
  INDEX `Memo_userId_archivedAt_idx` (`userId`, `archivedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MemoAsset` (
  `id` VARCHAR(191) NOT NULL,
  `memoId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `filename` VARCHAR(191) NOT NULL,
  `mimeType` VARCHAR(191) NOT NULL,
  `sizeBytes` INTEGER NOT NULL,
  `width` INTEGER NULL,
  `height` INTEGER NULL,
  `path` VARCHAR(255) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `MemoAsset_memoId_idx` (`memoId`),
  INDEX `MemoAsset_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Memo` ADD CONSTRAINT `Memo_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MemoAsset` ADD CONSTRAINT `MemoAsset_memoId_fkey` FOREIGN KEY (`memoId`) REFERENCES `Memo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `MemoAsset` ADD CONSTRAINT `MemoAsset_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
