ALTER TABLE `UserThemePreference`
  MODIFY COLUMN `themeId` VARCHAR(191) NOT NULL DEFAULT 'warm-paper';

UPDATE `UserThemePreference`
SET `themeId` = CASE `themeId`
  WHEN 'default' THEN 'warm-paper'
  WHEN 'shinchan' THEN 'peach'
  WHEN 'labubu' THEN 'lavender'
  WHEN 'doraemon' THEN 'sky'
  ELSE `themeId`
END
WHERE `themeId` IN ('default', 'shinchan', 'labubu', 'doraemon');
