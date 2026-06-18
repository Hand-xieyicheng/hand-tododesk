CREATE TABLE IF NOT EXISTS `AnniversaryEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL,
  `notes` TEXT NULL,
  `category` VARCHAR(191) NOT NULL,
  `date` VARCHAR(10) NOT NULL,
  `repeat` VARCHAR(191) NOT NULL DEFAULT 'NONE',
  `direction` VARCHAR(191) NOT NULL DEFAULT 'AUTO',
  `cardStyle` VARCHAR(191) NOT NULL DEFAULT 'lavender',
  `calendarType` VARCHAR(191) NOT NULL DEFAULT 'SOLAR',
  `lunarMonth` INTEGER NULL,
  `lunarDay` INTEGER NULL,
  `solarTerm` VARCHAR(191) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `AnniversaryEvent_userId_sortOrder_idx` (`userId`, `sortOrder`),
  INDEX `AnniversaryEvent_userId_category_date_idx` (`userId`, `category`, `date`),
  INDEX `AnniversaryEvent_userId_date_idx` (`userId`, `date`),
  CONSTRAINT `AnniversaryEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserThemePreference`
  ALTER `visibleSidebarModules` SET DEFAULT 'tasks,memos,anniversaries,calendar,pomodoro';

UPDATE `UserThemePreference`
SET `visibleSidebarModules` = 'tasks,memos,anniversaries,calendar,pomodoro'
WHERE `visibleSidebarModules` = 'tasks,memos,calendar,pomodoro';
