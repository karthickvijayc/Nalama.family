import React, { useState } from 'react';
import { ArrowLeft, ShieldCheck, Lock, HardDrive, Cpu, FileText, CheckCircle2, Eye, Database, Share2, Trash2, Globe, AlertTriangle } from 'lucide-react';

interface LegalModalProps {
  initialView?: 'privacy' | 'terms';
  onBack: () => void;
}

export default function LegalPages({ initialView = 'privacy', onBack }: LegalModalProps) {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialView);

  return (
    <div className="flex flex-col gap-6 py-6 pb-28 animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-stone-600 hover:text-stone-900 font-bold transition-colors bg-stone-100 hover:bg-stone-200 px-3.5 py-2 rounded-xl text-sm"
          id="legal-back-btn"
        >
          <ArrowLeft size={18} />
          Back to Home
        </button>
        <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
          nalama family legal & trust
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-1.5 bg-stone-100 rounded-2xl">
        <button
          onClick={() => setActiveTab('privacy')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'privacy'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-800'
          }`}
          id="privacy-tab-btn"
        >
          <ShieldCheck size={18} className={activeTab === 'privacy' ? 'text-tree-700' : 'text-stone-400'} />
          Privacy Policy
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            activeTab === 'terms'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-800'
          }`}
          id="terms-tab-btn"
        >
          <FileText size={18} className={activeTab === 'terms' ? 'text-canopy-700' : 'text-stone-400'} />
          Terms of Service
        </button>
      </div>

      {/* Header Card */}
      <div className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-tree-50 border border-tree-100 flex items-center justify-center">
            {activeTab === 'privacy' ? (
              <Lock size={24} className="text-tree-700" />
            ) : (
              <ShieldCheck size={24} className="text-canopy-700" />
            )}
          </div>
          <div>
            <h1 className="text-2xl font-black text-stone-900">
              {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
            </h1>
            <p className="text-xs font-semibold text-stone-400">
              Application: nalama family • Last Updated: March 2026 • Version 1.1 (Beta)
            </p>
          </div>
        </div>
        <p className="text-sm text-stone-600 font-medium leading-relaxed">
          {activeTab === 'privacy'
            ? 'nalama family is engineered on a strict Zero-Database, Bring-Your-Own-Storage (BYOS) privacy architecture. We do not store, harvest, or monetize your health logs on company servers. All your records remain in your private Google Drive account.'
            : 'By accessing or using nalama family, you agree to these Terms. nalama family is a personal lifestyle wellness assistant and does NOT provide professional medical advice, clinical diagnoses, or emergency care.'}
        </p>
      </div>

      {/* PRIVACY POLICY CONTENT */}
      {activeTab === 'privacy' && (
        <div className="flex flex-col gap-6 text-stone-700">
          {/* Section 1: Overview & BYOS */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-tree-800">
              <HardDrive size={20} className="text-tree-700 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900">1. Core Philosophy: Bring Your Own Storage (BYOS)</h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              Traditional health platforms store your personal biometric records, vitals, meals, and voice audio on centralized corporate databases. <strong>nalama family is architected differently</strong>:
            </p>
            <div className="bg-tree-50/70 p-4 rounded-xl border border-tree-100 flex flex-col gap-2 mt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-tree-800">Zero Central Database Guarantee:</span>
              <ul className="text-xs font-medium text-tree-950 flex flex-col gap-1.5 list-disc list-inside">
                <li>We do not host or operate a centralized user database for your health logs or vitals.</li>
                <li>Your entire personal health archive is created and stored directly in your personal Google Drive account under the dedicated folder <code>/nalama.family/</code>.</li>
                <li>You retain 100% legal ownership, custody, and physical control over your files.</li>
              </ul>
            </div>
          </section>

          {/* Section 2: Exact Data Collected and Why */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-stone-800">
              <Database size={20} className="text-stone-700 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900">2. Information We Access and Process</h2>
            </div>
            <p className="text-sm text-stone-600">
              We process only the minimum information required to deliver the wellness assistant features:
            </p>
            <div className="flex flex-col gap-3 text-sm text-stone-600">
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-100">
                <p className="font-bold text-stone-800 mb-1">A. Google Account Identity Information</p>
                <p className="text-xs text-stone-600">
                  When you sign in via Google OAuth, we receive your email address, display name, and avatar profile picture. We use this strictly to identify your session and mount your private <code>/nalama.family</code> folder.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-100">
                <p className="font-bold text-stone-800 mb-1">B. Google Drive API Scopes & Access</p>
                <p className="text-xs text-stone-600">
                  nalama family requests Google Drive access specifically to read and write monthly health logs (<code>monthly_YYYY_MM.json</code>), your memory profile (<code>context_memory.json</code>), and care digests (<code>family_share/</code>). The app does not inspect or touch unrelated files or folders in your Google Drive.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-100">
                <p className="font-bold text-stone-800 mb-1">C. Voice Audio & Dictation</p>
                <p className="text-xs text-stone-600">
                  When you explicitly tap the Voice Recorder microphone button, your browser captures your spoken health log (e.g. "Ate oats for breakfast and walked 30 minutes"). The raw audio is temporarily streamed via an encrypted API connection to Google Gemini AI to transcribe the text and parse structured metrics. Audio recordings are not permanently stored on any server.
                </p>
              </div>

              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-100">
                <p className="font-bold text-stone-800 mb-1">D. External Biometric Imports (Health Connect & Hevy)</p>
                <p className="text-xs text-stone-600">
                  If you enable external data sync, the app reads exported workout or step summaries from your designated Drive import folder and converts them into standard log entries saved inside your personal Google Drive.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3: AI Processing & Google Gemini API */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-canopy-800">
              <Cpu size={20} className="text-canopy-700 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900">3. Artificial Intelligence & Third-Party Processing</h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              nalama family uses the Google Gemini API to analyze wellness trends, calculate calorie/step suggestions, transcribe voice logs, and generate empathetic caregiver digests.
            </p>
            <ul className="text-xs font-medium text-stone-700 flex flex-col gap-2 list-disc list-inside bg-canopy-50/50 p-4 rounded-xl border border-canopy-100">
              <li><strong>Stateless Processing:</strong> AI analysis is executed ephemerally through secure server proxies. Prompts are not used to train global public AI models.</li>
              <li><strong>No Data Brokering or Ad Tracking:</strong> We do not sell, rent, monetize, or disclose your biometric, dietary, or personal health records to data brokers, insurers, or advertising platforms.</li>
              <li><strong>No Third-Party Analytics Trackers:</strong> The application does not embed intrusive advertising SDKs or third-party behavioral trackers.</li>
            </ul>
          </section>

          {/* Section 4: Family Sharing & Granular Permissions */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-stone-800">
              <Share2 size={20} className="text-tree-700 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900">4. Family Care Sharing & Access Control</h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              When you add a family caregiver email in Settings, permissions are managed directly via native Google Drive folder sharing:
            </p>
            <ul className="text-xs text-stone-600 flex flex-col gap-1.5 list-disc list-inside">
              <li>Invited family members are granted Read-Only access <em>strictly</em> to the subfolder <code>/nalama.family/family_share</code>.</li>
              <li>Your detailed private health logs in the root folder remain unshared and inaccessible to caregivers unless explicitly granted.</li>
              <li>You can revoke caregiver access instantly at any time from the app's Settings or directly within Google Drive.</li>
            </ul>
          </section>

          {/* Section 5: Data Retention, Export & Deletion */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-stone-800">
              <Trash2 size={20} className="text-rose-600 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900">5. Data Retention, Export, and Complete Deletion</h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              Because your health data is stored in your personal Google Drive:
            </p>
            <div className="flex flex-col gap-2 text-xs text-stone-600">
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-tree-700 shrink-0 mt-0.5" />
                <span><strong>Instant Export:</strong> You can download your JSON logs or Excel summaries directly at any time from your device or Google Drive.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 size={16} className="text-tree-700 shrink-0 mt-0.5" />
                <span><strong>Instant Deletion:</strong> Deleting the <code>/nalama.family/</code> folder from your Google Drive permanently removes all your data from the application with zero remaining copies on our servers.</span>
              </div>
            </div>
          </section>

          {/* Section 6: Security Safeguards */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <div className="flex items-center gap-2 text-stone-800">
              <Lock size={20} className="text-stone-700 shrink-0" />
              <h2 className="text-lg font-bold text-stone-900">6. Security Measures</h2>
            </div>
            <p className="text-sm leading-relaxed text-stone-600">
              We employ industry-standard transport layer security (HTTPS/TLS 1.3 encryption) for all data in transit between your browser, Google Drive, and AI microservices. OAuth access tokens are kept in browser memory and refreshed safely via standard Google Identity Services.
            </p>
          </section>

          {/* Section 7: Contact Information */}
          <section className="bg-stone-50 p-5 rounded-2xl border border-stone-200 text-xs text-stone-600 flex flex-col gap-1.5">
            <span className="font-bold text-stone-900 text-sm">7. Contact the Data Controller & Developer</span>
            <p>
              If you have any questions, concerns, or requests regarding this Privacy Policy or your data, please contact the developer directly:
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
              <span className="font-semibold text-stone-800">Developer: Karthick Vijay</span>
              <span>Email: <a href="mailto:karthickvijayc@gmail.com" className="text-tree-700 font-bold underline">karthickvijayc@gmail.com</a></span>
              <span>App Domain: <a href="https://nalama.ai.studio" className="text-tree-700 font-semibold underline">https://nalama.ai.studio</a></span>
            </div>
          </section>
        </div>
      )}

      {/* TERMS OF SERVICE CONTENT */}
      {activeTab === 'terms' && (
        <div className="flex flex-col gap-6 text-stone-700">
          {/* Medical Disclaimer Banner */}
          <section className="bg-amber-50 p-5 rounded-2xl border border-amber-200/80 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle size={20} className="shrink-0 text-amber-700" />
              <span className="text-xs font-black uppercase tracking-wider">
                Non-Medical Disclaimer & Critical Safety Notice
              </span>
            </div>
            <p className="text-xs font-semibold text-amber-950 leading-relaxed">
              nalama family is a personal wellness tracking assistant and lifestyle coaching software. It is <strong>NOT a licensed medical device and does NOT provide medical diagnoses, clinical treatment plans, or emergency healthcare services</strong>. Always consult your qualified physician or healthcare professional before making health, exercise, or dietary decisions. In a medical emergency, immediately call your local emergency response service.
            </p>
          </section>

          {/* Section 1: Acceptance */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <h2 className="text-lg font-bold text-stone-900">1. Acceptance of Terms</h2>
            <p className="text-sm leading-relaxed text-stone-600">
              By accessing, installing as a Progressive Web App (PWA), or using nalama family, you agree to comply with and be legally bound by these Terms of Service. If you do not agree with any part of these terms, you must discontinue using the application.
            </p>
          </section>

          {/* Section 2: Account & Storage Responsibilities */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <h2 className="text-lg font-bold text-stone-900">2. Google Account & Storage Management</h2>
            <p className="text-sm leading-relaxed text-stone-600">
              nalama family relies on your personal Google Drive for data persistence. You are solely responsible for safeguarding your Google account credentials, managing Google Drive storage quotas, and granting or revoking folder permissions to family members.
            </p>
          </section>

          {/* Section 3: AI Recommendations & Fitness Activities */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <h2 className="text-lg font-bold text-stone-900">3. AI Wellness Guidance & User Responsibility</h2>
            <p className="text-sm leading-relaxed text-stone-600">
              Recommendations generated by our AI Coaching Rooms (Workout Coach, Nutrition Guide, Medical Routine Tracker, Mindful Recovery) are automated estimations based on your logged inputs. Generative AI outputs may contain inaccuracies. You agree to exercise common sense and individual discretion before undertaking vigorous physical activities or nutritional modifications.
            </p>
          </section>

          {/* Section 4: Prohibited Uses */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <h2 className="text-lg font-bold text-stone-900">4. Prohibited Uses</h2>
            <ul className="text-sm text-stone-600 flex flex-col gap-2 list-disc list-inside">
              <li>You may not use nalama family to store or transmit unlawful, infringing, or malicious content.</li>
              <li>You may not attempt to reverse engineer, disrupt, or overload the backend API proxy endpoints.</li>
              <li>You may not use the app to offer unlicensed commercial medical diagnostics to third parties.</li>
            </ul>
          </section>

          {/* Section 5: Limitation of Liability */}
          <section className="bg-white p-6 rounded-[2rem] border border-stone-200 shadow-xs flex flex-col gap-3">
            <h2 className="text-lg font-bold text-stone-900">5. Limitation of Liability & "As-Is" Warranty</h2>
            <p className="text-sm leading-relaxed text-stone-600">
              The application is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind. To the fullest extent permissible by law, nalama family and its developers shall not be liable for any direct, indirect, incidental, or consequential damages resulting from the use or inability to use the service.
            </p>
          </section>

          {/* Section 6: Contact */}
          <section className="bg-stone-50 p-5 rounded-2xl border border-stone-200 text-xs text-stone-600 flex flex-col gap-1.5">
            <span className="font-bold text-stone-900 text-sm">6. Contact Information</span>
            <p>
              For legal inquiries or questions regarding these terms, please contact:
            </p>
            <div className="mt-1 flex flex-col gap-0.5">
              <span className="font-semibold text-stone-800">Karthick Vijay</span>
              <span>Email: <a href="mailto:karthickvijayc@gmail.com" className="text-canopy-700 font-bold underline">karthickvijayc@gmail.com</a></span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
