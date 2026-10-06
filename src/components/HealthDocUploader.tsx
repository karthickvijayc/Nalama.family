import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  X, 
  Loader2, 
  Check, 
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Utensils,
  Pill,
  HeartPulse,
  MessageSquare,
  Trash2,
  Plus,
  Calendar,
  HelpCircle
} from 'lucide-react';
import { DriveState, HealthLogEntry, TimeBucket } from '../types';
import { readJsonFile, writeJsonFile, getOrCreateMonthlyLogFile, getOrCreateCareDigestFile, appendCaregiverDigest } from '../lib/drive';
import { hasActiveCaregivers } from '../lib/caregiverDigest';
import { getGeminiApiKeyHeader, formatAiErrorMessage } from '../lib/geminiApiKey';
import { recordTelemetry, sanitizeError } from '../lib/telemetry';
import { useWakeLock } from '../lib/wakeLock';
import { useModalBackHandler } from '../lib/backNavigation';

interface HealthDocUploaderProps {
  driveState: DriveState | null;
  onLogSaved?: () => void;
  userProfile?: any;
  floating?: boolean;
}

type UploaderState = 'idle' | 'analyzing' | 'review' | 'saving' | 'extracting' | 'generating_digest' | 'extraction_error' | 'success';

interface FileItem {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  base64: string;
}

interface ReviewEntryItem {
  id: string;
  category: HealthLogEntry['category'];
  text: string;
  headline?: string;
  timeBucket?: TimeBucket;
  date?: string;
  calories?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
}

function extractFallbackHeadline(text: string, category: string): string {
  const clean = text.replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const slice = words.slice(0, Math.min(4, Math.max(2, words.length)));
    return slice.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  const defaults: Record<string, string> = {
    workout: 'Workout Activity',
    meal: 'Meal Intake',
    medication: 'Medication Dose',
    event: 'Health Check',
    general: 'Health Note'
  };
  return defaults[category] || 'Health Note';
}

function getLocalTimeBucket(text?: string, dateOrTime?: Date | string | number): TimeBucket {
  const lower = (text || '').toLowerCase();
  if (/\b(breakfast|morning|am|woke\s*up|early)\b/.test(lower)) return 'Morning';
  if (/\b(lunch|noon|afternoon|midday)\b/.test(lower)) return 'Afternoon';
  if (/\b(evening|sunset|tea\s*time|snacks?)\b/.test(lower)) return 'Evening';
  if (/\b(dinner|night|bedtime|sleep|slept)\b/.test(lower)) return 'Night';

  let hour = new Date().getHours();
  if (dateOrTime instanceof Date) {
    hour = dateOrTime.getHours();
  } else if (typeof dateOrTime === 'number') {
    hour = new Date(dateOrTime).getHours();
  } else if (typeof dateOrTime === 'string') {
    const match = dateOrTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
    if (match) {
      let h = parseInt(match[1], 10);
      const meridiem = match[3]?.toUpperCase();
      if (meridiem === 'PM' && h < 12) h += 12;
      if (meridiem === 'AM' && h === 12) h = 0;
      hour = h;
    }
  }

  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Evening';
  return 'Night';
}

export default function HealthDocUploader({ driveState, onLogSaved, userProfile, floating = false }: HealthDocUploaderProps) {
  const [uploaderState, setUploaderState] = useState<UploaderState>('idle');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);

  // Keep screen awake while uploading, analyzing, extracting, or saving health documents
  const isProcessingDoc = uploaderState === 'analyzing' || uploaderState === 'extracting' || uploaderState === 'saving' || uploaderState === 'generating_digest';
  useWakeLock(isProcessingDoc, 'health_doc_processing');

  // Close upload/analysis modal on Android back button/swipe
  useModalBackHandler(isModalOpen || uploaderState !== 'idle', () => {
    closeUploaderModal();
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reviewEntries, setReviewEntries] = useState<ReviewEntryItem[]>([]);
  const [defaultDate, setDefaultDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [showUploadHelp, setShowUploadHelp] = useState(false);
  const [showHoldHelp, setShowHoldHelp] = useState(false);
  const holdTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestEntriesRef = useRef<HealthLogEntry[]>([]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList) => {
    const validMimeTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf', 'text/plain', 'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    const filePromises = Array.from(files).map(async (file) => {
      // Basic size guard: 10MB
      if (file.size > 10 * 1024 * 1024) {
        throw new Error(`File ${file.name} is too large. Maximum size is 10MB.`);
      }
      const base64 = await fileToBase64(file);
      return {
        id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        file,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64
      };
    });

    try {
      setErrorMessage(null);
      const parsedFiles = await Promise.all(filePromises);
      setSelectedFiles(prev => [...prev, ...parsedFiles]);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error parsing files. Please try again.');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
  };

  const removeSelectedFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const analyzeDocuments = async () => {
    if (selectedFiles.length === 0) {
      setErrorMessage('Please select at least one document or image to analyze.');
      return;
    }

    // Auto-close the initial upload popup so it does not linger behind the analysis/review modal
    setIsModalOpen(false);
    setUploaderState('analyzing');
    setErrorMessage(null);

    try {
      const localTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const filesPayload = selectedFiles.map(f => ({
        name: f.name,
        mimeType: f.mimeType,
        base64: f.base64
      }));

      const tStart = performance.now();
      const response = await fetch('/api/analyze-files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getGeminiApiKeyHeader()
        },
        body: JSON.stringify({
          files: filesPayload,
          clientTime: localTimeStr,
          userProfile
        })
      });

      const durationMs = performance.now() - tStart;
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errText = errData.error || `Analysis failed (${response.status})`;
        const sanitized = sanitizeError({ message: errText, status: response.status });
        recordTelemetry({
          capability: 'ai',
          operation: 'analyze_documents',
          status: 'error',
          durationMs,
          statusCode: response.status,
          errorCode: sanitized.errorCode,
          summary: sanitized.summary,
          meta: { filesCount: filesPayload.length }
        });
        throw new Error(errText);
      }

      const data = await response.json();
      recordTelemetry({
        capability: 'ai',
        operation: 'analyze_documents',
        status: 'success',
        durationMs,
        statusCode: response.status,
        summary: `Documents analyzed (${data.entries?.length || 1} entries extracted)`,
        meta: {
          filesCount: filesPayload.length,
          entriesCount: data.entries?.length || 1
        }
      });
      
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        const items: ReviewEntryItem[] = data.entries.map((item: any, idx: number) => ({
          id: `entry-${Date.now()}-${idx}`,
          category: (item.category as HealthLogEntry['category']) || 'general',
          text: item.text || '',
          headline: item.headline || extractFallbackHeadline(item.text || '', item.category || 'general'),
          timeBucket: item.timeBucket || getLocalTimeBucket(item.text || '', new Date()),
          date: (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) ? item.date : defaultDate,
          calories: typeof item.calories === 'number' ? item.calories : (item.calories ? Number(item.calories) : undefined),
          caloriesBurned: typeof item.caloriesBurned === 'number' ? item.caloriesBurned : (item.caloriesBurned ? Number(item.caloriesBurned) : undefined),
          activeMinutes: typeof item.activeMinutes === 'number' ? item.activeMinutes : (item.activeMinutes ? Number(item.activeMinutes) : undefined)
        }));
        setReviewEntries(items);
      } else {
        setReviewEntries([{
          id: `entry-${Date.now()}-0`,
          category: 'general',
          text: data.summary || 'Uploaded documents analyzed.',
          headline: 'Documents Analyzed',
          timeBucket: getLocalTimeBucket('', new Date()),
          date: defaultDate
        }]);
      }

      setUploaderState('review');
    } catch (err: any) {
      console.error('File analysis error:', err);
      const sanitized = sanitizeError(err);
      recordTelemetry({
        capability: 'ai',
        operation: 'analyze_documents',
        status: 'error',
        statusCode: sanitized.statusCode || 500,
        errorCode: sanitized.errorCode,
        summary: sanitized.summary
      });
      setErrorMessage(`Analysis notice: ${formatAiErrorMessage(err)}. You can manually input notes below.`);
      setReviewEntries([{
        id: `entry-${Date.now()}-0`,
        category: 'general',
        text: '',
        headline: 'Manual Health Note',
        timeBucket: getLocalTimeBucket('', new Date()),
        date: defaultDate
      }]);
      setUploaderState('review');
    }
  };

  const reclassifyWithAi = async () => {
    const combinedText = reviewEntries.map(e => e.text.trim()).filter(Boolean).join('. ');
    if (!combinedText.trim()) {
      setErrorMessage('Please enter some text before asking AI to classify.');
      return;
    }

    setIsClassifying(true);
    setErrorMessage(null);
    try {
      const localTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const response = await fetch('/api/classify-text', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getGeminiApiKeyHeader()
        },
        body: JSON.stringify({ text: combinedText, clientTime: localTimeStr })
      });

      if (!response.ok) {
        throw new Error('Classification service failed');
      }

      const data = await response.json();
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        setReviewEntries(data.entries.map((item: any, idx: number) => ({
          id: `entry-${Date.now()}-${idx}`,
          category: item.category || 'general',
          text: item.text || '',
          headline: item.headline || extractFallbackHeadline(item.text || '', item.category || 'general'),
          timeBucket: item.timeBucket || getLocalTimeBucket(item.text || '', new Date()),
          date: (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) ? item.date : (reviewEntries[idx]?.date || defaultDate),
          calories: typeof item.calories === 'number' ? item.calories : (item.calories ? Number(item.calories) : undefined),
          caloriesBurned: typeof item.caloriesBurned === 'number' ? item.caloriesBurned : (item.caloriesBurned ? Number(item.caloriesBurned) : undefined),
          activeMinutes: typeof item.activeMinutes === 'number' ? item.activeMinutes : (item.activeMinutes ? Number(item.activeMinutes) : undefined)
        })));
      }
    } catch (err: any) {
      console.error('Reclassify error:', err);
      setErrorMessage('Could not reclassify automatically. You can choose categories manually.');
    } finally {
      setIsClassifying(false);
    }
  };

  const extractContext = async (entries: HealthLogEntry[]) => {
    if (!driveState) return;
    setUploaderState('extracting');
    setErrorMessage(null);
    try {
      const contextData = await readJsonFile(driveState.token, driveState.contextFileId);
      const currentFacts = contextData?.facts || [];
      const userProfileObj = contextData?.user_profile || null;

      const res = await fetch('/api/extract-context', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getGeminiApiKeyHeader()
        },
        body: JSON.stringify({ facts: currentFacts, newLogs: entries, userProfile: userProfileObj })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      
      const { facts: updatedFacts } = await res.json();
      const newContextData = { ...(contextData || { schema_version: "1.0", family_members: [] }), facts: updatedFacts };
      await writeJsonFile(driveState.token, 'context_memory.json', newContextData, driveState.mainFolderId, driveState.contextFileId);

      // Gate Caregiver Digest Generation: Only generate if caregivers are active
      const hasCaregivers = await hasActiveCaregivers(driveState.token, driveState.familyFolderId);
      if (hasCaregivers) {
        setUploaderState('generating_digest');
        try {
          const preferredName = userProfileObj?.nickname || userProfileObj?.displayName || 'Family Member';
          const digestRes = await fetch('/api/generate-digest', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              ...getGeminiApiKeyHeader()
            },
            body: JSON.stringify({
              facts: updatedFacts,
              recentLogs: entries,
              profileName: preferredName,
              userProfile: userProfileObj
            })
          });

          if (digestRes.ok) {
            const { digest } = await digestRes.json();
            if (digest) {
              const { fileId } = await getOrCreateCareDigestFile(driveState.token, driveState.familyFolderId, preferredName);
              await appendCaregiverDigest(driveState.token, driveState.familyFolderId, fileId, digest);
            }
          }
        } catch (digestErr) {
          console.warn('Digest generation warning:', digestErr);
        }
      }

      setUploaderState('success');
      setIsModalOpen(false);
      setSelectedFiles([]);
      if (onLogSaved) onLogSaved();

      setTimeout(() => {
        closeUploaderModal();
      }, 1500);

    } catch (err: any) {
      console.error('Extract context error:', err);
      setErrorMessage("Logs saved, but health profile fact extraction failed. You can retry below.");
      setUploaderState('extraction_error');
      latestEntriesRef.current = entries;
    }
  };

  const saveToHealthLog = async () => {
    const validItems = reviewEntries.filter(e => e.text.trim().length > 0);
    if (validItems.length === 0) {
      setErrorMessage('Please enter at least one health note before saving.');
      return;
    }

    if (!driveState) {
      setErrorMessage('Google Drive connection not initialized. Please login again.');
      return;
    }

    setUploaderState('saving');
    try {
      const now = new Date();

      const newEntries: HealthLogEntry[] = validItems.map((item, index) => {
        const itemHeadline = item.headline && item.headline.trim() 
          ? item.headline.trim() 
          : extractFallbackHeadline(item.text, item.category);
        const itemBucket = item.timeBucket || getLocalTimeBucket(item.text, now);

        // Determine actual date
        const dateStr = item.date || defaultDate;
        let entryDate = new Date();
        try {
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
              entryDate = new Date(y, m, d, now.getHours(), now.getMinutes(), now.getSeconds() + index);
            }
          }
        } catch {
          entryDate = now;
        }

        return {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${index}`,
          timestamp: entryDate.toISOString(),
          displayTime: entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          displayDate: entryDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          transcript: item.text.trim(),
          category: item.category,
          source: 'manual',
          headline: itemHeadline,
          timeBucket: itemBucket,
          calories: item.calories,
          caloriesBurned: item.caloriesBurned,
          activeMinutes: item.activeMinutes,
        };
      });

      // Group entries by monthly partition
      const entriesByMonth: Record<string, { targetDate: Date; entries: HealthLogEntry[] }> = {};
      newEntries.forEach(entry => {
        const d = new Date(entry.timestamp);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!entriesByMonth[mKey]) {
          entriesByMonth[mKey] = { targetDate: d, entries: [] };
        }
        entriesByMonth[mKey].entries.push(entry);
      });

      // Save each partition to its respective month file
      for (const mKey of Object.keys(entriesByMonth)) {
        const { targetDate, entries } = entriesByMonth[mKey];
        const { fileId, fileName } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId, targetDate);
        const existingData = await readJsonFile(driveState.token, fileId) || { schema_version: '1.0', month: mKey, logs: [] };
        const currentLogs: HealthLogEntry[] = Array.isArray(existingData.logs) ? existingData.logs : [];
        const updatedLogs = [...entries, ...currentLogs];
        const updatedContent = {
          schema_version: '1.0',
          month: mKey,
          updated_at: new Date().toISOString(),
          logs: updatedLogs
        };

        await writeJsonFile(
          driveState.token,
          fileName,
          updatedContent,
          driveState.mainFolderId,
          fileId
        );
      }

      await extractContext(newEntries);

    } catch (err: any) {
      console.error('Failed to save log:', err);
      setErrorMessage(`Failed to save log: ${err.message}`);
      setUploaderState('review');
    }
  };

  const updateEntryCategory = (id: string, newCategory: HealthLogEntry['category']) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, category: newCategory } : e));
  };

  const updateEntryDate = (id: string, newDate: string) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, date: newDate } : e));
  };

  const updateEntryHeadline = (id: string, newHeadline: string) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, headline: newHeadline } : e));
  };

  const updateEntryTimeBucket = (id: string, newBucket: TimeBucket) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, timeBucket: newBucket } : e));
  };

  const updateEntryCalories = (id: string, calories?: number) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, calories } : e));
  };

  const updateEntryCaloriesBurned = (id: string, caloriesBurned?: number) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, caloriesBurned } : e));
  };

  const updateEntryActiveMinutes = (id: string, activeMinutes?: number) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, activeMinutes } : e));
  };

  const updateEntryText = (id: string, newText: string) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, text: newText } : e));
  };

  const removeReviewEntry = (id: string) => {
    setReviewEntries(prev => {
      const remaining = prev.filter(e => e.id !== id);
      return remaining.length > 0 ? remaining : [{ id: `entry-${Date.now()}-0`, category: 'general', text: '', headline: '', timeBucket: getLocalTimeBucket('', new Date()) }];
    });
  };

  const addReviewEntry = () => {
    setReviewEntries(prev => [
      ...prev,
      { id: `entry-${Date.now()}-${prev.length}`, category: 'general', text: '', headline: '', timeBucket: getLocalTimeBucket('', new Date()) }
    ]);
  };

  const categoryOptions: { key: HealthLogEntry['category']; label: string; icon: React.ReactNode; activeColor: string; pillColor: string }[] = [
    { key: 'workout', label: 'Workout', icon: <Dumbbell size={14} />, activeColor: 'bg-tree-600 text-white border-tree-600', pillColor: 'bg-tree-50 text-tree-700 border-tree-200' },
    { key: 'meal', label: 'Meal', icon: <Utensils size={14} />, activeColor: 'bg-amber-600 text-white border-amber-600', pillColor: 'bg-amber-50 text-amber-800 border-amber-200' },
    { key: 'medication', label: 'Medication', icon: <Pill size={14} />, activeColor: 'bg-rose-600 text-white border-rose-600', pillColor: 'bg-rose-50 text-rose-800 border-rose-200' },
    { key: 'event', label: 'Vitals/Event', icon: <HeartPulse size={14} />, activeColor: 'bg-teal-600 text-white border-teal-600', pillColor: 'bg-teal-50 text-teal-800 border-teal-200' },
    { key: 'general', label: 'General', icon: <MessageSquare size={14} />, activeColor: 'bg-stone-800 text-white border-stone-800', pillColor: 'bg-stone-100 text-stone-700 border-stone-200' },
  ];

  const handleHoldStart = () => {
    holdTimerRef.current = setTimeout(() => {
      setShowHoldHelp(true);
    }, 350);
  };

  const handleHoldEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
  };

  const openUploaderModal = () => {
    setIsModalOpen(true);
    setErrorMessage(null);
    setShowHoldHelp(false);
  };

  const closeUploaderModal = () => {
    setIsModalOpen(false);
    setUploaderState('idle');
    setSelectedFiles([]);
    setReviewEntries([]);
    setErrorMessage(null);
    setShowHoldHelp(false);
  };

  // Drag & drop dropzone JSX
  const dropzoneJsx = (
    <div className="flex flex-col gap-4">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        accept="image/*,application/pdf,text/plain,text/csv,.docx,.xlsx"
        className="hidden"
      />

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onUploadClick}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2.5 ${
          isDragActive 
            ? 'border-tree-500 bg-tree-50/40' 
            : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50/50 bg-stone-50/20'
        }`}
      >
        <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 group-hover:scale-110 transition-transform">
          <Upload size={24} className="text-stone-500" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-stone-800">
            Drag & drop files here, or <span className="text-tree-600 hover:text-tree-700 underline">browse</span>
          </span>
          <span className="text-xs text-stone-400 font-semibold">
            Supports Images, PDF, TXT, CSV, Word, Excel (Max 10MB)
          </span>
        </div>
      </div>

      {/* Selected Files List */}
      {selectedFiles.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center px-1">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">
              Selected Files ({selectedFiles.length})
            </span>
            <button
              onClick={() => setSelectedFiles([])}
              className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Clear All
            </button>
          </div>
          <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1">
            {selectedFiles.map(fileItem => {
              const isImage = fileItem.mimeType.startsWith('image/');
              return (
                <div 
                  key={fileItem.id} 
                  className="flex items-center justify-between p-2.5 bg-stone-50 rounded-xl border border-stone-200/80 text-xs text-stone-800 font-semibold"
                >
                  <div className="flex items-center gap-2 overflow-hidden mr-2">
                    {isImage ? (
                      <ImageIcon size={16} className="text-tree-600 shrink-0" />
                    ) : (
                      <FileText size={16} className="text-orange-500 shrink-0" />
                    )}
                    <span className="truncate" title={fileItem.name}>{fileItem.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSelectedFile(fileItem.id);
                    }}
                    className="p-1 hover:bg-stone-200 text-stone-400 hover:text-rose-600 rounded-lg transition-colors shrink-0 cursor-pointer"
                    aria-label="Remove file"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          <button
            onClick={analyzeDocuments}
            className="mt-2 w-full py-3 bg-tree-700 hover:bg-tree-800 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-98 cursor-pointer"
          >
            <Sparkles size={16} />
            <span>Analyze with Gemini AI</span>
          </button>
        </div>
      )}

      {/* Error display */}
      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-150 text-rose-800 rounded-xl text-xs font-medium flex items-start gap-2">
          <AlertCircle size={16} className="shrink-0 mt-0.5 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Floating Left Trigger Button (when floating mode is active and idle) */}
      {floating && uploaderState === 'idle' && (
        <div className="relative">
          {/* Help Tooltip shown on Press & Hold or Hover */}
          {showHoldHelp && (
            <div className="absolute bottom-full left-0 mb-3 w-64 p-3.5 bg-gradient-to-br from-[#1E2E25] via-[#17261E] to-[#121E17] text-stone-100 text-xs rounded-2xl shadow-2xl border border-tree-600/40 z-50 animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2 h-2 rounded-full bg-sky-400" />
                    <p className="font-bold text-white text-xs tracking-wide">Upload File / Logs</p>
                  </div>
                  <p className="text-stone-300 text-[11px] leading-relaxed">
                    Upload medical bills, prescriptions, meal photos, or lab records. Gemini AI extracts and parses them into your health log.
                  </p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHoldHelp(false);
                  }}
                  className="text-stone-400 hover:text-white p-0.5 cursor-pointer shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="w-2.5 h-2.5 bg-[#121E17] rotate-45 absolute -bottom-1 left-6 border-r border-b border-tree-600/40" />
            </div>
          )}

          <button 
            onClick={openUploaderModal}
            onPointerDown={handleHoldStart}
            onPointerUp={handleHoldEnd}
            onPointerCancel={handleHoldEnd}
            onContextMenu={(e) => {
              e.preventDefault();
              setShowHoldHelp(true);
            }}
            onMouseEnter={() => setShowHoldHelp(true)}
            onMouseLeave={() => {
              handleHoldEnd();
              setShowHoldHelp(false);
            }}
            className="flex items-center gap-2.5 sm:gap-3 bg-gradient-to-r from-blue-700 via-sky-700 to-blue-800 hover:from-blue-800 hover:to-blue-900 active:scale-95 text-white rounded-full pl-3.5 pr-4.5 sm:pl-4 sm:pr-5 py-3 sm:py-3.5 shadow-xl shadow-blue-950/25 transition-all group border border-blue-400/30 cursor-pointer"
            aria-label="Upload Logs and Documents"
          >
            <div className="bg-white/20 p-2 sm:p-2.5 rounded-full group-hover:bg-white/30 transition-colors">
              <Upload size={18} className="sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="font-bold text-sm sm:text-base leading-tight">Upload</span>
              <span className="text-[10px] font-semibold text-blue-100/90 tracking-wide">Docs & Photos</span>
            </div>
          </button>
        </div>
      )}

      {/* Floating Modal Popup when triggered */}
      {floating && isModalOpen && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-tree-50 border border-tree-200/80 flex items-center justify-center text-tree-700 shadow-2xs">
                  <Upload size={18} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-stone-900 leading-none">Upload Health Logs</h3>
                  <span className="text-[10px] text-stone-400 font-semibold tracking-wide uppercase mt-1 inline-block">Secure BYOS Upload</span>
                </div>
              </div>
              <button
                onClick={closeUploaderModal}
                className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
                aria-label="Close upload modal"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-stone-500 font-medium leading-relaxed">
              Upload medical bills, prescriptions, meal/fitness logs, or lab summaries. AI categorizes entries directly into your private Google Drive space.
            </p>

            {dropzoneJsx}
          </div>
        </div>
      )}

      {/* Inline non-floating mode */}
      {!floating && (
        <div className="bg-white rounded-[1.75rem] border border-stone-200/90 p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-tree-50 border border-tree-200/80 flex items-center justify-center text-tree-700 shadow-2xs">
                <Upload size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-stone-900 leading-none">Upload Logs</h3>
                <span className="text-[10px] text-stone-400 font-semibold tracking-wide uppercase mt-1 inline-block">Secure BYOS Upload</span>
              </div>
            </div>
            <button 
              onClick={() => setShowUploadHelp(!showUploadHelp)}
              className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                showUploadHelp 
                  ? 'bg-sky-50 text-sky-700 border-sky-200 shadow-2xs' 
                  : 'bg-stone-50 text-stone-400 border-stone-200 hover:text-stone-600'
              }`}
              aria-label="Upload help info"
            >
              <HelpCircle size={14} />
            </button>
          </div>

          {showUploadHelp && (
            <div className="bg-gradient-to-r from-tree-50/50 to-sky-50/50 border border-tree-100 rounded-2xl p-3 text-xs text-stone-600 font-medium leading-relaxed animate-in fade-in">
              <span>Upload medical bills, prescriptions, meal/fitness logs, or lab summaries. Our private local model parses and categorizes entries directly into your secure Google Drive space.</span>
            </div>
          )}

          {dropzoneJsx}
        </div>
      )}

      {/* Full Screen Processing State Overlays */}
      {uploaderState === 'analyzing' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-tree-50 text-tree-600 flex items-center justify-center">
              <Loader2 size={36} className="animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Gemini AI is analyzing...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Reading health logs, images, and files to automatically classify wellness events, meals, or workouts.
            </p>
          </div>
        </div>
      )}

      {uploaderState === 'saving' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Loader2 size={36} className="animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Saving to Google Drive...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Updating your secure partitioned health log in your private storage.
            </p>
          </div>
        </div>
      )}

      {uploaderState === 'extracting' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles size={36} className="animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Updating Health Profile...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Gemini is extracting new facts and updating your personal context memory.
            </p>
          </div>
        </div>
      )}

      {uploaderState === 'generating_digest' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center animate-pulse">
              <Sparkles size={36} />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Updating Family Digest...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Gemini is composing a privacy-safe overview for your shared family circle.
            </p>
          </div>
        </div>
      )}

      {uploaderState === 'success' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center">
              <Check size={36} strokeWidth={3} />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Saved to Health Log!</h3>
            <p className="text-sm text-stone-500 font-medium">
              Your categorized health entries have been safely stored in your private Google Drive.
            </p>
          </div>
        </div>
      )}

      {uploaderState === 'extraction_error' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">Profile Update Note</h3>
              <p className="text-sm text-stone-500 font-medium leading-relaxed mt-2">
                Your entries were safely saved to Google Drive, but background Health Profile fact extraction failed.
              </p>
            </div>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={closeUploaderModal}
                className="flex-1 py-3 border border-stone-200 text-stone-600 font-bold rounded-xl hover:bg-stone-50 transition-colors"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  if (latestEntriesRef.current.length > 0) {
                    extractContext(latestEntriesRef.current);
                  }
                }}
                className="flex-1 py-3 bg-tree-700 hover:bg-tree-800 text-white font-bold rounded-xl transition-all"
              >
                Retry Fact Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review & Edit Modal (Identical, visually pristine, cohesive review modal) */}
      {uploaderState === 'review' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles size={20} className="text-tree-600 animate-pulse" />
                  <h3 className="text-xl font-bold text-stone-900">
                    Review Extracted Entries
                  </h3>
                  {reviewEntries.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-tree-100 text-tree-800">
                      {reviewEntries.length} Items Detected
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 font-medium mt-0.5">
                  Gemini analyzed your document and structured it. Verify and refine the items before logging.
                </p>
              </div>
              <button 
                onClick={closeUploaderModal}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Error Display */}
            {errorMessage && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Classified Entries List */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  Extracted Items ({reviewEntries.length})
                </label>
                <button
                  type="button"
                  onClick={reclassifyWithAi}
                  disabled={isClassifying}
                  className="flex items-center gap-1 text-xs font-bold text-tree-700 hover:text-tree-800 disabled:opacity-50"
                  title="Re-analyze and split into categories"
                >
                  {isClassifying ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} className="text-tree-600" />
                  )}
                  <span>Re-classify with AI</span>
                </button>
              </div>

              {reviewEntries.map((entry, idx) => {
                const isReady = !!(entry.headline && entry.headline.trim().length > 0 && entry.text && entry.text.trim().length > 3);
                return (
                  <div 
                    key={entry.id} 
                    className={`p-5 rounded-2xl border flex flex-col gap-3.5 transition-all shadow-xs ${
                      isReady 
                        ? 'bg-tree-50/10 border-tree-200 hover:border-tree-300 shadow-tree-100/5' 
                        : 'bg-sky-50/15 border-sky-200 hover:border-sky-300 shadow-sky-100/5'
                    }`}
                  >
                    {/* Status Indicator Bar */}
                    <div className="flex items-center justify-between border-b border-stone-100/80 pb-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                        Item #{idx + 1}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full select-none ${
                        isReady 
                          ? 'bg-tree-100/85 text-tree-800' 
                          : 'bg-sky-100/85 text-sky-800'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isReady ? 'bg-tree-600' : 'bg-sky-600'}`} />
                        {isReady ? 'Ready & Verified' : 'Review Required'}
                      </span>
                    </div>

                    {/* Category Pill Selector Bar */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {categoryOptions.map(cat => {
                          const isSelected = entry.category === cat.key;
                          return (
                            <button
                              key={cat.key}
                              type="button"
                              onClick={() => updateEntryCategory(entry.id, cat.key)}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                                isSelected
                                  ? cat.activeColor + ' shadow-xs'
                                  : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-100'
                              }`}
                            >
                              {cat.icon}
                              <span>{cat.label}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Delete item button if more than 1 item */}
                      {reviewEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeReviewEntry(entry.id)}
                          className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                          title="Remove this item"
                          aria-label="Remove item"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                  {/* Headline, Date & Time Bucket Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                    <div className="sm:col-span-3 flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-tree-500 focus-within:border-transparent">
                      <span className="text-[10px] uppercase font-bold text-stone-400 shrink-0">Headline:</span>
                      <input 
                        type="text"
                        value={entry.headline || ''}
                        onChange={(e) => updateEntryHeadline(entry.id, e.target.value)}
                        placeholder="2-4 word subject (e.g. Health Doc Analysis)"
                        className="w-full text-xs font-bold text-stone-900 outline-none bg-transparent"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2 py-1.5 focus-within:ring-2 focus-within:ring-tree-500 focus-within:border-transparent">
                      <Calendar size={13} className="text-tree-600 shrink-0" />
                      <input 
                        type="date"
                        value={entry.date || defaultDate}
                        onChange={(e) => updateEntryDate(entry.id, e.target.value)}
                        className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
                        title="Date for this entry"
                        aria-label="Entry Date"
                      />
                    </div>
                    <div className="sm:col-span-1 flex items-center gap-1 bg-white border border-stone-200 rounded-xl px-1.5 py-1.5">
                      <select
                        value={entry.timeBucket || 'Morning'}
                        onChange={(e) => updateEntryTimeBucket(entry.id, e.target.value as TimeBucket)}
                        className="w-full bg-transparent text-[11px] font-bold text-stone-800 outline-none cursor-pointer"
                        aria-label="Time Bucket"
                      >
                        <option value="Morning">🌅 Morn</option>
                        <option value="Afternoon">☀️ Noon</option>
                        <option value="Evening">🌇 Eve</option>
                        <option value="Night">🌙 Night</option>
                      </select>
                    </div>
                  </div>

                  {/* Text Input for Entry */}
                  <textarea
                    value={entry.text}
                    onChange={(e) => updateEntryText(entry.id, e.target.value)}
                    placeholder="E.g., Medical report says BP normal"
                    rows={2}
                    className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 font-medium focus:ring-2 focus:ring-tree-500 focus:border-transparent outline-none resize-none text-sm leading-relaxed placeholder:text-stone-400"
                  />

                  {/* Calories / Active Minutes fields if appropriate */}
                  <div className="grid grid-cols-3 gap-2">
                    {entry.category === 'meal' && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-stone-400 uppercase">Est. Calories:</span>
                        <input
                          type="number"
                          value={entry.calories || ''}
                          onChange={(e) => updateEntryCalories(entry.id, e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="e.g. 350 kcal"
                          className="w-full text-xs font-bold text-stone-900 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-tree-500"
                        />
                      </div>
                    )}
                    {entry.category === 'workout' && (
                      <>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-stone-400 uppercase">Active Mins:</span>
                          <input
                            type="number"
                            value={entry.activeMinutes || ''}
                            onChange={(e) => updateEntryActiveMinutes(entry.id, e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="e.g. 30"
                            className="w-full text-xs font-bold text-stone-900 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-tree-500"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-stone-400 uppercase">Burned:</span>
                          <input
                            type="number"
                            value={entry.caloriesBurned || ''}
                            onChange={(e) => updateEntryCaloriesBurned(entry.id, e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="e.g. 150 kcal"
                            className="w-full text-xs font-bold text-stone-900 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-tree-500"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}

              {/* Add New Entry button */}
              <button
                type="button"
                onClick={addReviewEntry}
                className="w-full py-2.5 bg-stone-100 hover:bg-stone-200/80 border border-dashed border-stone-300 text-stone-600 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all"
              >
                <Plus size={14} />
                <span>Add Another Entry Item</span>
              </button>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3 mt-2 border-t border-stone-100 pt-4">
              <button
                onClick={closeUploaderModal}
                className="flex-1 py-3.5 text-stone-600 font-bold bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors"
              >
                Discard
              </button>
              <button
                onClick={saveToHealthLog}
                className="flex-[2] py-3.5 bg-tree-700 hover:bg-tree-800 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-tree-900/10 transition-all active:scale-98"
              >
                <Check size={18} strokeWidth={2.5} />
                <span>Save to Health Log</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
