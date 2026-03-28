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
   Create a `.env` file in the project root containing your Firebase configuration:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
3. **Run the local server:**
   ```bash
   npm run dev
   ```
4. **Build for production:**
   ```bash
   npm run build
   ```

## Documentation

- **[Database Schema Reference](./DATABASE_SCHEMA.md)**: Rules, document shapes, and standards for making Firebase updates that maintain parity with the Android app. 
- **[Validation Rules](./src/utils/validation.js)**: Standardized rules for the creation of Entities like Reservations, Products, and Users.

## Security 

Access to the portal is restricted to users with `role: "admin" | "staff" | "owner"`. Authentication ensures unpermitted Android customers cannot access backend controls. To securely remove legacy Android plaintext passwords, navigate to `Settings > Maintenance` on the live application.
