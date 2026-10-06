// Clean up tsx loader relative __dirname which causes Node 22 createRequire error when loading vite.config.ts
if ((globalThis as any).__dirname === ".") {
  delete (globalThis as any).__dirname;
}

import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Increase payload limit for base64 audio uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  const isTruthy = (val?: string): boolean => {
    if (!val) return false;
    const s = String(val).trim().toLowerCase();
    return s === "true" || s === "1" || s === "yes" || s === "on";
  };

  // Helper to initialize Gemini client safely with Google Cloud Vertex AI (GCP)
  const getAiClient = (userApiKey?: string, overrideLocation?: string) => {
    const customKey = userApiKey && userApiKey.trim();
    // Allow optional custom key override if explicitly provided
    if (customKey) {
      return new GoogleGenAI({
        apiKey: customKey,
        vertexai: false,
      });
    }

    const project =
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCP_PROJECT_ID ||
      process.env.GCLOUD_PROJECT ||
      process.env.PROJECT_ID ||
      process.env.GCP_PROJECT ||
      "gen-lang-client-0984398926";

    const location =
      overrideLocation ||
      process.env.GOOGLE_CLOUD_LOCATION ||
      process.env.GCP_REGION ||
      process.env.CLOUD_ML_REGION ||
      "asia-southeast1";

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.VERTEX_API_KEY;

    // Primary: Google Cloud Vertex AI Enterprise Keyless IAM (consuming GCP billing credits)
    return new GoogleGenAI({
      enterprise: true,
      vertexai: true,
      ...(project ? { project } : {}),
      ...(location ? { location } : {}),
      ...(apiKey ? { apiKey: apiKey.trim() } : {}),
    });
  };

  // Helper to extract custom user API key from request headers or body
  const extractUserApiKey = (req: express.Request): string | undefined => {
    const headerKey = req.headers["x-gemini-api-key"] as string | undefined;
    if (headerKey && headerKey.trim()) return headerKey.trim();
    const bodyKey = req.body?.customGeminiApiKey;
    if (typeof bodyKey === "string" && bodyKey.trim()) return bodyKey.trim();
    const profileKey = req.body?.userProfile?.customGeminiApiKey;
    if (typeof profileKey === "string" && profileKey.trim()) return profileKey.trim();
    return undefined;
  };

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // AI Status endpoint to verify Vertex AI state and GCP credit utilization
  app.get("/api/ai-status", (req, res) => {
    const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.PROJECT_ID || "gen-lang-client-0984398926";
    const location = process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_REGION || "asia-southeast1";
    const hasServerApiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.VERTEX_API_KEY);

    res.json({
      configured: true,
      provider: "vertex_ai",
      vertexProject: project,
      vertexLocation: location,
      billingType: "gcp_credits",
      primaryModel: "gemini-3.8-flash",
      hasServerKey: hasServerApiKey
    });
  });

  // Helper to call Gemini models with resilient fallback and custom key support
  const callGeminiWithFallback = async (options: {
    contents: any;
    config?: any;
    systemInstruction?: string;
    userApiKey?: string;
  }) => {
    let ai = getAiClient(options.userApiKey);
    const isCustomKey = Boolean(options.userApiKey && options.userApiKey.trim());

    // Normalize contents to strict Vertex AI compliant array schema: [{ role: 'user', parts: [...] }]
    let normalizedContents: any = options.contents;
    if (typeof options.contents === "string") {
      normalizedContents = options.contents;
    } else if (Array.isArray(options.contents)) {
      normalizedContents = options.contents;
    } else if (options.contents && typeof options.contents === "object") {
      if (Array.isArray(options.contents.parts)) {
        normalizedContents = [{ role: options.contents.role || "user", parts: options.contents.parts }];
      } else {
        normalizedContents = [options.contents];
      }
    }

    // Prioritize configured model, then highest tier Gemini 3.8 Flash workhorse down through
    // distinct model quota pools to maximize throughput and eliminate quota exhaustion failures.
    const configuredModel = process.env.GEMINI_MODEL || process.env.VERTEX_MODEL;
    const defaultModels = [
      "gemini-3.8-flash",      // 1st choice: Latest flagship Flash workhorse (Sept 2026) - superior reasoning & multimodal audio/vision
      "gemini-3.7-flash",      // 2nd choice: Frontier agentic & multimodal reasoning model (GA Aug 2026, separate quota pool)
      "gemini-3.6-flash",      // 3rd choice: Balanced multimodal workhorse (GA July 2026, separate quota pool)
      "gemini-3.5-flash",      // 4th choice: High-stability Flash baseline (GA May 2026, separate quota pool)
      "gemini-3.5-flash-lite", // 5th choice: Ultra-fast high-throughput tier (GA July 2026, separate quota pool)
      "gemini-3.1-flash-lite", // 6th choice: Lightweight cost-efficient high-RPM tier (GA May 2026, separate quota pool)
      "gemini-2.5-flash",      // 7th choice: Long-term stable production baseline
      "gemini-2.5-pro",        // 8th choice: High-depth reasoning fallback if all Flash quotas are exhausted
    ];
    const models = Array.from(new Set([
      ...(configuredModel ? [configuredModel.trim()] : []),
      ...defaultModels
    ]));
    let lastError: any = null;

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: normalizedContents,
          config: {
            ...options.config,
            ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
          },
        });
        if (response.text && response.text.trim()) {
          return { 
            text: response.text.trim(), 
            model,
            usageMetadata: response.usageMetadata ? {
              promptTokenCount: response.usageMetadata.promptTokenCount,
              candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
              totalTokenCount: response.usageMetadata.totalTokenCount,
            } : undefined
          };
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        console.warn(`Gemini model ${model} failed:`, errMsg);

        // If Vertex AI regional model not found (e.g. in asia-southeast1), try us-central1 global hub once
        if (
          !isCustomKey &&
          (errMsg.includes("not found") || errMsg.includes("404")) &&
          (process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_REGION) &&
          (process.env.GOOGLE_CLOUD_LOCATION || process.env.GCP_REGION) !== "us-central1"
        ) {
          try {
            console.log(`[Gemini API] Retrying model ${model} via us-central1 hub...`);
            const fallbackAi = getAiClient(options.userApiKey, "us-central1");
            const response = await fallbackAi.models.generateContent({
              model,
              contents: normalizedContents,
              config: {
                ...options.config,
                ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
              },
            });
            if (response.text && response.text.trim()) {
              ai = fallbackAi; // Update ai client for subsequent calls
              return { 
                text: response.text.trim(), 
                model,
                usageMetadata: response.usageMetadata ? {
                  promptTokenCount: response.usageMetadata.promptTokenCount,
                  candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
                  totalTokenCount: response.usageMetadata.totalTokenCount,
                } : undefined
              };
            }
          } catch (retryErr: any) {
            console.warn(`Gemini model ${model} in us-central1 also failed:`, retryErr?.message || String(retryErr));
          }
        }

        // If credits or quota are exhausted on this key, logging clear notice
        if (errMsg.includes("prepayment credits are depleted") || errMsg.includes("RESOURCE_EXHAUSTED") || err?.status === 429) {
          console.error(`[Gemini API] Quota/credits depleted for ${isCustomKey ? "custom user key" : "project server key"}. Model: ${model}. Falling back to next tier.`);
        }
      }
    }

    // Format clear user-friendly error message
    const rawErrMsg = lastError?.message || String(lastError);

    // Extract message from JSON payload if present
    let extractedMsg = rawErrMsg;
    try {
      if (rawErrMsg.includes("{") && rawErrMsg.includes("}")) {
        const start = rawErrMsg.indexOf("{");
        const end = rawErrMsg.lastIndexOf("}");
        const parsed = JSON.parse(rawErrMsg.substring(start, end + 1));
        if (parsed?.error?.message) {
          extractedMsg = parsed.error.message;
        }
      }
    } catch {}

    if (rawErrMsg.includes("prepayment credits are depleted") || rawErrMsg.includes("RESOURCE_EXHAUSTED") || lastError?.status === 429) {
      const quotaErr = new Error(
        isCustomKey 
          ? "Your personal Gemini API key has exceeded its quota or requires billing. You can generate a fresh free key at https://aistudio.google.com/apikey and update it in Settings."
          : "Server Gemini API credits/quota are depleted. Please enter your free personal Gemini API Key in Settings (BYOK) or visit https://aistudio.google.com/apikey to get one in 10 seconds."
      );
      (quotaErr as any).status = 429;
      (quotaErr as any).isQuotaExhausted = true;
      throw quotaErr;
    }

    if (rawErrMsg.includes("API key not valid") || rawErrMsg.includes("API_KEY_INVALID") || lastError?.status === 401) {
      const invalidErr = new Error("The provided Gemini API key is invalid. Please verify the key in Settings -> Personal Gemini API Key.");
      (invalidErr as any).status = 401;
      throw invalidErr;
    }

    if (
      extractedMsg.includes("Publisher model") ||
      extractedMsg.includes("not found or your project does not have access") ||
      extractedMsg.includes("PERMISSION_DENIED") ||
      lastError?.status === 404 ||
      lastError?.status === 403
    ) {
      const accessErr = new Error(
        isCustomKey
          ? "Unable to access Gemini models with this API key. Please check your key permissions at https://aistudio.google.com/apikey and update it in Settings."
          : "Server Gemini AI access is not configured on this project. Please enter your free personal Gemini API Key in Settings (BYOK) at https://aistudio.google.com/apikey to enable voice and file features."
      );
      (accessErr as any).status = isCustomKey ? 403 : 404;
      throw accessErr;
    }

    throw new Error(extractedMsg || "All Gemini models failed to generate a response");
  };

  const CLASSIFICATION_SYSTEM_INSTRUCTION = `You are an expert multilingual health & wellness logging assistant for nalama.family.
The user provides spoken audio or text in English, Tamil, Hindi, or conversational Tanglish / Hinglish describing their daily health, meals, workouts, vitals, symptoms, or medications.

Your tasks:
1. Accurate Verbatim Transcription: Transcribe every spoken word accurately without omitting any part. If the user spoke in Tamil or Hindi, transcribe the spoken words verbatim (or in romanized colloquial form as spoken).
2. Intelligent Multi-Action Segmentation & Category Classification:
   Analyze the transcription and divide it into one or more distinct, actionable health log entries.
   Each entry represents a separate event, action, food item, vitals measurement, or medication.
3. Headline / Subject Extraction:
   For every entry, generate a crisp, descriptive subject headline strictly 2 to 4 words long (e.g., "Doctor Appointment", "Healthy South-Indian Breakfast", "Blood Pressure Check", "Morning Walk", "Blood Pressure Medication", "Evening Yoga Stretch").
4. Time Bucket Classification:
   Classify every entry into one of 4 time buckets:
   - "Morning"
   - "Afternoon"
   - "Evening"
   - "Night"

   RULES FOR TIME BUCKET CLASSIFICATION:
   - If the speech/text explicitly indicates a time of day:
     * "breakfast", "morning walk", "woke up", "early stroll" -> "Morning"
     * "lunch", "afternoon", "midday" -> "Afternoon"
     * "evening walk", "sunset tea", "snacks" -> "Evening"
     * "dinner", "night", "bedtime medication", "late night", "slept" -> "Night"
   - If the classification of the event is generic (e.g., "I went to doctor today", "Took vitamins", "Checked blood pressure", "Walked 2 miles") and does not specify a time of day, use the recording local timestamp provided in the prompt to classify into one of the 4 buckets:
     * Morning: 05:00 to 11:59 (5:00 AM – 11:59 AM)
     * Afternoon: 12:00 to 16:59 (12:00 PM – 4:59 PM)
     * Evening: 17:00 to 20:59 (5:00 PM – 8:59 PM)
     * Night: 21:00 to 04:59 (9:00 PM – 4:59 AM)

Available Categories (strictly choose the best match for each entry):
- "workout": Physical exercise, running, walking, gym, sports, yoga, stretches, step counts (e.g., "Ran 1 km in 24 minutes and burned 280 calories", "Walked 4000 steps", "30 mins Surya Namaskar").
- "meal": Anything consumed to eat or drink: breakfast, lunch, dinner, snacks, fruits, coffee, tea, water intake, cheat meals, fasting status (e.g., "Had idly and sambar with filter coffee for breakfast", "Drank two cups of green tea", "Ate oatmeal with blueberries for lunch").
- "medication": Medicines, prescription pills, vitamins, supplements, syrups, insulin, injections, dosages, ointments (e.g., "Took vitamins", "Took Metformin 500mg after breakfast", "Took blood pressure tablet").
- "event": Health vitals measurements (blood pressure, blood glucose/sugar, heart rate, temperature, body weight), physical symptoms/ailments (headache, fever, knee pain, rash), doctor visits, or lab tests (e.g., "Blood pressure was 120/80 with heart rate 72", "Having mild headache since afternoon", "Checked fasting sugar 110 mg/dL").
- "general": General lifestyle reflections, mood, sleep notes, feelings, or entries that do not fit the above categories (e.g., "Slept 8 hours soundly", "Feeling energetic and relaxed").

CRITICAL RULES FOR EVENT INTEGRITY (DO NOT OVER-SPLIT):
- A single activity, workout, or event MUST be captured as a WHOLE single entry. DO NOT break down an event into separate fragments, metrics, or subordinate clauses!
  * For workouts: Distance, duration, pace, calories burned, heart rate, and exercises in that session belong in ONE entry.
    CORRECT: "I ran 1 km in 24 minutes and burned 280 calories" -> Exactly 1 entry: { "category": "workout", "headline": "Morning 1km Run", "timeBucket": "Morning", "text": "Ran 1 km in 24 minutes and burned 280 calories" }
    INCORRECT: Splitting "ran 1 km in 24 minutes" and "burned 280 calories" into two entries.
  * For meals: The foods, sides, and drink consumed together in the same meal or snack belong in ONE entry.
    CORRECT: "Had 2 idlies with chutney and a cup of tea for breakfast" -> Exactly 1 entry: { "category": "meal", "headline": "Idlis And Chutney", "timeBucket": "Morning", "text": "Had 2 idlies with chutney and tea for breakfast" }
    INCORRECT: Splitting idly and tea into separate entries.
  * For vitals/events: Measurements taken together belong in ONE entry.
    CORRECT: "Blood pressure was 120/80 and pulse was 72" -> Exactly 1 entry: { "category": "event", "headline": "Blood Pressure Check", "timeBucket": "Morning", "text": "Blood pressure 120/80, pulse 72" }
- ONLY SPLIT when the user is reporting genuinely distinct activities or events across different domains or separate times:
  * Example: "I ran for 20 minutes, had idly for lunch, and took vitamins" has 3 genuinely distinct activities (a workout, a meal, and a medication). You MUST split this into 3 items:
    [
      { "category": "workout", "headline": "Morning 20min Run", "timeBucket": "Morning", "text": "Ran for 20 minutes" },
      { "category": "meal", "headline": "Idlis For Lunch", "timeBucket": "Afternoon", "text": "Had idly for lunch" },
      { "category": "medication", "headline": "Daily Vitamins Dose", "timeBucket": "Afternoon", "text": "Took vitamins" }
    ]
- If the user speaks about a single activity or topic, output exactly 1 item in the "entries" array.
- In each entry's 'text' field, write a clear, complete statement preserving all specific quantities, numbers, metrics (calories, distance, duration), food names, or dosages. For complex entries containing multiple parameters, lab markers, scores, or physical measurements (such as body compositions, blood panels, or medical vitals), you MUST format the 'text' field into neat, beautifully spaced sections using bold labels, bullet points (•), and newlines (\n) to group related metrics for easy human scanning.
- For ANY "meal" category entry (meals, snacks, drinks), if the user does NOT explicitly state the calories, provide your best reasonable estimate for the total calories of that meal in the 'calories' field. If they do explicitly state it, use their number.
- For ANY "workout" category entry, if the user does NOT explicitly state the calories burned, provide your best reasonable estimate in the 'caloriesBurned' field. If they do explicitly state it, use their number.
- For ANY "workout" category entry or any physical activity (such as walking, running, cycling, swimming, yoga, sports, gardening, chores), extract or estimate the duration in minutes and provide it as an integer in the 'activeMinutes' field (e.g., "walked for 20 minutes" -> activeMinutes: 20, "1 hour gym session" -> activeMinutes: 60, "walked 3 km" -> activeMinutes: 35).
- If no speech or only silence is detected, return an empty transcription string and an empty entries array.

Return ONLY valid JSON matching this schema:
{
  "transcription": "full verbatim transcription",
  "entries": [
    {
      "category": "workout" | "meal" | "medication" | "event" | "general",
      "headline": "2-4 word concise headline",
      "timeBucket": "Morning" | "Afternoon" | "Evening" | "Night",
      "text": "complete description of this specific item. Use bold sub-headers, newlines, and bullets (•) to cleanly format and structure entries with multiple metrics or parameters.",
      "calories": 450, // Optional number, add your best guess of calories consumed if category is "meal"
      "caloriesBurned": 200, // Optional number, add your best guess of calories burned if category is "workout"
      "activeMinutes": 20 // Optional number, duration of physical activity in minutes (e.g. 20 for 20 mins walk)
    }
  ]
}`;

  const generateFallbackHeadline = (text: string, category: string): string => {
    const clean = text.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      const slice = words.slice(0, Math.min(4, Math.max(2, words.length)));
      return slice.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
    }
    const catDefaults: Record<string, string> = {
      workout: "Workout Activity",
      meal: "Meal Intake",
      medication: "Medication Dose",
      event: "Health Check",
      general: "Health Note",
    };
    return catDefaults[category] || "Health Note";
  };

  const inferTimeBucket = (text: string, clientTimeStr?: string): "Morning" | "Afternoon" | "Evening" | "Night" => {
    const lower = (text || "").toLowerCase();
    if (/\b(breakfast|morning|am|woke\s*up|early)\b/.test(lower)) return "Morning";
    if (/\b(lunch|noon|afternoon|midday)\b/.test(lower)) return "Afternoon";
    if (/\b(evening|sunset|tea\s*time|snacks?)\b/.test(lower)) return "Evening";
    if (/\b(dinner|night|bedtime|sleep|slept)\b/.test(lower)) return "Night";

    let hour = new Date().getHours();
    if (clientTimeStr) {
      const match = clientTimeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (match) {
        let h = parseInt(match[1], 10);
        const meridiem = match[3]?.toUpperCase();
        if (meridiem === "PM" && h < 12) h += 12;
        if (meridiem === "AM" && h === 12) h = 0;
        hour = h;
      }
    }

    if (hour >= 5 && hour < 12) return "Morning";
    if (hour >= 12 && hour < 17) return "Afternoon";
    if (hour >= 17 && hour < 21) return "Evening";
    return "Night";
  };

  // Audio Transcription and Classification endpoint
  app.post("/api/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType, clientTime } = req.body;
      const userApiKey = extractUserApiKey(req);
      if (!audioBase64) {
        return res.status(400).json({ error: "Missing audioBase64 in request body" });
      }

      // Sanitize mimeType for Gemini API
      let cleanMimeType = (mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
      if (!cleanMimeType.startsWith("audio/")) {
        cleanMimeType = "audio/webm";
      }

      console.log(`[API /transcribe] Processing audio payload: ${cleanMimeType}, size ~${Math.round(audioBase64.length * 0.75)} bytes (BYOK: ${Boolean(userApiKey)})`);

      const currentTimeHint = clientTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: cleanMimeType,
                  data: audioBase64,
                },
              },
              {
                text: `Please transcribe this audio accurately and classify all health activities into separate entries with appropriate categories, 2-4 word headlines, and time buckets (Morning, Afternoon, Evening, Night) as specified in the system instructions. Recording local time: ${currentTimeHint}.`,
              },
            ],
          },
        ],
        systemInstruction: CLASSIFICATION_SYSTEM_INSTRUCTION,
        config: {
          responseMimeType: "application/json",
        },
      });

      console.log(`[API /transcribe] Success with model: ${result.model}`);

      let parsed: { transcription?: string; entries?: Array<{ category: string; headline?: string; timeBucket?: string; text: string; calories?: number;
  caloriesBurned?: number; activeMinutes?: number }> } = {};
      try {
        parsed = JSON.parse(result.text);
      } catch (parseErr) {
        console.warn("[API /transcribe] JSON parse warning, attempting fallback text extraction:", parseErr);
        parsed = {
          transcription: result.text,
          entries: [{ category: "general", text: result.text }],
        };
      }

      const validCategories = ["workout", "meal", "medication", "event", "general"];
      const validBuckets = ["Morning", "Afternoon", "Evening", "Night"];
      const transcription = (parsed.transcription || "").trim();
      let entries = Array.isArray(parsed.entries) ? parsed.entries : [];

      entries = entries
        .filter((e) => e && typeof e.text === "string" && e.text.trim().length > 0)
        .map((e) => {
          const text = e.text.trim();
          const category = validCategories.includes(e.category) ? (e.category as any) : "general";
          let headline = (e.headline || "").trim();
          const headlineWords = headline.split(/\s+/).filter(Boolean);
          if (!headline || headlineWords.length < 2 || headlineWords.length > 5) {
            headline = generateFallbackHeadline(text, category);
          }
          const timeBucket = validBuckets.includes(e.timeBucket || "")
            ? (e.timeBucket as any)
            : inferTimeBucket(text, clientTime);

          // Fallback activeMinutes extraction from text if AI missed it (e.g. "walked for 20 minutes")
          let activeMinutes = typeof e.activeMinutes === "number" ? e.activeMinutes : (e.activeMinutes ? Number(e.activeMinutes) : undefined);
          if (activeMinutes === undefined && (category === "workout" || /\b(walk|run|jog|gym|yoga|exercise|swim|cycle|stroll)\b/i.test(text))) {
            const minMatch = text.match(/(\d+)\s*(?:mins?|minutes?)\b/i);
            const hrMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i);
            if (minMatch) {
              activeMinutes = parseInt(minMatch[1], 10);
            } else if (hrMatch) {
              activeMinutes = Math.round(parseFloat(hrMatch[1]) * 60);
            }
          }

          return {
            category,
            headline,
            timeBucket,
            calories: typeof e.calories === "number" ? e.calories : (e.calories ? Number(e.calories) : undefined),
            caloriesBurned: typeof e.caloriesBurned === "number" ? e.caloriesBurned : (e.caloriesBurned ? Number(e.caloriesBurned) : undefined),
            activeMinutes,
            text,
          };
        });

      // If transcription exists but no entries were split, create one default entry
      if (entries.length === 0 && transcription) {
        entries = [
          {
            category: "general",
            headline: generateFallbackHeadline(transcription, "general"),
            timeBucket: inferTimeBucket(transcription, clientTime),
            text: transcription,
          },
        ];
      }

      res.json({
        transcription,
        entries,
        model: result.model,
      });
    } catch (err: any) {
      console.error("[API /transcribe] Error:", err);
      res.status(500).json({ error: err.message || "Failed to transcribe and classify audio" });
    }
  });

  // Text-only Classification endpoint (for manual note entry or re-classification)
  app.post("/api/classify-text", async (req, res) => {
    try {
      const { text, clientTime } = req.body;
      const userApiKey = extractUserApiKey(req);
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text in request body" });
      }

      const currentTimeHint = clientTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: `Analyze and segment this health note: "${text}". Recording local time: ${currentTimeHint}.`,
        systemInstruction: CLASSIFICATION_SYSTEM_INSTRUCTION,
        config: {
          responseMimeType: "application/json",
        },
      });

      let parsed: { transcription?: string; entries?: Array<{ category: string; headline?: string; timeBucket?: string; text: string; calories?: number }> } = {};
      try {
        parsed = JSON.parse(result.text);
      } catch (parseErr) {
        parsed = {
          transcription: text,
          entries: [{ category: "general", text: text }],
        };
      }

      const validCategories = ["workout", "meal", "medication", "event", "general"];
      const validBuckets = ["Morning", "Afternoon", "Evening", "Night"];
      let entries = Array.isArray(parsed.entries) ? parsed.entries : [];

      entries = entries
        .filter((e) => e && typeof e.text === "string" && e.text.trim().length > 0)
        .map((e) => {
          const entryText = e.text.trim();
          const category = validCategories.includes(e.category) ? (e.category as any) : "general";
          let headline = (e.headline || "").trim();
          const headlineWords = headline.split(/\s+/).filter(Boolean);
          if (!headline || headlineWords.length < 2 || headlineWords.length > 5) {
            headline = generateFallbackHeadline(entryText, category);
          }
          const timeBucket = validBuckets.includes(e.timeBucket || "")
            ? (e.timeBucket as any)
            : inferTimeBucket(entryText, clientTime);

          let activeMinutes = typeof (e as any).activeMinutes === "number" ? (e as any).activeMinutes : ((e as any).activeMinutes ? Number((e as any).activeMinutes) : undefined);
          if (activeMinutes === undefined && (category === "workout" || /\b(walk|run|jog|gym|yoga|exercise|swim|cycle|stroll)\b/i.test(entryText))) {
            const minMatch = entryText.match(/(\d+)\s*(?:mins?|minutes?)\b/i);
            const hrMatch = entryText.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours?)\b/i);
            if (minMatch) {
              activeMinutes = parseInt(minMatch[1], 10);
            } else if (hrMatch) {
              activeMinutes = Math.round(parseFloat(hrMatch[1]) * 60);
            }
          }

          return {
            category,
            headline,
            timeBucket,
            calories: typeof e.calories === "number" ? e.calories : (e.calories ? Number(e.calories) : undefined),
            caloriesBurned: typeof (e as any).caloriesBurned === "number" ? (e as any).caloriesBurned : ((e as any).caloriesBurned ? Number((e as any).caloriesBurned) : undefined),
            activeMinutes,
            text: entryText,
          };
        });

      if (entries.length === 0) {
        entries = [
          {
            category: "general",
            headline: generateFallbackHeadline(text.trim(), "general"),
            timeBucket: inferTimeBucket(text.trim(), clientTime),
            text: text.trim(),
          },
        ];
      }

      res.json({
        transcription: parsed.transcription || text.trim(),
        entries,
        model: result.model,
      });
    } catch (err: any) {
      console.error("[API /classify-text] Error:", err);
      res.status(500).json({ error: err.message || "Failed to classify text" });
    }
  });

  // Analyze uploaded health documents and images endpoint
  app.post("/api/analyze-files", async (req, res) => {
    try {
      const { files, clientTime, userProfile } = req.body;
      const userApiKey = extractUserApiKey(req);
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Missing or empty files array in request body" });
      }

      console.log(`[API /analyze-files] Processing ${files.length} documents/images (BYOK: ${Boolean(userApiKey)})`);

      const currentTimeHint = clientTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

      const parts: any[] = [];
      for (const file of files) {
        let cleanMimeType = (file.mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase();
        parts.push({
          inlineData: {
            mimeType: cleanMimeType,
            data: file.base64,
          },
        });
      }

      const userProfileDetails = userProfile ? `
User Demographic:
- Name: ${userProfile.nickname || userProfile.displayName || "User"}
- Goals: ${userProfile.healthGoals || "General wellness"}
- Notes: ${userProfile.notes || "None"}
` : "";

      parts.push({
        text: `Analyze all these uploaded documents and/or images (which might be medical reports, lab reports, DEXA/body composition scans, fitness trackers, meal pictures, blood pressure logs, recipes, exercise logs, or notes).
Extract any relevant health log entries and group them. Current client local time is: ${currentTimeHint}. ${userProfileDetails}

Your tasks:
1. Intelligent Multi-Action Segmentation: segment the information into one or more distinct, actionable health logs.
2. Headlines and Category Selection:
   - "workout": exercise, active minutes, calories burned.
   - "meal": foods, calories consumed (estimate if missing).
   - "medication": pills, doses.
   - "event": blood pressure, heart rate, symptoms, visits, body composition/DEXA measurements, lab tests.
   - "general": reflections, sleep.
3. Keep the text objective, complete, and descriptive. For workouts, estimate activeMinutes and caloriesBurned if appropriate. For meals, estimate calories if appropriate.
4. Extracted Dates (CRITICAL):
   - Medical reports, lab tests, body composition scans, doctor visits, and fitness records often have explicit dates (e.g., 'Date of test: 01 Nov 2025', '21 Feb 2026', '20 Aug 2026', '2026-03-15').
   - You MUST extract the specific date for each entry in ISO 'YYYY-MM-DD' format into the "date" field.
   - If a document contains comparison tables or multiple dates (such as baseline vs progress vs latest), extract entries for the different dates and assign each entry its corresponding 'date' (YYYY-MM-DD)!
   - If an entry has no date mentioned anywhere in the document, set "date": null.
5. Beautiful, Structured Formatting (CRITICAL for Human Readability):
   - Long unstructured streams or paragraphs of text are hard for humans to scan.
   - For entries containing multiple parameters, lab markers, vital scores, or scan metrics (such as body compositions, blood panels, or medical vitals), you MUST format the "text" field into well-organized, neat, and beautifully spaced sections using bold labels, newlines (\\n), and bullet points (•).
   - Group related measurements logically under descriptive bold sub-headers.
   - Example style for complex scans/reports:
     **Body Composition Summary**:
     • Weight: 97.5 kg
     • Total Body Fat: 32.6% (31.8 kg)
     • Skeletal Muscle Mass: 36.1 kg
     • Lean Body Mass: 65.7 kg
     • Visceral Fat Level: 15 (Area: 171 cm²)

     **Health Indicators**:
     • Biological Age: 42
     • BWI Score: 6.0/10
     • BMR: 1789 kcal
     • Abdominal Circumference: 109.3 cm

Return ONLY a valid JSON object matching this schema:
{
  "summary": "1-2 sentence overall summary of files",
  "entries": [
    {
      "category": "workout" | "meal" | "medication" | "event" | "general",
      "headline": "2-4 word concise headline",
      "timeBucket": "Morning" | "Afternoon" | "Evening" | "Night",
      "date": "YYYY-MM-DD", // Explicit date of the test/event if mentioned (e.g. "2025-11-01" or "2026-08-20"), or null if not mentioned
      "text": "highly structured and readable objective description of this specific item. Use bold category headers, spacing, newlines (\\n), and bullet points (•) for lists of multiple metrics/parameters.",
      "calories": 450, // Optional estimated calories consumed for meals
      "caloriesBurned": 200, // Optional estimated calories burned for workouts
      "activeMinutes": 20 // Optional estimated active minutes for workouts
    }
  ]
}`
      });

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: [
          {
            role: "user",
            parts,
          },
        ],
        systemInstruction: CLASSIFICATION_SYSTEM_INSTRUCTION,
        config: {
          responseMimeType: "application/json",
        },
      });

      console.log(`[API /analyze-files] Success with model: ${result.model}`);

      let parsed: any = {};
      try {
        parsed = JSON.parse(result.text);
      } catch (parseErr) {
        console.error("Failed to parse Gemini output as JSON inside analyze-files:", result.text);
        parsed = {
          summary: "Error parsing structured items.",
          entries: [{ category: "general", headline: "Analyzed Document", text: result.text, timeBucket: "Morning" }]
        };
      }

      res.json({
        summary: parsed.summary || "Documents analyzed successfully.",
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
        model: result.model
      });

    } catch (err: any) {
      console.error("[API /analyze-files] Error:", err);
      res.status(500).json({ error: err.message || "Failed to analyze files" });
    }
  });

  // Autonomous Context Extraction endpoint
  app.post("/api/extract-context", async (req, res) => {
    try {
      const { facts, newLog, newLogs, userProfile } = req.body;
      const userApiKey = extractUserApiKey(req);
      if (!Array.isArray(facts)) {
        return res.status(400).json({ error: "Missing facts array in request body" });
      }

      const incomingLogs = Array.isArray(newLogs) 
        ? newLogs 
        : (newLog ? [newLog] : []);

      if (incomingLogs.length === 0) {
        return res.status(400).json({ error: "Missing newLog or newLogs in request body" });
      }

      const profileContextStr = userProfile ? `
User Demographic & Baseline Health Profile:
- Preferred Name: ${userProfile.nickname || userProfile.displayName || "User"}
- Age: ${userProfile.age || "Not specified"}
- Gender: ${userProfile.gender || "Not specified"}
- Height: ${userProfile.height || "Not specified"}
- Baseline Weight: ${userProfile.weight || "Not specified"}
- Lifestyle Activity Level: ${userProfile.lifestyle || "Not specified"}
- Dietary Preference: ${userProfile.dietaryPreference || "Not specified"}
- Health Goals: ${userProfile.healthGoals || "Not specified"}
- Primary Language: ${userProfile.primaryLanguage || "Not specified"}
- Personal Health Notes: ${userProfile.notes || "None"}
` : "";

      const systemPrompt = `You are an expert clinical and athletic performance data extraction engine for nalama.family.
Your task is to analyze new health and workout log entries (including external imported biometrics, sleep architecture, and granular resistance gym sessions) and update the user's Health Profile facts list.
${profileContextStr}
Current Health Profile Facts (JSON array):
${JSON.stringify(facts, null, 2)}

New Health & Workout Log Entries:
${JSON.stringify(incomingLogs, null, 2)}

Instructions:
1. Identify any new, relevant medical, diet, fitness, resistance training, or sleep recovery facts from the log entries. Use the user's baseline profile as reference context.
2. Specifically extract and maintain:
   - **Resistance & Strength Benchmarks / PRs**: e.g., "Dumbbell Bench Press top set: 24kg x 8 reps", "Squat workout volume: 4,200 kg".
   - **Cardiovascular & Vitals Baselines**: e.g., "Resting heart rate averages 58-62 bpm", "Blood pressure recorded at 118/76 mmHg", "Estimated VO2 Max: 43 ml/kg/min".
   - **Sleep Architecture & Recovery Trends**: e.g., "Averages 7.5 hrs sleep with 90 mins deep sleep", "Average HRV: 52 ms".
   - **Body Composition Updates**: e.g., "Body weight: 74.2 kg, body fat: 17.5%".
   - **Medical & Medication Adherence**: e.g., "Takes Metformin 500mg daily after breakfast".
   - **Dietary & Nutritional Preferences**: e.g., "Prefers high-protein meals", "Follows vegetarian diet".
3. STRICT ROUTINE EXTRACTION RULES:
   - NEVER create a "routine" category fact from a single log entry or ordinary meal/workout event! A single log entry (e.g., eating breakfast, eating a seed bowl, drinking a protein shake, or doing a workout) is an isolated historical log, NOT an ongoing daily recurring routine.
   - Routines must NEVER be directly auto-created from ordinary log entries. Routine habit recommendations belong in Coaching "Suggested Routines" where the user explicitly reviews and accepts them.
   - The ONLY time a fact should have category: "routine" is when the user EXPLICITLY states in their log that it is an established recurring routine (e.g., "My daily routine is...", "I do this every day at 7 AM").
   - If an existing fact in Current Health Profile Facts is a one-off food or meal that was previously misclassified as a "routine" (e.g., "Consumes a morning seed bowl", "Consumes one scoop of protein powder"), reclassify its category to "diet" or remove it.
4. For each identified fact:
   - If it represents new information, ADD a new fact object.
   - If it updates or supersedes an existing fact (e.g., a new PR or body weight replaces an older record of the same exercise or metric), UPDATE the existing fact OR replace it.
   - If a fact implies an existing condition or temporary injury is resolved, update or remove it.
5. Fact Object Schema:
   - "id": A unique string (e.g., "fact-" + random chars). If updating an existing fact, keep the existing ID.
   - "category": "medical", "diet", "fitness", or "routine". (Use "routine" ONLY for explicit user-defined recurring routines, never for meals or one-off logs).
   - "text": A concise, objective summary of the fact.
   - "source": Set to "gemini_extraction".
   - "addedAt": ISO date string.
   - "expiresAt": ISO date string or null. (Use null unless it's a temporary condition like acute soreness or cold).
   - "frequency": (Optional, for routines only) "daily", "weekly", or "specific_days".
   - "timeBucket": (Optional, for routines only) "Morning", "Afternoon", "Evening", or "Night".
6. Return ONLY the final, complete, updated JSON array of facts. Do not wrap in markdown \`\`\`json blocks. Do not add any conversational text. ONLY output the raw JSON array.`;

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.text || "[]";
      let updatedFacts;
      try {
        updatedFacts = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Gemini output as JSON:", responseText);
        throw new Error("Gemini returned invalid JSON");
      }

      res.json({ facts: updatedFacts, model: result.model });
    } catch (err: any) {
      console.error("Extract context API error:", err);
      res.status(500).json({ error: err.message || "Failed to extract context" });
    }
  });

  // Caregiver Digest Generation endpoint
  app.post("/api/generate-digest", async (req, res) => {
    try {
      const { facts, recentLogs, profileName, userProfile } = req.body;
      const userApiKey = extractUserApiKey(req);
      const memberName = profileName || (userProfile?.nickname || userProfile?.displayName) || "Family Member";

      const profileDetailsStr = userProfile ? `
User Demographic & Lifestyle:
- Age: ${userProfile.age || "Not specified"}
- Gender: ${userProfile.gender || "Not specified"}
- Lifestyle Activity Level: ${userProfile.lifestyle || "Not specified"}
- Dietary Preference: ${userProfile.dietaryPreference || "Not specified"}
- Health Goals: ${userProfile.healthGoals || "Not specified"}
- Personal Notes: ${userProfile.notes || "None"}
` : "";

      const systemPrompt = `You are the empathetic, privacy-preserving family caregiver digest writer for nalama.family.
Your goal is to generate a high-level, polite, privacy-safe status digest for family caregivers (e.g. children caring for parents or family circle members).

STRICT PRIVACY & DIGNITY RULES:
1. NEVER reveal private bathroom habits, personal indignities, raw emotional vents, or clinical jargon.
2. Focus on reassurance, overall vitality, general physical activity/movement, nutritious food & hydration, and medication adherence.
3. Keep the tone warm, respectful, supportive, and objective. If logs are in Tamil/Tanglish/Hindi, understand their meaning and express the digest warmly in English.
4. If there are concerning symptoms (acute chest pain, extreme dizziness, severe fever, missed critical medicine), set "status" to "attention" and "status_label" to "Attention Needed". Otherwise, set "status" to "good" and "status_label" to "Active & Well" or "Resting & Recovering".

Input Data:
- Profile Name: ${memberName}
${profileDetailsStr}
- Health Profile Facts:
${JSON.stringify(Array.isArray(facts) ? facts : [], null, 2)}

- Recent Activity & Health Logs:
${JSON.stringify(Array.isArray(recentLogs) ? recentLogs : [], null, 2)}

OUTPUT SCHEMA:
Return ONLY a valid JSON object matching this schema:
{
  "status": "good" | "attention",
  "status_label": "Active & Well" | "Attention Needed" | "Resting & Recovering" | "Routine Maintained",
  "summary": "1-2 warm, respectful, reassuring sentences summarizing latest status for family members.",
  "metrics": [
    {
      "id": "metric-1",
      "type": "activity" | "nutrition" | "medication" | "vitals" | "sleep" | "general",
      "title": "Short title (e.g. Physical Activity)",
      "value": "Specific high-level value (e.g. 20 mins walk, 280 kcal burned)",
      "status": "Status tag (e.g. Completed, Taken, Normal, Resting)"
    }
  ]
}

Include 2 to 4 appropriate metric items reflecting the actual activities, meals, or medications mentioned.`;

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.text || "{}";
      let digestData;
      try {
        digestData = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Gemini digest output as JSON:", responseText);
        throw new Error("Gemini returned invalid JSON for digest");
      }

      const now = new Date();
      const completeDigest = {
        id: `digest-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now.toISOString(),
        displayDate: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
        displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: digestData.status === "attention" ? "attention" : "good",
        status_label: digestData.status_label || (digestData.status === "attention" ? "Attention Needed" : "Active & Well"),
        summary: digestData.summary || "Routine maintained with good energy today.",
        metrics: Array.isArray(digestData.metrics) ? digestData.metrics : []
      };

      res.json({ digest: completeDigest, model: result.model });
    } catch (err: any) {
      console.error("Generate digest API error:", err);
      res.status(500).json({ error: err.message || "Failed to generate digest" });
    }
  });

  // Weekly Insights Generation endpoint
  app.post("/api/generate-insights", async (req, res) => {
    try {
      const { logs, facts, userProfile } = req.body;
      const userApiKey = extractUserApiKey(req);
      const userName = userProfile?.nickname || userProfile?.displayName || "User";

      const profileStr = userProfile ? `
User Profile:
- Name: ${userName}
- Age: ${userProfile.age || "Not specified"}
- Gender: ${userProfile.gender || "Not specified"}
- Activity Level: ${userProfile.lifestyle || "Moderate"}
- Dietary Preference: ${userProfile.dietaryPreference || "Standard"}
- Health Goals: ${userProfile.healthGoals || "Overall vitality & preventive health"}
- Personal Notes: ${userProfile.notes || "None"}
` : "";

      const prompt = `You are the empathetic, expert preventive health & lifestyle coach for nalama.family.
Your job is to analyze the user's recent logs, health profile facts, and goals to provide a personalized weekly wellness insight review.

${profileStr}

Health Profile Facts:
${JSON.stringify(Array.isArray(facts) ? facts : [], null, 2)}

Recent Activity & Health Logs (Past 14 Days):
${JSON.stringify(Array.isArray(logs) ? logs : [], null, 2)}

OUTPUT SCHEMA:
Return ONLY valid JSON matching this schema:
{
  "summary": "2-3 supportive, empowering sentences summarizing their overall energy, consistency, nutrition, and physical activity habits.",
  "achievements": [
    "Short accomplishment or positive habit win from recent logs",
    "Another positive win or milestone"
  ],
  "suggestedRoutines": [
    {
      "text": "Concrete routine title (e.g. 20-min evening post-dinner walk, Morning hydration & stretching)",
      "timeBucket": "Morning" | "Afternoon" | "Evening" | "Night",
      "frequency": "daily" | "weekly"
    }
  ]
}

Ensure the achievements and suggested routines are directly relevant to their actual logged data. Keep tone warm, encouraging, and actionable.`;

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.text || "{}";
      let insightsData;
      try {
        insightsData = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Gemini insights output as JSON:", responseText);
        throw new Error("Gemini returned invalid JSON for weekly insights");
      }

      res.json({
        summary: insightsData.summary || "You have been maintaining a positive, consistent routine.",
        achievements: Array.isArray(insightsData.achievements) ? insightsData.achievements : ["Maintained activity records"],
        suggestedRoutines: Array.isArray(insightsData.suggestedRoutines) ? insightsData.suggestedRoutines : [],
        model: result.model
      });
    } catch (err: any) {
      console.error("Generate insights API error:", err);
      res.status(500).json({ error: err.message || "Failed to generate weekly insights" });
    }
  });

  // Specialized Coaching Room Chat endpoint with contextual memory & recent logs
  app.post("/api/coaching-chat", async (req, res) => {
    try {
      const { roomId, message, conversationHistory, facts, recentLogs, userProfile, bridgeContext } = req.body;
      const userApiKey = extractUserApiKey(req);
      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Missing message string in request body" });
      }

      const userName = userProfile?.nickname || userProfile?.displayName || "User";

      const roomPrompts: Record<string, string> = {
        workout: `You are the Workout & Physical Movement Specialist for nalama.family.
Your expertise is in personalized functional strength, progressive overload, resistance training (reps, sets, volume, RPE), cardio, recovery, active minute targets, mobility, and injury prevention.
Adopt a motivational, safe, and science-grounded persona. Refer specifically to their logged gym exercises, weights, sets, and active minutes to provide tailored progressive overload or recovery recommendations.`,
        diet: `You are the Nutrition & Mindful Diet Specialist for nalama.family.
Your expertise is in balanced caloric distribution, macronutrients (protein, healthy fats, complex carbs), micronutrients, hydration, glycemic balance, and sustainable meal planning.
Adopt a warm, practical, non-restrictive persona. Suggest nourishing dietary improvements aligned with their preferences and recent meal logs.`,
        medical: `You are the Medical & Wellness Adherence Guide for nalama.family.
Your expertise is in medication routines, vital metric awareness (blood pressure, resting heart rate, SpO2, blood glucose), doctor consultation preparation, and preventive health habits.
ALWAYS maintain safety: provide educational guidance, remind them to consult their licensed physician for clinical decisions, and help them organize their health questions clearly.`,
        reflection: `You are the Mindful Reflection & Recovery Coach for nalama.family.
Your expertise is in sleep architecture (deep, REM, light stages, efficiency), heart rate variability (HRV), stress regulation, diaphragmatic breathing, routine consistency, and cognitive clarity.
Adopt a gentle, grounded, thoughtful persona. Encourage self-compassion and analyze how workout intensity balances with sleep quality.`
      };

      const baseRoomInstruction = roomPrompts[roomId] || roomPrompts.reflection;

      const profileStr = userProfile ? `
User Demographics & Baseline:
- Name: ${userName}
- Age: ${userProfile.age || "Not specified"}
- Gender: ${userProfile.gender || "Not specified"}
- Height: ${userProfile.height || "Not specified"}
- Baseline Weight: ${userProfile.weight || "Not specified"}
- Lifestyle Activity: ${userProfile.lifestyle || "Moderately Active"}
- Dietary Preference: ${userProfile.dietaryPreference || "Standard"}
- Health Goals: ${userProfile.healthGoals || "General wellness & vitality"}
- Target Calories: ${userProfile.userTargets?.calories || userProfile.aiTargets?.calories || "2000"} kcal
- Target Active Time: ${userProfile.userTargets?.activeTimeMins || userProfile.aiTargets?.activeTimeMins || "30"} mins
- Personal Notes: ${userProfile.notes || "None"}
` : "";

      const factsStr = Array.isArray(facts) && facts.length > 0 
        ? `\nVerified Health Facts (from context_memory.json):\n${JSON.stringify(facts, null, 2)}` 
        : "\nNo explicit health facts recorded yet.";

      const logsStr = Array.isArray(recentLogs) && recentLogs.length > 0 
        ? `\nRecent Activity & Health Logs:\n${JSON.stringify(recentLogs.slice(0, 15), null, 2)}` 
        : "\nNo recent activity logs available.";

      let systemInstruction = `${baseRoomInstruction}

${profileStr}
${factsStr}
${logsStr}
`;

      if (bridgeContext) {
        systemInstruction += `\n\nCONTINUING ACTIVE CHAT TOPIC (Bridge Context):\nThe user started a new chat thread to avoid context saturation but wants to continue the previous topic. Focus on this current active topic summary and ground your responses in these details:\n${bridgeContext}\n`;
      }

      systemInstruction += `\n\nCRITICAL COACHING RULES:
1. Address the user directly as ${userName} where natural.
2. Ground your advice explicitly in their verified health facts, target numbers, and recent logs (e.g. mention their logged workouts, active minutes, meals, or medication routines when answering).
3. Keep answers concise, high-impact, actionable, and formatted nicely in conversational paragraphs with bullet points for steps or options.
4. Support multilingual inputs (Tamil, Tanglish, Hindi, etc.) with empathetic English or contextual responses matching their language preference.
5. Emphasize sustainable, evidence-based habit formation without generic clichés.`;

      // Build contents array with conversation history
      const formattedContents: any[] = [];
      if (Array.isArray(conversationHistory)) {
        conversationHistory.forEach((msg: any) => {
          if (msg.role === "user" || msg.role === "assistant") {
            formattedContents.push({
              role: msg.role === "assistant" ? "model" : "user",
              parts: [{ text: msg.text || "" }]
            });
          }
        });
      }

      // Append current incoming user message
      formattedContents.push({
        role: "user",
        parts: [{ text: message }]
      });

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: formattedContents,
        systemInstruction,
      });

      const replyText = result.text || "I'm here to support your health journey. Could you share more details?";

      res.json({
        reply: replyText,
        model: result.model,
        usageMetadata: result.usageMetadata
      });
    } catch (err: any) {
      console.error("Coaching chat API error:", err);
      res.status(500).json({ error: err.message || "Failed to process coaching message" });
    }
  });

  // Token Counting Endpoint using Gemini API
  app.post("/api/count-tokens", async (req, res) => {
    try {
      const { contents, systemInstruction } = req.body;
      const userApiKey = extractUserApiKey(req);
      const ai = getAiClient(userApiKey);
      const configuredModel = process.env.GEMINI_MODEL || "gemini-3.8-flash";

      let normalizedContents: any = contents;
      if (typeof contents === "string") {
        normalizedContents = contents;
      } else if (Array.isArray(contents)) {
        normalizedContents = contents;
      }

      const countResponse = await ai.models.countTokens({
        model: configuredModel,
        contents: normalizedContents,
        ...(systemInstruction ? { systemInstruction } : {})
      });

      res.json({
        totalTokens: countResponse.totalTokens,
        model: configuredModel
      });
    } catch (err: any) {
      console.warn("Token counting API error:", err?.message || err);
      res.status(500).json({ error: err.message || "Failed to count tokens" });
    }
  });

  // LLM Recommended Targets Calculation endpoint
  app.post("/api/calculate-targets", async (req, res) => {
    try {
      const { userProfile, facts } = req.body;
      const userApiKey = extractUserApiKey(req);

      const profileDetails = `
User Health Profile & Demographics:
- Name: ${userProfile?.nickname || userProfile?.displayName || "User"}
- Age: ${userProfile?.age || "Not specified (assume standard adult ~45-55 if unknown)"}
- Gender: ${userProfile?.gender || "Not specified"}
- Height: ${userProfile?.height || "Not specified"}
- Weight: ${userProfile?.weight || "Not specified"}
- Lifestyle Activity Level: ${userProfile?.lifestyle || "Moderately Active"}
- Dietary Preference: ${userProfile?.dietaryPreference || "Standard balanced"}
- Health Goals: ${userProfile?.healthGoals || "General wellness & vitality"}
- Personal Health Notes: ${userProfile?.notes || "None"}
`;

      const factsContext = Array.isArray(facts) && facts.length > 0 
        ? `\nRecent Extracted Facts:\n${JSON.stringify(facts, null, 2)}` 
        : "";

      const systemPrompt = `You are an expert personalized preventive health & wellness physiologist for nalama.family.
Your job is to analyze the user's demographic, physical baseline, lifestyle activity level, and health goals to calculate evidence-based recommended daily health targets.

${profileDetails}
${factsContext}

Calculate personalized, safe, realistic daily targets for:
1. "calories": Recommended daily caloric intake (number in kcal, e.g. 1800-2400 based on gender, age, weight, and activity level).
2. "activeTimeMins": Recommended daily moderate-to-vigorous active minutes (number, e.g. 30, 45, 60).
3. "restingHeartRate": Target healthy resting heart rate (number in bpm, e.g. 60-72 bpm).
4. "weight": Ideal/recommended target weight string (e.g. "68 kg" or "150 lbs" matching user's unit system, or healthy maintainable weight).
5. "steps": Recommended daily step count (number, e.g. 6000, 7500, 10000 based on age and lifestyle).
6. "rationale": A concise 1-2 sentence friendly explanation of why these targets were selected for this profile.

OUTPUT SCHEMA:
Return ONLY valid JSON matching this schema:
{
  "recommendedTargets": {
    "calories": 2000,
    "activeTimeMins": 30,
    "restingHeartRate": 65,
    "weight": "68 kg",
    "steps": 7000,
    "rationale": "Explanation of targets"
  },
  "rationale": "Based on your moderate activity level and focus on cardiovascular fitness, 7,000 steps and 30 active minutes provide optimal daily vitality."
}`;

      const result = await callGeminiWithFallback({
        userApiKey,
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: {
          responseMimeType: "application/json",
        },
      });

      const responseText = result.text || "{}";
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (parseErr) {
        console.error("Failed to parse Gemini targets output as JSON:", responseText);
        throw new Error("Gemini returned invalid JSON for target calculation");
      }

      const targets = parsed.recommendedTargets || parsed;
      res.json({
        recommendedTargets: {
          calories: typeof targets.calories === "number" ? targets.calories : 2000,
          activeTimeMins: typeof targets.activeTimeMins === "number" ? targets.activeTimeMins : 30,
          restingHeartRate: typeof targets.restingHeartRate === "number" ? targets.restingHeartRate : 65,
          weight: typeof targets.weight === "string" ? targets.weight : (userProfile?.weight || "68 kg"),
          steps: typeof targets.steps === "number" ? targets.steps : 6000,
          rationale: targets.rationale || parsed.rationale || "Personalized daily target based on your health profile."
        },
        rationale: parsed.rationale || targets.rationale || "Personalized daily target based on your health profile.",
        model: result.model
      });
    } catch (err: any) {
      console.error("Calculate targets API error:", err);
      res.status(500).json({ error: err.message || "Failed to calculate targets" });
    }
  });

  // Key validation endpoint for user BYOK testing
  app.post("/api/test-gemini-key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      const keyToTest = (typeof apiKey === "string" && apiKey.trim()) || extractUserApiKey(req);
      if (!keyToTest) {
        return res.status(400).json({ error: "Missing API key to validate" });
      }

      const result = await callGeminiWithFallback({
        userApiKey: keyToTest,
        contents: "Respond with the word: Validated",
      });

      res.json({ success: true, message: "Gemini API key is active and working perfectly!", model: result.model });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message || "Failed to validate Gemini API key" });
    }
  });

  // Vite middleware for development vs static asset serving in production
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        hmr: { server },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Application build not found. Please verify npm run build succeeded.");
      }
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (NODE_ENV=${process.env.NODE_ENV || 'development'})`);
  });
}

startServer();
