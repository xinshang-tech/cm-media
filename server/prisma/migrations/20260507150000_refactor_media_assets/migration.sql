-- CreateTable: media_assets
CREATE TABLE `media_assets` (
    `id` INTEGER UNSIGNED NOT NULL AUTO_INCREMENT,
    `vod_video_id` INTEGER UNSIGNED NOT NULL,
    `type` ENUM('caption', 'sprite', 'sprite_vtt', 'cover') NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `media_assets_vod_video_id_type_key`(`vod_video_id`, `type`),
    INDEX `media_assets_vod_video_id_idx`(`vod_video_id`),
    INDEX `media_assets_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate existing data from vod_videos to media_assets
INSERT INTO `media_assets` (`vod_video_id`, `type`, `url`, `created_at`, `updated_at`)
SELECT `id`, 'caption', `caption_url`, `created_at`, `updated_at` FROM `vod_videos` WHERE `caption_url` IS NOT NULL;

INSERT INTO `media_assets` (`vod_video_id`, `type`, `url`, `created_at`, `updated_at`)
SELECT `id`, 'sprite', `sprite_url`, `created_at`, `updated_at` FROM `vod_videos` WHERE `sprite_url` IS NOT NULL;

INSERT INTO `media_assets` (`vod_video_id`, `type`, `url`, `created_at`, `updated_at`)
SELECT `id`, 'sprite_vtt', `sprite_vtt_url`, `created_at`, `updated_at` FROM `vod_videos` WHERE `sprite_vtt_url` IS NOT NULL;

INSERT INTO `media_assets` (`vod_video_id`, `type`, `url`, `created_at`, `updated_at`)
SELECT `id`, 'cover', `cover_url`, `created_at`, `updated_at` FROM `vod_videos` WHERE `cover_url` IS NOT NULL;

-- Add poster_url to videos
ALTER TABLE `videos` ADD COLUMN `poster_url` VARCHAR(500) NULL;

-- Migrate poster_url from vod_videos to videos
UPDATE `videos` v
JOIN `vod_videos` vv ON v.`vod_video_id` = vv.`id`
SET v.`poster_url` = vv.`poster_url`
WHERE vv.`poster_url` IS NOT NULL;

-- Remove columns from vod_videos
ALTER TABLE `vod_videos`
    DROP COLUMN `caption_url`,
    DROP COLUMN `sprite_url`,
    DROP COLUMN `sprite_vtt_url`,
    DROP COLUMN `cover_url`,
    DROP COLUMN `poster_url`,
    DROP COLUMN `gif_poster_url`;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_vod_video_id_fkey`
    FOREIGN KEY (`vod_video_id`) REFERENCES `vod_videos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
