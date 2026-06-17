ALTER TABLE `UserThemePreference`
  ADD COLUMN `visibleSidebarModules` VARCHAR(191) NOT NULL DEFAULT 'tasks,memos,calendar,pomodoro';
