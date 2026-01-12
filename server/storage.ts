import { db } from "./db";
import { 
  tasks, logs, cookies, proxies, settings,
  type Task, type InsertTask, type Log, type Cookie, type Proxy, type Setting,
  type InsertCookie, type InsertProxy, type InsertSetting
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { authStorage, type IAuthStorage } from "./replit_integrations/auth";

export interface IStorage extends IAuthStorage {
  // Tasks
  getTasks(userId: string): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, updates: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;

  // Logs
  getLogs(taskId?: number): Promise<Log[]>;
  createLog(log: typeof logs.$inferInsert): Promise<Log>;

  // Cookies
  getCookies(userId: string): Promise<Cookie[]>;
  createCookie(cookie: InsertCookie): Promise<Cookie>;
  deleteCookie(id: number): Promise<void>;

  // Proxies
  getProxies(userId: string): Promise<Proxy[]>;
  createProxy(proxy: InsertProxy): Promise<Proxy>;
  deleteProxy(id: number): Promise<void>;

  // Settings
  getSettings(userId: string): Promise<Setting[]>;
  upsertSetting(setting: InsertSetting): Promise<Setting>;
}

export class DatabaseStorage implements IStorage {
  // Auth Delegation
  getUser = authStorage.getUser.bind(authStorage);
  upsertUser = authStorage.upsertUser.bind(authStorage);

  // Tasks
  async getTasks(userId: string): Promise<Task[]> {
    return await db.select().from(tasks).where(eq(tasks.userId, userId)).orderBy(desc(tasks.createdAt));
  }
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }
  async createTask(task: InsertTask): Promise<Task> {
    const [newTask] = await db.insert(tasks).values(task).returning();
    return newTask;
  }
  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task> {
    const [updated] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return updated;
  }
  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // Logs
  async getLogs(taskId?: number): Promise<Log[]> {
    if (taskId) {
      return await db.select().from(logs).where(eq(logs.taskId, taskId)).orderBy(desc(logs.timestamp));
    }
    return await db.select().from(logs).orderBy(desc(logs.timestamp)).limit(100);
  }
  async createLog(log: typeof logs.$inferInsert): Promise<Log> {
    const [newLog] = await db.insert(logs).values(log).returning();
    return newLog;
  }

  // Cookies
  async getCookies(userId: string): Promise<Cookie[]> {
    return await db.select().from(cookies).where(eq(cookies.userId, userId));
  }
  async createCookie(cookie: InsertCookie): Promise<Cookie> {
    const [newCookie] = await db.insert(cookies).values(cookie).returning();
    return newCookie;
  }
  async deleteCookie(id: number): Promise<void> {
    await db.delete(cookies).where(eq(cookies.id, id));
  }

  // Proxies
  async getProxies(userId: string): Promise<Proxy[]> {
    return await db.select().from(proxies).where(eq(proxies.userId, userId));
  }
  async createProxy(proxy: InsertProxy): Promise<Proxy> {
    const [newProxy] = await db.insert(proxies).values(proxy).returning();
    return newProxy;
  }
  async deleteProxy(id: number): Promise<void> {
    await db.delete(proxies).where(eq(proxies.id, id));
  }

  // Settings
  async getSettings(userId: string): Promise<Setting[]> {
    return await db.select().from(settings).where(eq(settings.userId, userId));
  }
  async upsertSetting(setting: InsertSetting): Promise<Setting> {
    const [upserted] = await db
      .insert(settings)
      .values(setting)
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: setting.value },
      })
      .returning();
    return upserted;
  }
}

export const storage = new DatabaseStorage();
