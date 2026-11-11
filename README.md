# Security-clean project package

This package was cleaned for safer sharing and deployment:
- removed local `.env` files and Vercel local metadata
- removed temporary access-token artifacts
- removed backup files and nested zip archives
- reduced auth/logout storage clearing to app-specific keys
- removed browser auth debug logging from the Supabase client

Before running locally, create your own `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Lokal starten (macOS)

Die Datei `Koenen Property Management lokal starten.command` doppelklicken. Sie startet den lokalen Entwicklungsserver und öffnet anschließend automatisch:

`http://127.0.0.1:5173/`

Alternativ im Terminal:

```bash
npm run dev:local
```

Das Terminalfenster muss während der lokalen Nutzung geöffnet bleiben. Zum Beenden `Ctrl + C` drücken.

# Koenen Property Management

A modern real estate web application built with **React**, **Vite**, **TypeScript**, and **Supabase**.  
The project focuses on a clean frontend architecture, modern tooling, and a production-ready deployment workflow.

## 🚀 Live Demo
👉 https://koenen-investment.com

## ✨ Features
- Modern React frontend with TypeScript
- Fast development & optimized production builds using Vite
- Responsive UI built with Tailwind CSS
- Backend-as-a-Service using Supabase (Auth & Database)
- Environment-based configuration (Development / Production)
- Continuous deployment via Vercel (CI/CD)

## 🛠️ Tech Stack
- **Frontend:** React, TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Backend:** Supabase
- **Hosting & CI/CD:** Vercel

## 📁 Project Structure

```text
koenen-property-management/
├─ public/
│  ├─ logo/                 # Static assets (logos, images)
│  └─ vite.svg
│
├─ src/
│  ├─ components/           # Reusable UI components
│  ├─ pages/                # Application pages / routes
│  ├─ lib/                  # Utilities (e.g. Supabase client)
│  ├─ assets/               # Frontend assets
│  ├─ App.tsx               # Root application component
│  └─ main.tsx              # Application entry point
│
├─ screenshots/             # Project screenshots for README
│
├─ index.html               # HTML entry file
├─ vite.config.ts           # Vite configuration
├─ tsconfig.json            # Base TypeScript configuration
├─ tsconfig.app.json        # App-specific TS config
├─ tsconfig.node.json       # Node/Vite TS config
├─ package.json             # Dependencies & scripts
└─ README.md                # Project documentation
## Produktions-Smoke-Test

Nach jedem erfolgreichen Vercel-Produktions-Deployment auf `main` startet der Workflow **Produktions-Smoke-Test**. Er prüft die öffentliche Erreichbarkeit immer und – nach einmaliger Einrichtung eines schreibgeschützten Testzugangs – zusätzlich Login, Cockpit, Buchungen und die PDF-Druckansicht eines Portfolio-Reports.

Für den echten Login-Test in GitHub unter **Settings → Secrets and variables → Actions** zwei Repository-Secrets anlegen:

- `SMOKE_TEST_EMAIL`
- `SMOKE_TEST_PASSWORD`

Verwenden Sie ausschließlich ein bereits freigegebenes Nur-Lesen-Konto ohne MFA-Pflicht, niemals das Administratorkonto. Die Secrets werden nicht ausgegeben, nicht im Code gespeichert und nicht in Artefakte übernommen. Ohne diese Secrets bleibt der Workflow grün, prüft die öffentliche Verfügbarkeit und meldet eindeutig, dass der authentifizierte Teil noch übersprungen wurde.
