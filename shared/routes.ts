import { z } from 'zod';
import { insertTaskSchema, insertCookieSchema, insertProxySchema, insertSettingSchema, tasks, logs, cookies, proxies, settings } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  tasks: {
    list: {
      method: 'GET' as const,
      path: '/api/tasks',
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tasks',
      input: insertTaskSchema,
      responses: {
        201: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/tasks/:id',
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tasks/:id',
      input: insertTaskSchema.partial(),
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tasks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    test: {
      method: 'POST' as const,
      path: '/api/tasks/:id/test',
      responses: {
        200: z.object({ success: z.boolean(), message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
  },
  logs: {
    list: {
      method: 'GET' as const,
      path: '/api/logs',
      input: z.object({ taskId: z.string().optional() }).optional(),
      responses: {
        200: z.array(z.custom<typeof logs.$inferSelect>()),
      },
    },
  },
  cookies: {
    list: {
      method: 'GET' as const,
      path: '/api/cookies',
      responses: {
        200: z.array(z.custom<typeof cookies.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/cookies',
      input: insertCookieSchema,
      responses: {
        201: z.custom<typeof cookies.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/cookies/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  proxies: {
    list: {
      method: 'GET' as const,
      path: '/api/proxies',
      responses: {
        200: z.array(z.custom<typeof proxies.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/proxies',
      input: insertProxySchema,
      responses: {
        201: z.custom<typeof proxies.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/proxies/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  settings: {
    list: {
      method: 'GET' as const,
      path: '/api/settings',
      responses: {
        200: z.array(z.custom<typeof settings.$inferSelect>()),
      },
    },
    update: {
      method: 'POST' as const,
      path: '/api/settings',
      input: insertSettingSchema,
      responses: {
        200: z.custom<typeof settings.$inferSelect>(),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
