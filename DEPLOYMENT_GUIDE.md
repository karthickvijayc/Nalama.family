# 🚀 Nalama Family Deployment Guide (Beginner Friendly)

This guide walks you step-by-step through deploying and running **Nalama Family** — whether on Google AI Studio / Cloud Run, Railway, Render, Docker, or your local machine.

---

## 📋 Prerequisites

Before deploying, ensure you have:
1. **Node.js (v18 or higher)**: Check with `node -v`.
2. **Gemini API Key**: Free key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. **Google Cloud / OAuth Client ID** *(for Google Drive Sync & Sign-In)*:
   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
   - Create an OAuth 2.0 Client ID (Web Application).
   - Add your application domain/URL to **Authorized JavaScript origins** and **Authorized redirect URIs**.

---

## ⚡ Option 1: AI Studio / Google Cloud Run (Recommended & Simplest)

If you are using Google AI Studio:

1. **Deploying with 1 Click**:
   - In the AI Studio interface, click the **Deploy** / **Share** button in the top right corner.
   - AI Studio automatically provisions the Cloud Run container and binds the port `3000`.

2. **Configuring Environment Secrets**:
   - Navigate to the **Secrets** / **Settings** tab.
   - Add `GEMINI_API_KEY` with your API key from Google AI Studio.
   - `APP_URL` is automatically configured by Cloud Run.

---

## ☁️ Option 2: Deploy to Railway / Render / VPS (Full-Stack Node.js)

Because Nalama Family is a full-stack Node.js + Express + React app, you can host it anywhere that supports Node.js.

### Step 1: Clone Your Repository
```bash
git clone https://github.com/karthickvijayc/Nalama.family.git
cd Nalama.family
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Edit `.env` and fill in:
```env
GEMINI_API_KEY="your-gemini-api-key-here"
APP_URL="https://your-deployed-domain.com"
PORT=3000
```

### Step 4: Build the Application
```bash
npm run build
```
This will:
- Build the React SPA into `/dist` via Vite.
- Bundle the Express backend into `dist/server.cjs` via esbuild.

### Step 5: Start the Production Server
```bash
npm run start
```
The server will start listening on port `3000` (or the `PORT` env var).

---

## 🐳 Option 3: Docker Deployment

If you want to run the application in a Docker container:

### 1. Create a `Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
```

### 2. Build and Run Container:
```bash
docker build -t nalama-family .
docker run -p 3000:3000 -e GEMINI_API_KEY="your-key" -e APP_URL="http://localhost:3000" nalama-family
```

---

## ⚙️ Summary of Scripts & Commands

| Action | Command | Description |
| :--- | :--- | :--- |
| **Install** | `npm install` | Installs all required packages |
| **Development** | `npm run dev` | Starts local dev server on `http://localhost:3000` with hot-reload |
| **Type Check** | `npm run lint` | Validates TypeScript types (`tsc --noEmit`) |
| **Build** | `npm run build` | Compiles frontend and backend for production |
| **Production Start** | `npm run start` | Starts the production server (`node dist/server.cjs`) |

---

## 🔍 Verification & Testing After Deployment

1. **Open the App URL**: Load the application in your browser.
2. **Sign In**: Click **Connect with Google Drive** to authenticate your account.
3. **Log an Entry**: Use voice or manual text input to record a meal or workout.
4. **Test Gemini**: Open **AI Coaching** and send a prompt (e.g. "Review my daily nutrition") to verify that `GEMINI_API_KEY` is working.
