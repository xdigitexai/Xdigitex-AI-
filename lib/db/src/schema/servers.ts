import { pgTable, serial, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const serverStatusEnum = pgEnum("server_status", ["online", "offline", "error", "connecting"]);
export const serverAuthEnum = pgEnum("server_auth_type", ["key", "password"]);

export const serversTable = pgTable("servers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("custom"),
  status: serverStatusEnum("status").notNull().default("offline"),
  location: text("location").notNull().default("us-east-1"),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  username: text("username").notNull(),
  authType: serverAuthEnum("auth_type").notNull().default("key"),
  privateKey: text("private_key"),
  password: text("password"),
  privateKeyHash: text("private_key_hash"),
  githubToken: text("github_token"),
  sshPublicKey: text("ssh_public_key"),
  cpanelUrl: text("cpanel_url"),
  cpanelUsername: text("cpanel_username"),
  cpanelPassword: text("cpanel_password"),
  sshPort: integer("ssh_port"),
  extraLogins: text("extra_logins"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertServerSchema = createInsertSchema(serversTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServer = z.infer<typeof insertServerSchema>;
export type Server = typeof serversTable.$inferSelect;

export const serverTaskHistoryTable = pgTable("server_task_history", {
  id:               serial("id").primaryKey(),
  serverId:         integer("server_id").references(() => serversTable.id, { onDelete: "cascade" }).notNull(),
  task:             text("task").notNull(),
  summary:          text("summary"),
  model:            text("model"),
  promptTokens:     integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens:      integer("total_tokens").notNull().default(0),
  iterations:       integer("iterations").notNull().default(0),
  durationMs:       integer("duration_ms").notNull().default(0),
  creditsUsed:      integer("credits_used").notNull().default(0),
  runId:            text("run_id"),
  conversationId:   text("conversation_id"),
  finalResponse:    text("final_response"),
  steps:            text("steps"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
});

export type ServerTaskHistory = typeof serverTaskHistoryTable.$inferSelect;

// ─── Agent Experience Memory ──────────────────────────────────────────────────
// Every successful SSH/VPS task solution is stored here.
// At the start of each new task the agent retrieves the top matching experiences
// and injects them into its context so it skips the "searching for fixes" phase.
export const agentExperiencesTable = pgTable("agent_experiences", {
  id:           serial("id").primaryKey(),
  category:     text("category").notNull().default("general"),   // composer, nginx, php, nodejs, cyberpanel...
  keywords:     text("keywords").notNull(),                       // comma-separated, used for search
  problem:      text("problem").notNull(),                        // one-sentence description
  solution:     text("solution").notNull(),                       // exact commands / steps that worked
  context:      text("context"),                                  // OS version, stack details, etc.
  successCount: integer("success_count").notNull().default(1),
  failCount:    integer("fail_count").notNull().default(0),
  score:        integer("score").notNull().default(100),          // 0-100, highest used first
  serverId:     integer("server_id"),                             // which server taught this
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
});

export type AgentExperience = typeof agentExperiencesTable.$inferSelect;

// ─── Phase 7: Server Health Snapshots ─────────────────────────────────────────
// Point-in-time health check results stored after each manual or scheduled probe.
export const serverHealthTable = pgTable("server_health_snapshots", {
  id:              serial("id").primaryKey(),
  serverId:        integer("server_id").references(() => serversTable.id, { onDelete: "cascade" }).notNull(),
  diskPercent:     integer("disk_percent"),          // root filesystem usage %
  memoryPercent:   integer("memory_percent"),        // RAM usage %
  cpuLoad1:        text("cpu_load_1"),               // 1-minute load average
  nginxRunning:    integer("nginx_running"),         // 1=yes, 0=no
  phpFpmRunning:   integer("php_fpm_running"),       // 1=yes, 0=no
  pm2Processes:    integer("pm2_processes"),         // count of running PM2 apps
  uptimeDays:      integer("uptime_days"),
  issues:          text("issues"),                   // JSON array of issue strings
  healthy:         integer("healthy").notNull().default(1), // 0=degraded, 1=healthy
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

export type ServerHealthSnapshot = typeof serverHealthTable.$inferSelect;
