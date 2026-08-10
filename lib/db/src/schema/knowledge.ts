import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

// ─── Knowledge Base ────────────────────────────────────────────────────────────
// Technology-specific knowledge injected into agent context based on task keywords.
// Seeded with proven fixes; users can add custom entries via API.
export const knowledgeEntriesTable = pgTable("knowledge_entries", {
  id:        serial("id").primaryKey(),
  stack:     text("stack").notNull(),         // nginx, php, nodejs, python, mysql, docker, ssl, wordpress, cpanel...
  title:     text("title").notNull(),         // short label
  content:   text("content").notNull(),       // the actual knowledge (commands, explanations, gotchas)
  keywords:  text("keywords").notNull(),      // comma-separated for search
  useCount:  integer("use_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Code Pattern Library ─────────────────────────────────────────────────────
// Reusable code blueprints the agent requests via action="pattern".
// Stack-agnostic index — patterns for PHP, Node, Python, React, etc.
export const codePatternsTable = pgTable("code_patterns", {
  id:          serial("id").primaryKey(),
  name:        text("name").notNull(),        // "express-api-skeleton", "php-auth", "react-crud-page"
  stack:       text("stack").notNull(),       // php, nodejs, python, react, vue, generic
  type:        text("type").notNull(),        // auth, crud, payment, dashboard, api, landing, config
  description: text("description").notNull(),
  code:        text("code").notNull(),        // full code template
  language:    text("language").notNull(),    // php, js, ts, python, html, nginx, bash
  useCount:    integer("use_count").notNull().default(0),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

export type KnowledgeEntry = typeof knowledgeEntriesTable.$inferSelect;
export type CodePattern    = typeof codePatternsTable.$inferSelect;
