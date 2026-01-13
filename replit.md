# ScrapeMaster

## Overview

ScrapeMaster is a professional social media monitoring and scraping dashboard. It allows users to create automated scraping tasks for various social media platforms (Facebook, Twitter, Instagram, YouTube, TikTok), manage authentication cookies, configure proxies, and forward scraped content to Telegram channels. The application features a React frontend with a dark-themed dashboard and an Express.js backend with PostgreSQL storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, built using Vite
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme configuration
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for dashboard analytics

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Authentication**: Passport.js with local strategy and express-session
- **API Structure**: RESTful endpoints defined in shared route schemas with Zod validation
- **Build System**: esbuild for server bundling, Vite for client bundling

### Data Storage
- **Database**: PostgreSQL accessed via Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Tables**: users, tasks, logs, cookies, proxies, settings
- **Migrations**: Managed via drizzle-kit with output to `./migrations`

### Scraping Services
- **Scraper Manager**: Central orchestrator that runs on a 60-second interval checking for active tasks
- **Platform Scrapers**: Individual scrapers for each platform (Facebook uses Playwright browser automation, others use HTTP requests)
- **Telegram Integration**: Forwards scraped content to configured Telegram channels using node-telegram-bot-api
- **Video Handling**: Uses youtube-dl-exec for downloading videos before forwarding

### Project Structure
```
client/           # React frontend application
  src/
    components/   # Reusable UI components
    hooks/        # Custom React hooks for data fetching
    pages/        # Route page components
    lib/          # Utilities and query client setup
server/           # Express backend
  services/       # Platform-specific scrapers and Telegram service
shared/           # Shared types, schemas, and route definitions
```

### Key Design Decisions
1. **Shared Schema Pattern**: Database schemas and API route definitions are shared between frontend and backend in the `shared/` directory, ensuring type safety across the stack
2. **Component Library**: Uses shadcn/ui for consistent, accessible UI components that can be customized via Tailwind
3. **Session-based Auth**: Uses express-session with Passport.js local strategy (passwords stored in plain text - noted as needing improvement for production)
4. **Polling for Real-time Updates**: Logs page uses 5-second polling interval for near real-time updates

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable

### Third-Party Services
- **Telegram Bot API**: For forwarding scraped content to channels (requires `telegram_bot_token` setting per user)

### Browser Automation
- **Playwright**: Used for Facebook scraping which requires browser-based access

### Video Processing
- **youtube-dl-exec**: Downloads videos from social media platforms for Telegram forwarding

### Required Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for express-session (defaults to "dev-secret" in development)