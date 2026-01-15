# Scraping Management Dashboard Design Guidelines

## Design Approach
**System-Based**: Linear + Material Design hybrid - combines Linear's modern minimalism with Material's robust data display patterns. Optimized for information density and operational efficiency.

## Typography System
**Families**: Inter (UI/data) + JetBrains Mono (code/logs)

**Scale**:
- Dashboard title: text-2xl font-semibold
- Section headers: text-lg font-medium
- Data labels: text-sm font-medium
- Body/table text: text-sm
- Metrics/numbers: text-3xl font-bold (large displays)
- Code snippets: text-xs font-mono

## Layout Architecture

**Spacing Primitives**: Consistent use of 2, 3, 4, 6, 8, 12 (p-4, gap-6, mb-8, etc.)

**Grid Structure**:
- Sidebar: Fixed 64px collapsed / 240px expanded
- Main content: Dynamic width with max-w-full
- Content padding: p-6 on mobile, p-8 on desktop
- Card spacing: gap-6 for grid layouts

**Dashboard Layout**:
- Top: Fixed header (h-16) with breadcrumbs, theme toggle, user menu
- Left: Collapsible sidebar with navigation hierarchy
- Main: Scrollable content area with metrics cards, data tables, activity feeds

## Component Library

**Sidebar Navigation**:
- Collapsible icon-based (collapsed) / icon+label (expanded)
- Grouped sections: Overview, Scrapers, Jobs, Logs, Settings
- Active state with subtle indicator bar (left border)
- Smooth transition (300ms) between states

**Dashboard Cards**:
- Rounded corners (rounded-lg)
- Subtle borders (border-2 in light, border in dark)
- Padding: p-6
- Headers with title + action button/dropdown
- Grid layouts: 2-column on tablet, 3-4 column on desktop

**Data Tables**:
- Sticky headers
- Alternating row treatment for readability
- Status badges (pill-shaped, uppercase text-xs)
- Action dropdowns (right-aligned)
- Pagination controls (bottom)
- Row heights: compact (h-12) for dense data

**Metrics Display**:
- Large number (text-3xl font-bold)
- Small label below (text-sm opacity-70)
- Trend indicators (↑↓ icons with percentage)
- Compact cards in 4-column grid

**Status Indicators**:
- Pill badges: Running (pulse animation), Success, Failed, Queued, Paused
- Progress bars: Rounded-full, h-2, with percentage label
- Activity dots: Inline status indicators

**Forms & Controls**:
- Floating labels for inputs
- Toggle switches for boolean settings
- Dropdown selects with search for scrapers
- Date/time pickers for scheduling
- Input heights: h-10, rounded-md

**Modals/Panels**:
- Slide-over panels for details/editing (right side, w-96 to w-[600px])
- Modal dialogs for confirmations (max-w-md centered)
- Backdrop blur treatment

## Theme Implementation

**Mode Toggle**: 
- Positioned in top header (right side)
- Sun/moon icon button
- Smooth transitions (duration-200) on all elements

**Contrast Strategy**:
- Light mode: Subtle borders, minimal shadows
- Dark mode: Stronger borders, elevated cards
- Both modes: Consistent component hierarchy

## Animations
- Sidebar collapse/expand: transform + width (300ms ease-in-out)
- Theme transition: All elements (200ms)
- Loading states: Skeleton screens with shimmer
- Data refresh: Subtle fade-in for updated values
- NO excessive animations - prioritize performance

## Images Section
**No hero images** - This is an application dashboard, not a marketing page.

**Functional Images**:
- Empty states: Illustrations for "No scrapers configured" (max-w-xs, centered)
- Logo: Sidebar top when expanded (h-8)
- Icon: Sidebar top when collapsed (h-8 w-8)

## Dashboard Sections (Main Content)

1. **Overview Grid** (top):
   - 4 metric cards: Active Scrapers, Running Jobs, Success Rate, Data Collected
   - Each: Large number + trend + sparkline chart

2. **Active Jobs Table**:
   - Columns: Name, Status, Progress, Started, Duration, Actions
   - Real-time status updates
   - Quick actions dropdown

3. **Recent Activity Feed**:
   - Timeline-style list (left border accent)
   - Timestamps (relative: "2m ago")
   - Event icons + descriptions

4. **Performance Charts** (optional quick-view):
   - Line chart: Jobs over time
   - Bar chart: Success/failure rates

All sections in vertically stacked cards with consistent gap-6 spacing.