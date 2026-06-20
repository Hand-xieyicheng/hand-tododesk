CREATE TABLE `Habit` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `notes` TEXT NULL,
  `icon` VARCHAR(191) NOT NULL DEFAULT 'Smile',
  `color` VARCHAR(191) NOT NULL DEFAULT 'mint',
  `frequency` VARCHAR(191) NOT NULL,
  `interval` INTEGER NOT NULL DEFAULT 1,
  `weekDays` JSON NULL,
  `monthDays` JSON NULL,
  `startDate` VARCHAR(10) NOT NULL,
  `endDate` VARCHAR(10) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Habit_userId_archivedAt_sortOrder_idx` (`userId`, `archivedAt`, `sortOrder`),
  INDEX `Habit_userId_sortOrder_idx` (`userId`, `sortOrder`),
  CONSTRAINT `Habit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `HabitCheckIn` (
  `id` VARCHAR(191) NOT NULL,
  `habitId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `date` VARCHAR(10) NOT NULL,
  `note` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `HabitCheckIn_habitId_date_key` (`habitId`, `date`),
  INDEX `HabitCheckIn_userId_date_idx` (`userId`, `date`),
  INDEX `HabitCheckIn_habitId_date_idx` (`habitId`, `date`),
  CONSTRAINT `HabitCheckIn_habitId_fkey` FOREIGN KEY (`habitId`) REFERENCES `Habit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `HabitCheckIn_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserThemePreference`
  ALTER `visibleSidebarModules` SET DEFAULT 'tasks,memos,anniversaries,habits,calendar,pomodoro';

UPDATE `UserThemePreference`
SET `visibleSidebarModules` = REPLACE(`visibleSidebarModules`, 'anniversaries,calendar', 'anniversaries,habits,calendar')
WHERE `visibleSidebarModules` LIKE '%anniversaries,calendar%'
  AND `visibleSidebarModules` NOT LIKE '%habits%';
