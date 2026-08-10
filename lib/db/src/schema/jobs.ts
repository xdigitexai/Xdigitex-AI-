import { pgTable, serial, text, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const jobTypeEnum  = pgEnum("job_type",   ["job", "contract", "freelance", "grant", "consulting", "partnership", "government", "tender", "vacancy"]);
export const jobStatusEnum = pgEnum("job_status", ["found", "applied", "interview", "offer", "rejected"]);

export const jobsTable = pgTable("jobs", {
  id:               serial("id").primaryKey(),
  userId:           integer("user_id"),
  title:            text("title").notNull(),
  company:          text("company").notNull(),
  url:              text("url"),
  jobType:          jobTypeEnum("job_type").default("job"),
  location:         text("location"),
  salaryMin:        integer("salary_min"),
  salaryMax:        integer("salary_max"),
  skills:           text("skills"),
  matchScore:       integer("match_score"),
  status:           jobStatusEnum("status").default("found").notNull(),
  source:           text("source"),
  description:      text("description"),
  hiringManager:    text("hiring_manager"),
  closingDate:      text("closing_date"),
  coverLetter:      text("cover_letter"),
  applicationEmail: text("application_email"),
  hiringEmail:      text("hiring_email"),
  verified:         boolean("verified").default(false),
  notes:            text("notes"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true, updatedAt: true });
