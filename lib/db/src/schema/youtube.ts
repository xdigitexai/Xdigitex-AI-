import { pgTable, serial, text, timestamp, integer, boolean, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const ytJobStatusEnum = pgEnum("yt_job_status", ["queued", "running", "completed", "failed", "retrying"]);
export const ytVideoStatusEnum = pgEnum("yt_video_status", ["draft", "scripted", "scheduled", "published", "failed"]);

export const ytChannelsTable = pgTable("youtube_channels", {
  id:            serial("id").primaryKey(),
  userId:        integer("user_id").notNull().default(1),
  name:          text("name").notNull(),
  channelId:     text("channel_id"),
  handle:        text("handle"),
  accessToken:   text("access_token"),
  refreshToken:  text("refresh_token"),
  tokenExpiry:   timestamp("token_expiry"),
  subscribers:   integer("subscribers").default(0),
  totalViews:    integer("total_views").default(0),
  videoCount:    integer("video_count").default(0),
  thumbnailUrl:  text("thumbnail_url"),
  connected:     boolean("connected").notNull().default(false),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
});

export const ytContentPlansTable = pgTable("youtube_content_plans", {
  id:             serial("id").primaryKey(),
  userId:         integer("user_id").notNull().default(1),
  channelId:      integer("channel_id"),
  title:          text("title").notNull(),
  niche:          text("niche"),
  targetAudience: text("target_audience"),
  contentIdeas:   jsonb("content_ideas").$type<string[]>().default([]),
  status:         text("status").notNull().default("draft"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});

export const ytScriptsTable = pgTable("youtube_scripts", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().default(1),
  channelId: integer("channel_id"),
  title:     text("title").notNull(),
  hook:      text("hook"),
  intro:     text("intro"),
  body:      text("body"),
  cta:       text("cta"),
  type:      text("type").notNull().default("long-form"),
  wordCount: integer("word_count").default(0),
  status:    text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ytThumbnailsTable = pgTable("youtube_thumbnails", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().default(1),
  channelId: integer("channel_id"),
  title:     text("title").notNull(),
  concept:   text("concept"),
  prompt:    text("prompt"),
  imageUrl:  text("image_url"),
  status:    text("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const ytVideosTable = pgTable("youtube_videos", {
  id:               serial("id").primaryKey(),
  userId:           integer("user_id").notNull().default(1),
  channelId:        integer("channel_id"),
  scriptId:         integer("script_id"),
  thumbnailId:      integer("thumbnail_id"),
  title:            text("title").notNull(),
  description:      text("description"),
  tags:             jsonb("tags").$type<string[]>().default([]),
  status:           ytVideoStatusEnum("status").notNull().default("draft"),
  scheduledAt:      timestamp("scheduled_at"),
  publishedAt:      timestamp("published_at"),
  youtubeVideoId:   text("youtube_video_id"),
  views:            integer("views").default(0),
  likes:            integer("likes").default(0),
  comments:         integer("comments").default(0),
  watchTimeMinutes: integer("watch_time_minutes").default(0),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

export const ytSchedulesTable = pgTable("youtube_schedules", {
  id:             serial("id").primaryKey(),
  userId:         integer("user_id").notNull().default(1),
  channelId:      integer("channel_id"),
  videoId:        integer("video_id"),
  cronExpression: text("cron_expression"),
  scheduledAt:    timestamp("scheduled_at"),
  status:         text("status").notNull().default("pending"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
});

export const ytCredentialsTable = pgTable("youtube_credentials", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull().default(1),
  service:      text("service").notNull(),
  label:        text("label"),
  encryptedKey: text("encrypted_key"),
  connected:    boolean("connected").notNull().default(false),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export const ytJobsTable = pgTable("youtube_jobs", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull().default(1),
  type:        text("type").notNull(),
  status:      ytJobStatusEnum("status").notNull().default("queued"),
  payload:     jsonb("payload").$type<Record<string, unknown>>().default({}),
  result:      jsonb("result").$type<Record<string, unknown>>(),
  error:       text("error"),
  startedAt:   timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

export const ytLogsTable = pgTable("youtube_logs", {
  id:        serial("id").primaryKey(),
  userId:    integer("user_id").notNull().default(1),
  jobId:     integer("job_id"),
  level:     text("level").notNull().default("info"),
  category:  text("category").notNull().default("system"),
  message:   text("message").notNull(),
  details:   jsonb("details").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type YtChannel    = typeof ytChannelsTable.$inferSelect;
export type YtContentPlan = typeof ytContentPlansTable.$inferSelect;
export type YtScript     = typeof ytScriptsTable.$inferSelect;
export type YtThumbnail  = typeof ytThumbnailsTable.$inferSelect;
export type YtVideo      = typeof ytVideosTable.$inferSelect;
export type YtSchedule   = typeof ytSchedulesTable.$inferSelect;
export type YtCredential = typeof ytCredentialsTable.$inferSelect;
export type YtJob        = typeof ytJobsTable.$inferSelect;
export type YtLog        = typeof ytLogsTable.$inferSelect;
