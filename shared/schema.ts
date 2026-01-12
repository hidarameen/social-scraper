import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
export * from "./models/auth";

export const platforms = ["facebook", "twitter", "instagram", "youtube", "tiktok"] as const;
export const scrapeMethods = ["api", "html", "browser"] as const;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), 
  platform: text("platform", { enum: platforms }).notNull(),
  url: text("url").notNull(),
  target: text("target"), // Telegram channel ID or webhook
  interval: integer("interval").default(60), // Minutes
  lastRun: timestamp("last_run"),
  status: text("status", { enum: ["active", "paused", "error"] }).default("active"),
  postLimit: integer("post_limit").default(10),
  scrapeMethod: text("scrape_method", { enum: scrapeMethods }).default("html"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id),
  status: text("status").notNull(), // success, error, info
  message: text("message"),
  itemsFound: integer("items_found").default(0),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const cookies = pgTable("cookies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  platform: text("platform", { enum: platforms }).notNull(),
  value: text("value").notNull(),
  name: text("name").notNull(), 
});

export const proxies = pgTable("proxies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  url: text("url").notNull(), 
  platform: text("platform", { enum: platforms }), // Optional specific platform
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  key: text("key").notNull().unique(), // e.g., "telegram_bot_token"
  value: text("value").notNull(),
});

// Zod Schemas
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, lastRun: true, createdAt: true });
export const insertCookieSchema = createInsertSchema(cookies).omit({ id: true });
export const insertProxySchema = createInsertSchema(proxies).omit({ id: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });

export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Log = typeof logs.$inferSelect;
export type Cookie = typeof cookies.$inferSelect;
export type Proxy = typeof proxies.$inferSelect;
export type Setting = typeof settings.$inferSelect;
