import {
  pgTable, pgEnum, serial, integer, text, timestamp, jsonb, numeric,
  boolean, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { projectsTable } from "./projects";
import { serversTable } from "./servers";

export const conversationStatusEnum = pgEnum("conversation_status", ["active", "archived"]);
export const messageRoleEnum = pgEnum("conversation_message_role", ["user", "assistant", "system", "tool"]);
export const runStatusEnum = pgEnum("agent_run_status", [
  "queued", "running", "waiting", "completed", "failed", "cancelled", "insufficient_credits",
]);
export const taskItemStatusEnum = pgEnum("agent_task_item_status", ["pending", "in_progress", "completed", "failed", "skipped"]);
export const toolCallStatusEnum = pgEnum("agent_tool_call_status", ["queued", "running", "completed", "failed", "timeout", "cancelled", "waiting_approval"]);
export const approvalStatusEnum = pgEnum("agent_approval_status", ["pending", "approved", "rejected", "edited"]);
export const usageStatusEnum = pgEnum("agent_usage_status", ["reserved", "settled", "released", "failed"]);

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  serverId: integer("server_id").references(() => serversTable.id, { onDelete: "set null" }),
  workspaceId: text("workspace_id"),
  status: conversationStatusEnum("status").notNull().default("active"),
  metadata: jsonb("metadata").notNull().default({}),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("conversations_user_last_idx").on(t.userId, t.lastMessageAt)]);

export const conversationMessagesTable = pgTable("conversation_messages", {
  id: serial("id").primaryKey(),
  publicId: text("public_id").notNull().unique(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  runId: integer("run_id"),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  contentType: text("content_type").notNull().default("text"),
  sequence: integer("sequence").notNull(),
  model: text("model"), provider: text("provider"),
  tokenUsage: jsonb("token_usage"), creditUsage: numeric("credit_usage", { precision: 14, scale: 6 }),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("conversation_messages_sequence_uidx").on(t.conversationId, t.sequence)]);

export const agentRunsTable = pgTable("coding_agent_runs", {
  id: serial("id").primaryKey(), publicId: text("public_id").notNull().unique(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  parentRunId: integer("parent_run_id"), status: runStatusEnum("status").notNull().default("queued"),
  phase: text("phase").notNull().default("queued"), attempt: integer("attempt").notNull().default(1),
  lockToken: text("lock_token"), idempotencyKey: text("idempotency_key"),
  cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
  heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }), startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }), error: text("error"),
  metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("coding_agent_runs_idempotency_uidx").on(t.userId, t.idempotencyKey), index("coding_agent_runs_queue_idx").on(t.status, t.createdAt)]);

export const runEventsTable = pgTable("agent_run_events", {
  id: serial("id").primaryKey(), runId: integer("run_id").notNull().references(() => agentRunsTable.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(), type: text("type").notNull(), payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agent_run_events_sequence_uidx").on(t.runId, t.sequence)]);

export const agentTasksTable = pgTable("agent_tasks", {
  id: serial("id").primaryKey(), publicId: text("public_id").notNull().unique(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  runId: integer("run_id").references(() => agentRunsTable.id, { onDelete: "set null" }), goal: text("goal").notNull(),
  status: text("status").notNull().default("in_progress"), acceptanceCriteria: jsonb("acceptance_criteria").notNull().default([]),
  metadata: jsonb("metadata").notNull().default({}), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agentTaskItemsTable = pgTable("agent_task_items", {
  id: serial("id").primaryKey(), taskId: integer("task_id").notNull().references(() => agentTasksTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), title: text("title").notNull(), status: taskItemStatusEnum("status").notNull().default("pending"),
  required: boolean("required").notNull().default(true), evidence: jsonb("evidence").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agent_task_items_position_uidx").on(t.taskId, t.position)]);

export const toolCallsTable = pgTable("agent_tool_calls", {
  id: serial("id").primaryKey(), publicId: text("public_id").notNull().unique(), runId: integer("run_id").notNull().references(() => agentRunsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(), status: toolCallStatusEnum("status").notNull().default("queued"), risk: text("risk").notNull().default("low"),
  input: jsonb("input").notNull().default({}), result: jsonb("result"), startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const approvalsTable = pgTable("agent_approvals", {
  id: serial("id").primaryKey(), publicId: text("public_id").notNull().unique(), toolCallId: integer("tool_call_id").notNull().references(() => toolCallsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }), status: approvalStatusEnum("status").notNull().default("pending"),
  originalInput: jsonb("original_input").notNull(), editedInput: jsonb("edited_input"), decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const checkpointsTable = pgTable("agent_checkpoints", {
  id: serial("id").primaryKey(), runId: integer("run_id").notNull().references(() => agentRunsTable.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(), reason: text("reason").notNull(), snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("agent_checkpoints_sequence_uidx").on(t.runId, t.sequence)]);

export const contextSummariesTable = pgTable("agent_context_summaries", {
  id: serial("id").primaryKey(), conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id, { onDelete: "cascade" }),
  throughSequence: integer("through_sequence").notNull(), summary: text("summary").notNull(), metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const usageLedgerTable = pgTable("agent_usage_ledger", {
  id: serial("id").primaryKey(), publicId: text("public_id").notNull().unique(), userId: integer("user_id").notNull().references(() => usersTable.id),
  conversationId: integer("conversation_id").references(() => conversationsTable.id), runId: integer("run_id").references(() => agentRunsTable.id),
  provider: text("provider").notNull(), model: text("model").notNull(), inputTokens: integer("input_tokens").notNull().default(0), outputTokens: integer("output_tokens").notNull().default(0),
  cachedTokens: integer("cached_tokens").notNull().default(0), reasoningTokens: integer("reasoning_tokens").notNull().default(0), providerCost: numeric("provider_cost", { precision: 14, scale: 8 }).notNull().default("0"),
  chargedCredits: numeric("charged_credits", { precision: 14, scale: 6 }).notNull().default("0"), reservedCredits: numeric("reserved_credits", { precision: 14, scale: 6 }).notNull().default("0"),
  balanceBefore: numeric("balance_before", { precision: 14, scale: 6 }).notNull(), balanceAfter: numeric("balance_after", { precision: 14, scale: 6 }).notNull(),
  status: usageStatusEnum("status").notNull(), providerRequestId: text("provider_request_id"), idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const projectMemoryTable = pgTable("project_agent_memory", {
  id: serial("id").primaryKey(), projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }).unique(),
  stack: jsonb("stack").notNull().default([]), commands: jsonb("commands").notNull().default({}), directories: jsonb("directories").notNull().default([]),
  environments: jsonb("environments").notNull().default([]), deployment: jsonb("deployment").notNull().default({}), repositoryIndex: jsonb("repository_index").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
