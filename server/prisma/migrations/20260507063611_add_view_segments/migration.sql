-- CreateTable
CREATE TABLE `view_segments` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `video_id` INTEGER UNSIGNED NOT NULL,
    `seg_start` DECIMAL(10, 2) NOT NULL,
    `seg_end` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `view_segments_user_id_idx`(`user_id`),
    INDEX `view_segments_video_id_idx`(`video_id`),
    INDEX `view_segments_user_id_video_id_idx`(`user_id`, `video_id`),
    INDEX `view_segments_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `view_segments` ADD CONSTRAINT `view_segments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `view_segments` ADD CONSTRAINT `view_segments_video_id_fkey` FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
