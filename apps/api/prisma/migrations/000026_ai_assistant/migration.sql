CREATE TABLE `AiSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `summary` TEXT NULL,
  `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AiSession_userId_lastMessageAt_idx` (`userId`, `lastMessageAt`),
  CONSTRAINT `AiSession_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiMessage` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `role` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(191) NOT NULL,
  `content` TEXT NOT NULL,
  `metadataJson` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `AiMessage_sessionId_createdAt_idx` (`sessionId`, `createdAt`),
  CONSTRAINT `AiMessage_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AiSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiActionProposal` (
  `id` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NOT NULL,
  `messageId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  `version` INTEGER NOT NULL DEFAULT 1,
  `idempotencyKey` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiActionProposal_messageId_key` (`messageId`),
  UNIQUE INDEX `AiActionProposal_userId_idempotencyKey_key` (`userId`, `idempotencyKey`),
  INDEX `AiActionProposal_userId_status_expiresAt_idx` (`userId`, `status`, `expiresAt`),
  INDEX `AiActionProposal_sessionId_createdAt_idx` (`sessionId`, `createdAt`),
  CONSTRAINT `AiActionProposal_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AiSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AiActionProposal_messageId_fkey` FOREIGN KEY (`messageId`) REFERENCES `AiMessage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AiActionProposal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AiActionItem` (
  `id` VARCHAR(191) NOT NULL,
  `proposalId` VARCHAR(191) NOT NULL,
  `position` INTEGER NOT NULL,
  `objectType` VARCHAR(191) NOT NULL,
  `actionType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NULL,
  `inputJson` JSON NOT NULL,
  `targetSnapshotJson` JSON NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  `resultJson` JSON NULL,
  `errorCode` VARCHAR(191) NULL,
  `errorMessage` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `AiActionItem_proposalId_position_key` (`proposalId`, `position`),
  INDEX `AiActionItem_proposalId_status_idx` (`proposalId`, `status`),
  CONSTRAINT `AiActionItem_proposalId_fkey` FOREIGN KEY (`proposalId`) REFERENCES `AiActionProposal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
