import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const platforms = ["facebook", "twitter", "instagram", "youtube", "tiktok"] as const;
export const scrapeMethods = ["api", "html", "browser"] as const;

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id), 
  platform: text("platform", { enum: platforms }).notNull(),
  url: text("url").notNull(),
  target: text("target"), 
  interval: integer("interval").default(60), 
  lastRun: timestamp("last_run"),
  status: text("status", { enum: ["active", "paused", "error"] }).default("active"),
  postLimit: integer("post_limit").default(10),
  scrapeMethod: text("scrape_method", { enum: scrapeMethods }).default("html"),
  lastPostId: text("last_post_id"),
  messageTemplate: text("message_template"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const logs = pgTable("logs", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  status: text("status").notNull(), 
  message: text("message"),
  itemsFound: integer("items_found").default(0),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const cookies = pgTable("cookies", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  platform: text("platform", { enum: platforms }).notNull(),
  value: text("value").notNull(),
  name: text("name").notNull(), 
});

export const proxies = pgTable("proxies", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  url: text("url").notNull(), 
  platform: text("platform", { enum: platforms }), 
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().references(() => users.id),
  key: text("key").notNull().unique(), 
  value: text("value").notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, lastRun: true, createdAt: true });
export const insertCookieSchema = createInsertSchema(cookies).omit({ id: true });
export const insertProxySchema = createInsertSchema(proxies).omit({ id: true });
export const insertSettingSchema = createInsertSchema(settings).omit({ id: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Log = typeof logs.$inferSelect;
export type Cookie = typeof cookies.$inferSelect;
export type Proxy = typeof proxies.$inferSelect;
export type Setting = typeof settings.$inferSelect;
