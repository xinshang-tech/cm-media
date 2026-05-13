-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `username` VARCHAR(60) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `nickname` VARCHAR(60) NOT NULL DEFAULT '',
    `role` ENUM('admin', 'user') NOT NULL DEFAULT 'user',
    `avatar_url` VARCHAR(500) NULL,
    `session_id` VARCHAR(64) NULL,
    `session_created_at` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `last_login_ua` VARCHAR(512) NULL,
    `login_attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_permanently_banned` BOOLEAN NOT NULL DEFAULT false,
    `banned_reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_uuid_key`(`uuid`),
    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_uuid_idx`(`uuid`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_is_permanently_banned_idx`(`is_permanently_banned`),
    INDEX `users_session_id_idx`(`session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `banned_ips` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `ip_address` VARCHAR(45) NOT NULL,
    `is_permanent` BOOLEAN NOT NULL DEFAULT true,
    `banned_at` DATETIME(3) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `unbanned_at` DATETIME(3) NULL,
    `unbanned_by` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `banned_ips_ip_address_key`(`ip_address`),
    INDEX `banned_ips_ip_address_idx`(`ip_address`),
    INDEX `banned_ips_is_permanent_idx`(`is_permanent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(60) NOT NULL,
    `ip_address` VARCHAR(45) NOT NULL,
    `user_agent` VARCHAR(512) NOT NULL DEFAULT '',
    `success` BOOLEAN NOT NULL DEFAULT false,
    `failure_reason` VARCHAR(100) NULL,
    `user_id` INTEGER UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `login_logs_username_idx`(`username`),
    INDEX `login_logs_ip_address_idx`(`ip_address`),
    INDEX `login_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `parent_id` INTEGER UNSIGNED NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parent_id_idx`(`parent_id`),
    INDEX `categories_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vod_videos` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `filename` VARCHAR(255) NOT NULL,
    `filesize` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `mimetype` VARCHAR(100) NOT NULL DEFAULT '',
    `vod_video_id` VARCHAR(100) NULL,
    `video_url` VARCHAR(500) NULL,
    `preview_vod_id` VARCHAR(100) NULL,
    `preview_video_url` VARCHAR(500) NULL,
    `video_width` INTEGER UNSIGNED NULL,
    `video_height` INTEGER UNSIGNED NULL,
    `video_duration` VARCHAR(20) NULL,
    `video_fps` DECIMAL(5, 2) NULL,
    `caption_url` VARCHAR(500) NULL,
    `sprite_url` VARCHAR(500) NULL,
    `sprite_vtt_url` VARCHAR(500) NULL,
    `poster_url` VARCHAR(500) NULL,
    `gif_poster_url` VARCHAR(500) NULL,
    `tags` JSON NULL,
    `status` ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
    `uploader_id` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vod_videos_uuid_key`(`uuid`),
    UNIQUE INDEX `vod_videos_vod_video_id_key`(`vod_video_id`),
    INDEX `vod_videos_uuid_idx`(`uuid`),
    INDEX `vod_videos_vod_video_id_idx`(`vod_video_id`),
    INDEX `vod_videos_status_idx`(`status`),
    INDEX `vod_videos_uploader_id_idx`(`uploader_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `videos` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `uuid` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NULL,
    `vod_video_id` INTEGER UNSIGNED NULL,
    `is_gallery` BOOLEAN NOT NULL DEFAULT false,
    `gallery_images` JSON NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `is_pickup` BOOLEAN NOT NULL DEFAULT false,
    `view_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `allowed_users` JSON NULL,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `videos_uuid_key`(`uuid`),
    INDEX `videos_uuid_idx`(`uuid`),
    INDEX `videos_status_idx`(`status`),
    INDEX `videos_is_pickup_idx`(`is_pickup`),
    INDEX `videos_published_at_idx`(`published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_categories` (
    `video_id` INTEGER UNSIGNED NOT NULL,
    `category_id` INTEGER UNSIGNED NOT NULL,

    PRIMARY KEY (`video_id`, `category_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `view_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `video_id` INTEGER UNSIGNED NOT NULL,
    `last_position` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total_duration` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `view_count` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `last_viewed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `view_records_user_id_idx`(`user_id`),
    INDEX `view_records_video_id_idx`(`video_id`),
    INDEX `view_records_last_viewed_at_idx`(`last_viewed_at`),
    UNIQUE INDEX `view_records_user_id_video_id_key`(`user_id`, `video_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target_type` VARCHAR(50) NULL,
    `target_id` INTEGER UNSIGNED NULL,
    `details` JSON NULL,
    `ip_address` VARCHAR(45) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `operation_logs_user_id_idx`(`user_id`),
    INDEX `operation_logs_action_idx`(`action`),
    INDEX `operation_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `upload_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER UNSIGNED NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `thumb_url` VARCHAR(500) NULL,
    `filename` VARCHAR(255) NOT NULL,
    `filesize` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `mimetype` VARCHAR(100) NOT NULL DEFAULT '',
    `width` INTEGER UNSIGNED NULL,
    `height` INTEGER UNSIGNED NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `upload_logs_user_id_idx`(`user_id`),
    INDEX `upload_logs_type_idx`(`type`),
    INDEX `upload_logs_is_deleted_idx`(`is_deleted`),
    INDEX `upload_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `banned_ips` ADD CONSTRAINT `banned_ips_unbanned_by_fkey` FOREIGN KEY (`unbanned_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `login_logs` ADD CONSTRAINT `login_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vod_videos` ADD CONSTRAINT `vod_videos_uploader_id_fkey` FOREIGN KEY (`uploader_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `videos` ADD CONSTRAINT `videos_vod_video_id_fkey` FOREIGN KEY (`vod_video_id`) REFERENCES `vod_videos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_categories` ADD CONSTRAINT `video_categories_video_id_fkey` FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_categories` ADD CONSTRAINT `video_categories_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `view_records` ADD CONSTRAINT `view_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `view_records` ADD CONSTRAINT `view_records_video_id_fkey` FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `upload_logs` ADD CONSTRAINT `upload_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
