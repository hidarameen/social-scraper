import type { Express } from "express";
import type { Server } from "http";
import { setupAuth, isAuthenticated } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { ScraperManager } from "./services/scraper-manager";

async function seedDatabase(userId: number) {
  const tasks = await storage.getTasks(userId);
  if (tasks.length === 0) {
    await storage.createTask({
      userId,
      platform: "twitter",
      url: "https://twitter.com/elonmusk",
      target: "telegram_channel_1",
      interval: 60,
      postLimit: 5,
      scrapeMethod: "api",
      status: "active"
    });
    await storage.createTask({
      userId,
      platform: "youtube",
      url: "https://youtube.com/c/mrbeast",
      target: "telegram_channel_1",
      interval: 120,
      postLimit: 3,
      scrapeMethod: "html",
      status: "active"
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Setup Auth
  setupAuth(app);

  // Initialize Scraper Manager
  const scraperManager = new ScraperManager(storage);
  scraperManager.start();

  // Seed on first user access
  app.use(async (req: any, res, next) => {
    if (req.isAuthenticated()) {
      await seedDatabase(req.user.id);
    }
    next();
  });

  // --- Tasks Routes ---
  app.get(api.tasks.list.path, isAuthenticated, async (req, res) => {
    const tasks = await storage.getTasks((req.user as any).id);
    res.json(tasks);
  });

  app.post(api.tasks.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      const task = await storage.createTask({ ...input, userId: (req.user as any).id });
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.tasks.get.path, isAuthenticated, async (req, res) => {
    const task = await storage.getTask(Number(req.params.id));
    if (!task) return res.status(404).json({ message: "Not found" });
    res.json(task);
  });

  app.put(api.tasks.update.path, isAuthenticated, async (req, res) => {
    const task = await storage.updateTask(Number(req.params.id), req.body);
    res.json(task);
  });

  app.delete(api.tasks.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteTask(Number(req.params.id));
    res.status(204).send();
  });

  app.post(api.tasks.test.path, isAuthenticated, async (req, res) => {
    const taskId = Number(req.params.id);
    const task = await storage.getTask(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    try {
      await scraperManager.runTask(task);
      res.json({ success: true, message: "Test run initiated" });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  });

  // --- Logs Routes ---
  app.get(api.logs.list.path, isAuthenticated, async (req, res) => {
    const logs = await storage.getLogs(req.query.taskId ? Number(req.query.taskId) : undefined);
    res.json(logs);
  });

  // --- Cookies Routes ---
  app.get(api.cookies.list.path, isAuthenticated, async (req, res) => {
    const cookies = await storage.getCookies((req.user as any).id);
    res.json(cookies);
  });

  app.post(api.cookies.create.path, isAuthenticated, async (req, res) => {
    const input = api.cookies.create.input.parse(req.body);
    const cookie = await storage.createCookie({ ...input, userId: (req.user as any).id });
    res.status(201).json(cookie);
  });

  app.delete(api.cookies.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteCookie(Number(req.params.id));
    res.status(204).send();
  });

  // --- Proxies Routes ---
  app.get(api.proxies.list.path, isAuthenticated, async (req, res) => {
    const proxies = await storage.getProxies((req.user as any).id);
    res.json(proxies);
  });

  app.post(api.proxies.create.path, isAuthenticated, async (req, res) => {
    const input = api.proxies.create.input.parse(req.body);
    const proxy = await storage.createProxy({ ...input, userId: (req.user as any).id });
    res.status(201).json(proxy);
  });

  app.delete(api.proxies.delete.path, isAuthenticated, async (req, res) => {
    await storage.deleteProxy(Number(req.params.id));
    res.status(204).send();
  });

  // --- Settings Routes ---
  app.get(api.settings.list.path, isAuthenticated, async (req, res) => {
    const settings = await storage.getSettings((req.user as any).id);
    res.json(settings);
  });

  app.post(api.settings.update.path, isAuthenticated, async (req, res) => {
    const input = api.settings.update.input.parse(req.body);
    const setting = await storage.upsertSetting({ ...input, userId: (req.user as any).id });
    res.json(setting);
  });

  return httpServer;
}
