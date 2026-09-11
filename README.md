# JezSy Collection — Web Admin Dashboard

The central management interface for the JezSy Collection boutique application, built with React, Vite, and Tailwind CSS. It serves as the administrative operations platform paired with the mobile customer application and backed by a shared Supabase PostgreSQL database.

## Tech Stack
- **Framework:** React 18 + Vite
- **Styling:** Tailwind CSS + PostCSS
- **Database / Auth:** Supabase (PostgreSQL 15, Row Level Security, Realtime subscriptions)
- **Image Storage:** Supabase Storage (`products`, `pose-images`, `payment_receipts`)
- **Icons:** Lucide React
- **Notifications:** Sonner

## Features
- **Dashboard:** Real-time business metrics, active holds, and recent reservations.
- **Reservations:** Lifecycle order management, appointment scheduling, deposit review, and handover completion via canonical RPC boundaries (`complete_reservation_handover`).
- **Catalog & Inventory:** Complete product CRUD with multi-variant inventory management (`inventory` table), category associations, and hex-color attributes.
- **Staff & Access Governance:** Multi-role RBAC (`admin`, `staff`, `owner`) managed via canonical RPC procedures (`update_staff_role_v2`, `update_staff_status_v2`).
- **Device Management:** Hardware fingerprint registration, approval, and audit pruning via `admin_manage_device` and `admin_prune_devices`.
- **Operations & Settings:** Store hours configuration, holiday closures, boutique preferences, and audit logs.

## Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Setup environment variables:**
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.*
3. **Run the local server:**
   ```bash
   npm run dev
   ```
4. **Build for production:**
   ```bash
   npm run build
   ```

## Available Scripts

### Development
- `npm run dev` - Start development server at http://localhost:5173

### Build & Deploy
- `npm run build` - Create production build
- `npm run preview` - Preview production build locally
- Production hosting target: **Cloudflare Pages** (free tier) -- see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the full setup guide. `public/_redirects` (SPA routing) is in place.

### Docker (reproducible local/staging builds)
- `docker compose up --build` - Build and serve via nginx at http://localhost:8080 (requires `.env`)
- The Supabase backend stays remote/hosted per this project's shared-DB workflow.

### Testing
- `npm test` - Run Vitest test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report

### Code Quality
- `npm run lint` - Lint code with ESLint
- `npm run lint:fix` - Auto-fix lint errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## Documentation

See [docs/README.md](./docs/README.md) for the complete documentation registry and classification index.

## Security & RBAC

Access to administrative views is protected by Supabase authentication and verified against user roles (`admin`, `staff`, `owner`). Client-side mutations on sensitive entities route through audited SECURITY DEFINER RPC boundaries. Hardware device authorization enforces additional zero-trust boundary verification.
