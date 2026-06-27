ALTER TABLE `UserThemePreference`
  ADD COLUMN `printButtonEnabled` BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE `PrintShare` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `sourceType` VARCHAR(32) NOT NULL,
  `sourceJson` JSON NOT NULL,
  `configJson` JSON NOT NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `lastAccessedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PrintShare_tokenHash_key` (`tokenHash`),
  INDEX `PrintShare_userId_expiresAt_idx` (`userId`, `expiresAt`),
  INDEX `PrintShare_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `PrintShare_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
