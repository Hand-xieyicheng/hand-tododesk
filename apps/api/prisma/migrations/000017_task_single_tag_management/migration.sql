CREATE TABLE IF NOT EXISTS `SchemaMarker` (
  `key` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @task_single_tag_marker = (
  SELECT COUNT(*)
  FROM `SchemaMarker`
  WHERE `key` = 'task_single_tag_management_v1'
);

DELETE FROM `TaskTag`
WHERE @task_single_tag_marker = 0;

DELETE FROM `Tag`
WHERE @task_single_tag_marker = 0;

INSERT INTO `Tag` (`id`, `userId`, `name`, `createdAt`)
SELECT UUID(), u.`id`, defaults.`name`, NOW(3)
FROM `User` u
JOIN (
  SELECT '工作' AS `name`
  UNION ALL SELECT '生活'
  UNION ALL SELECT '娱乐'
) defaults
WHERE @task_single_tag_marker = 0;

INSERT INTO `SchemaMarker` (`key`)
SELECT 'task_single_tag_management_v1'
WHERE @task_single_tag_marker = 0;
