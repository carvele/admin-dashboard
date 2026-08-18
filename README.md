# JezSy Collection — Web Admin Dashboard

The central management interface for the JezSy Collection boutique application, built with React and Vite. It serves as the sister platform to the Android consumer application.

## Tech Stack
- **Framework:** React + Vite
- **Styling:** Vanilla CSS (no Tailwind)
- **Database / Auth:** Firebase (Firestore, Auth, Storage)
- **Icons:** Lucide React
- **Notifications:** Sonner

## Features
- **Dashboard:** Real-time metrics and recent reservations.
- **Reservations:** Order management with detailed items views and status toggles.
- **Products:** Complete catalog CRUD (Create, Read, Update, Delete) with image uploading.
- **Staff / Users:** Role-based access control (RBAC), user tracking, and manual password cleanup for legacy seed data.
- **Settings:** Advanced overrides, app configuration, and schema migration tools.

## Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Setup environment variables:**
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` and fill in your actual Firebase credentials.*
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
- Production hosting target: **Cloudflare Pages** (free tier) -- see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the full setup guide, including why Vercel/Netlify/GitHub Pages/Render/Firebase were rejected. `public/_redirects` (SPA routing) is already in place; connecting the repo to a Cloudflare account is the one remaining manual step (only the repo owner can authorize the GitHub App install).

### Docker (reproducible local/staging builds)
- `docker compose up --build` - Build and serve via nginx at http://localhost:8080 (requires `.env` -- `cp .env.example .env` and fill in real values first; Vite bakes `VITE_*` vars into the bundle at build time, so they must be present before `docker compose build`, not just at container runtime)
- `docker build -t admin-dashboard --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... .` - Equivalent without compose, passing build args directly
- The Supabase backend stays remote/hosted per this project's shared-DB workflow -- this does not containerize Postgres locally, only the built static app + nginx

### Testing
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report

### Code Quality
- `npm run lint` - Lint code with ESLint
- `npm run lint:fix` - Auto-fix lint errors
- `npm run format` - Format code with Prettier
- `npm run type-check` - Check TypeScript types

## Documentation

- **[Database Schema Reference](./DATABASE_SCHEMA.md)**: Rules, document shapes, and standards for making Firebase updates that maintain parity with the Android app. 
- **[Validation Rules](./src/utils/validation.js)**: Standardized rules for the creation of Entities like Reservations, Products, and Users.

## Security 

Access to the portal is restricted to users with `role: "admin" | "staff" | "owner"`. Authentication ensures unpermitted Android customers cannot access backend controls. To securely remove legacy Android plaintext passwords, navigate to `Settings > Maintenance` on the live application.
