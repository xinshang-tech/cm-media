-- AlterTable: add video_type enum column to vod_videos, drop preview fields
ALTER TABLE `vod_videos`
  ADD COLUMN `video_type` ENUM('main', 'preview') NOT NULL DEFAULT 'main',
  ADD INDEX `vod_videos_video_type_idx` (`video_type`),
  DROP COLUMN `preview_vod_id`,
  DROP COLUMN `preview_video_url`;

-- AlterTable: add preview_vod_video_id to videos
ALTER TABLE `videos`
  ADD COLUMN `preview_vod_video_id` INTEGER UNSIGNED NULL,
  ADD INDEX `videos_preview_vod_video_id_fkey` (`preview_vod_video_id`),
  ADD CONSTRAINT `videos_preview_vod_video_id_fkey` FOREIGN KEY (`preview_vod_video_id`) REFERENCES `vod_videos` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
