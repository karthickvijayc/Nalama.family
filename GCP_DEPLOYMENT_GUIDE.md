# 🌐 Deploying to Google Cloud Run with GitHub Actions (Beginner-Friendly Guide)

This guide takes you through deploying **Nalama Family** directly from your GitHub repository to **Google Cloud Console (Cloud Run & Artifact Registry)** using **GitHub Actions CI/CD**.

Every time you push code to GitHub `main`, GitHub Actions will automatically:
1. Run lint and build checks.
2. Build a production Docker container.
3. Push the image to **Google Artifact Registry**.
4. Deploy the live container to **Google Cloud Run**.

---

## 🗺️ Architecture Overview

```
[ Git Push to main ] 
         │
         ▼
[ GitHub Actions CI ] ────► Builds & Tests Code + Docker Image
         │
         ▼
[ Google Artifact Registry ] ──► Stores Container Image
         │
         ▼
[ Google Cloud Run ] ────► Hosts & Auto-scales App (Public HTTPS URL)
```

---

## 🛠️ One-Time Setup on Google Cloud Console

### Step 1: Create or Select Your Google Cloud Project
1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. In the top project selector dropdown, select your project (or click **New Project** and name it `nalama-family-prod`).
3. Note down your **Project ID** (e.g. `nalama-family-123456`).

---

### Step 2: Enable Required Google Cloud APIs
In the Google Cloud Console search bar, search and enable each of these 4 APIs (or click the links):
1. **Cloud Run Admin API** (`run.googleapis.com`)
2. **Artifact Registry API** (`artifactregistry.googleapis.com`)
3. **Secret Manager API** (`secretmanager.googleapis.com`)
4. **Cloud Build API** (`cloudbuild.googleapis.com`)

*(Quick terminal command alternative if using Google Cloud Shell:)*
```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

---

### Step 3: Create an Artifact Registry Docker Repository
1. In Cloud Console, search for **Artifact Registry** (or navigate to **CI/CD > Artifact Registry**).
2. Click **+ Create Repository**.
3. Fill in:
   - **Name**: `nalama-family`
   - **Format**: `Docker`
   - **Mode**: `Standard`
   - **Location type**: `Region` (e.g., `asia-southeast1` or `us-central1`)
4. Click **Create**.

---

### Step 4: Configure Gemini / Vertex AI Authentication

You can authenticate Gemini through either **Google Cloud Vertex AI** or **Google AI Studio**:

#### Option A: Google Cloud Vertex AI (Recommended for GCP)

You have two ways to connect Vertex AI to your Cloud Run service:

1. **Keyless IAM (Best Practice for Cloud Run)**:
   - Enable Vertex AI API:
     ```bash
     gcloud services enable aiplatform.googleapis.com
     ```
   - Grant the **Vertex AI User** role (`roles/aiplatform.user`) to your Cloud Run service account:
     ```bash
     gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
       --member="serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
       --role="roles/aiplatform.user"
     ```
   - In Cloud Run environment variables (or `.env`), set:
     - `GOOGLE_GENAI_USE_VERTEXAI="true"`
     - `GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"`
     - `GOOGLE_CLOUD_LOCATION="asia-southeast1"` (or your preferred region)
   - *No API key or Secret Manager entry needed!*

2. **Vertex AI Express Mode API Key**:
   - In Cloud Console, go to **APIs & Services > Credentials** > Click **+ Create Credentials > API Key**.
   - (Recommended) Restrict the API key to the **Vertex AI API** (`aiplatform.googleapis.com`).
   - Store it in Secret Manager as `GEMINI_API_KEY` (or set environment variable `GEMINI_API_KEY`).
   - Set environment variable: `GOOGLE_GENAI_USE_VERTEXAI="true"`.

#### Option B: Google AI Studio API Key (Default)
1. In Cloud Console, search for **Secret Manager**.
2. Click **+ Create Secret**.
3. **Name**: `GEMINI_API_KEY`
4. **Secret value**: Paste your Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
5. Click **Create Secret**.

---

### Step 5: Create a Service Account for GitHub Actions
This grants GitHub Actions permission to push container images and deploy to Cloud Run.

1. Go to **IAM & Admin > Service Accounts** in the Cloud Console.
2. Click **+ Create Service Account**.
3. **Service account name**: `github-actions-deployer`
4. Click **Create and Continue**.
5. Assign the following **4 Roles**:
   - **Cloud Run Admin** (`roles/run.admin`) *(Ensures permission to create/update Cloud Run service & set public traffic)*
   - **Artifact Registry Administrator** or **Artifact Registry Writer** (`roles/artifactregistry.admin` or `roles/artifactregistry.writer`)
   - **Service Account User** (`roles/iam.serviceAccountUser`)
   - **Secret Manager Secret Accessor** (`roles/secretmanager.secretAccessor`) *(Optional, if using Secret Manager)*
6. Click **Done**.

#### Generate the JSON Key for GitHub:
1. In the Service Accounts list, click on your newly created service account (`github-actions-deployer@...`).
2. Go to the **Keys** tab at the top.
3. Click **Add Key > Create new key**.
4. Select **JSON** and click **Create**.
5. A `.json` file will download to your computer. Keep this file safe.

---

## 🔐 Add Secrets to Your GitHub Repository

1. Open your GitHub Repository: `https://github.com/karthickvijayc/Nalama.family`
2. Click **Settings** (tab at the top right of your repo).
3. In the left sidebar, click **Secrets and variables > Actions**.
4. Click **New repository secret** and add the following:

| Secret Name | What to enter |
| :--- | :--- |
| `GCP_PROJECT_ID` | Your Google Cloud Project ID (e.g., `nalama-family-123456`) |
| `GCP_SA_KEY` | Paste the **entire content** of the downloaded JSON key file |
| `GCP_REGION` | *(Optional)* The region you chose, e.g. `asia-southeast1` |
| `GCP_GAR_REPOSITORY` | *(Optional)* `nalama-family` |
| `GCP_CLOUDRUN_SERVICE` | *(Optional)* `nalama-family` |

---

## 🚀 Triggering Your First Deployment

1. Make any commit or push to your `main` branch:
   ```bash
   git add .
   git commit -m "feat: setup gcp cloud run deployment"
   git push origin main
   ```
2. In GitHub, go to the **Actions** tab.
3. You will see the **Build CI & Deploy to Google Cloud Run** workflow running.
4. When complete (takes ~2-3 minutes), click on the job to see your live Cloud Run URL:
   ```
   https://nalama-family-<random-hash>-<region>.a.run.app
   ```

---

## 🔑 Final Step: Update Google OAuth (for Google Drive Sync & Login)

To allow users to sign in and save health data to their Google Drive on your new Cloud Run URL:

1. Go to [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials).
2. Click on your **OAuth 2.0 Client ID** (Web application).
3. Under **Authorized JavaScript origins**, click **+ Add URI** and add:
   - `https://nalama-family-<hash>-<region>.a.run.app`
4. Under **Authorized redirect URIs**, click **+ Add URI** and add:
   - `https://nalama-family-<hash>-<region>.a.run.app`
5. Click **Save**.

---

## 🔄 Automatic Continuous Deployment

From now on, whenever you push code changes to GitHub:
- GitHub Actions automatically runs type tests (`lint`), builds the applet, creates the Docker image, uploads it to Artifact Registry, and updates your Cloud Run live service with zero downtime.
