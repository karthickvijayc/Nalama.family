import React, { useState, useRef, useEffect } from 'react';
import { 
  Mic, 
  Square, 
  X, 
  Loader2, 
  Check, 
  Sparkles, 
  Play, 
  Pause, 
  RotateCcw, 
  Edit3, 
  AlertCircle,
  Utensils,
  Dumbbell,
  Pill,
  HeartPulse,
  MessageSquare,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Flame,
  Timer
} from 'lucide-react';
import { DriveState, HealthLogEntry, TimeBucket } from '../types';
import { readJsonFile, writeJsonFile, getOrCreateMonthlyLogFile, getOrCreateCareDigestFile, appendCaregiverDigest } from '../lib/drive';

interface VoiceRecorderButtonProps {
  driveState: DriveState | null;
  onLogSaved?: () => void;
  visible?: boolean;
}

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'review' | 'saving' | 'extracting' | 'generating_digest' | 'extraction_error' | 'success';

interface ReviewEntryItem {
  id: string;
  category: HealthLogEntry['category'];
  text: string;
  headline?: string;
  timeBucket?: TimeBucket;
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

export default function VoiceRecorderButton({ driveState, onLogSaved, visible = true }: VoiceRecorderButtonProps) {
  const [modalState, setModalState] = useState<RecordingState>('idle');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [reviewEntries, setReviewEntries] = useState<ReviewEntryItem[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [showRawTranscript, setShowRawTranscript] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Audio playback state for review
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const latestEntriesRef = useRef<HealthLogEntry[]>([]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, [audioUrl]);

  const startRecording = async () => {
    setErrorMessage(null);
    setTranscript('');
    setReviewEntries([]);
    setShowRawTranscript(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });

      // Determine supported mimeType
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        } else {
          mimeType = ''; // Let browser pick default
        }
      }

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks to release mic hardware
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(250); // Slice every 250ms
      setModalState('recording');

      // Start elapsed duration timer
      const startTime = Date.now();
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);

    } catch (err: any) {
      console.error('Failed to start recording:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage('Microphone permission was denied. Please allow microphone access in your browser settings.');
      } else {
        setErrorMessage(err.message || 'Unable to access microphone.');
      }
      setReviewEntries([{ id: `entry-${Date.now()}-0`, category: 'general', text: '' }]);
      setModalState('review'); // Allow user to type instead
    }
  };

  const stopAndTranscribe = async () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
      return;
    }

    setModalState('transcribing');

    // Flush any pending data before stopping
    if (mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.requestData();
      } catch (e) {
        console.warn('requestData error:', e);
      }
    }

    // Wait for recorder to stop and gather chunks
    await new Promise<void>((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.addEventListener('stop', () => {
          resolve();
        }, { once: true });
        mediaRecorderRef.current.stop();
      } else {
        resolve();
      }
    });

    const recordedMimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunksRef.current, { type: recordedMimeType });

    console.log(`[Audio] Recorded blob: ${audioBlob.size} bytes, type: ${recordedMimeType}`);

    // Create object URL for user audio preview
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const newAudioUrl = URL.createObjectURL(audioBlob);
    setAudioUrl(newAudioUrl);

    if (audioBlob.size === 0) {
      setErrorMessage('No audio data captured. Please check your microphone and speak clearly.');
      setReviewEntries([{ id: `entry-${Date.now()}-0`, category: 'general', text: '' }]);
      setModalState('review');
      return;
    }

    // Convert blob to base64
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      // Call server-side transcribe and classification API
      const localTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64: base64Audio,
          mimeType: recordedMimeType,
          clientTime: localTimeStr
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Transcription failed (${response.status})`);
      }

      const data = await response.json();
      const detectedText = (data.transcription || '').trim();
      setTranscript(detectedText);

      // Handle multi-entry classification from LLM
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        const items: ReviewEntryItem[] = data.entries.map((item: any, idx: number) => ({
          id: `entry-${Date.now()}-${idx}`,
          category: (item.category as HealthLogEntry['category']) || 'general',
          text: item.text || '',
          headline: item.headline || extractFallbackHeadline(item.text || '', item.category || 'general'),
          timeBucket: item.timeBucket || getLocalTimeBucket(item.text || '', new Date()),
          calories: typeof item.calories === 'number' ? item.calories : (item.calories ? Number(item.calories) : undefined),
          caloriesBurned: typeof item.caloriesBurned === 'number' ? item.caloriesBurned : (item.caloriesBurned ? Number(item.caloriesBurned) : undefined),
          activeMinutes: typeof item.activeMinutes === 'number' ? item.activeMinutes : (item.activeMinutes ? Number(item.activeMinutes) : undefined)
        }));
        setReviewEntries(items);
      } else if (detectedText) {
        setReviewEntries([{
          id: `entry-${Date.now()}-0`,
          category: 'general',
          text: detectedText,
          headline: extractFallbackHeadline(detectedText, 'general'),
          timeBucket: getLocalTimeBucket(detectedText, new Date())
        }]);
      } else {
        setReviewEntries([{
          id: `entry-${Date.now()}-0`,
          category: 'general',
          text: '',
          headline: '',
          timeBucket: getLocalTimeBucket('', new Date())
        }]);
      }

      setModalState('review');
    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMessage(`Transcription notice: ${err.message}. You can edit or add your notes below.`);
      setReviewEntries([{
        id: `entry-${Date.now()}-0`,
        category: 'general',
        text: transcript || '',
        headline: extractFallbackHeadline(transcript || '', 'general'),
        timeBucket: getLocalTimeBucket(transcript || '', new Date())
      }]);
      setModalState('review');
    }
  };

  const cancelRecording = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setModalState('idle');
    setErrorMessage(null);
  };

  const openManualEntry = () => {
    setErrorMessage(null);
    setTranscript('');
    setAudioUrl(null);
    setReviewEntries([
      { id: `entry-${Date.now()}-0`, category: 'general', text: '' }
    ]);
    setShowRawTranscript(false);
    setModalState('review');
  };

  const reclassifyWithAi = async () => {
    const combinedText = reviewEntries.map(e => e.text.trim()).filter(Boolean).join('. ') || transcript;
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
        headers: { 'Content-Type': 'application/json' },
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

  const updateEntryCategory = (id: string, newCategory: HealthLogEntry['category']) => {
    setReviewEntries(prev => prev.map(e => e.id === id ? { ...e, category: newCategory } : e));
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

  const removeEntry = (id: string) => {
    setReviewEntries(prev => {
      const remaining = prev.filter(e => e.id !== id);
      return remaining.length > 0 ? remaining : [{ id: `entry-${Date.now()}-0`, category: 'general', text: '', headline: '', timeBucket: getLocalTimeBucket('', new Date()) }];
    });
  };

  const addEntry = () => {
    setReviewEntries(prev => [
      ...prev,
      { id: `entry-${Date.now()}-${prev.length}`, category: 'general', text: '', headline: '', timeBucket: getLocalTimeBucket('', new Date()) }
    ]);
  };

  const extractContext = async (entries: HealthLogEntry[]) => {
    if (!driveState) return;
    setModalState('extracting');
    setErrorMessage(null);
    try {
      // 1. Fetch current context and user profile
      const contextData = await readJsonFile(driveState.token, driveState.contextFileId);
      const currentFacts = contextData?.facts || [];
      const userProfile = contextData?.user_profile || null;

      // 2. Call API with all new entries & userProfile context
      const res = await fetch('/api/extract-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: currentFacts, newLogs: entries, userProfile })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      
      const { facts: updatedFacts } = await res.json();

      // 3. Write back
      const newContextData = { ...(contextData || { schema_version: "1.0", family_members: [] }), facts: updatedFacts };
      await writeJsonFile(driveState.token, 'context_memory.json', newContextData, driveState.mainFolderId, driveState.contextFileId);

      // 4. Generate & save Caregiver Digest to /nalama.family/family_share
      setModalState('generating_digest');
      try {
        const preferredName = userProfile?.nickname || userProfile?.displayName || 'Family Member';
        const digestRes = await fetch('/api/generate-digest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facts: updatedFacts,
            recentLogs: entries,
            profileName: preferredName,
            userProfile
          })
        });

        if (digestRes.ok) {
          const { digest } = await digestRes.json();
          if (digest) {
            const { fileId } = await getOrCreateCareDigestFile(driveState.token, driveState.familyFolderId);
            await appendCaregiverDigest(driveState.token, driveState.familyFolderId, fileId, digest);
          }
        }
      } catch (digestErr) {
        console.warn('Caregiver digest generation warning (non-fatal):', digestErr);
      }

      setModalState('success');
      if (onLogSaved) onLogSaved();

      // Auto close after brief success celebration
      setTimeout(() => {
        setModalState('idle');
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
          setAudioUrl(null);
        }
      }, 1500);

    } catch (err: any) {
      console.error('Extract context error:', err);
      setErrorMessage("Logs saved, but health profile fact extraction encountered an issue. You can retry below.");
      setModalState('extraction_error');
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
      setErrorMessage('Google Drive connection is not initialized. Please re-login.');
      return;
    }

    setModalState('saving');
    try {
      const now = new Date();
      // 1. Get or create current month's partitioned log file
      const { fileId, fileName, monthKey } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId, now);

      // 2. Read existing month partition
      const existingData = await readJsonFile(driveState.token, fileId) || { schema_version: '1.0', month: monthKey, logs: [] };
      const currentLogs: HealthLogEntry[] = Array.isArray(existingData.logs) ? existingData.logs : [];

      // 3. Format all new entries
      const newEntries: HealthLogEntry[] = validItems.map((item, index) => {
        const itemHeadline = item.headline && item.headline.trim() 
          ? item.headline.trim() 
          : extractFallbackHeadline(item.text, item.category);
        const itemBucket = item.timeBucket || getLocalTimeBucket(item.text, now);

        return {
          id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}-${index}`,
          timestamp: new Date(now.getTime() + index * 1000).toISOString(),
          displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          displayDate: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
          transcript: item.text.trim(),
          category: item.category,
          source: audioUrl ? 'voice' : 'manual',
          headline: itemHeadline,
          timeBucket: itemBucket,
          calories: item.calories,
          caloriesBurned: item.caloriesBurned,
          activeMinutes: item.activeMinutes,
        };
      });

      // 4. Prepend latest logs
      const updatedLogs = [...newEntries, ...currentLogs];
      const updatedContent = {
        schema_version: '1.0',
        month: monthKey,
        updated_at: now.toISOString(),
        logs: updatedLogs
      };

      // 5. Save to Drive monthly partition
      await writeJsonFile(
        driveState.token,
        fileName,
        updatedContent,
        driveState.mainFolderId,
        fileId
      );

      // 6. Chain to autonomous context extraction
      await extractContext(newEntries);

    } catch (err: any) {
      console.error('Failed to save log to Google Drive:', err);
      setErrorMessage(`Failed to save log to Google Drive: ${err.message}`);
      setModalState('review');
    }
  };

  const toggleAudioPlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioPlayerRef.current.play();
      setIsPlayingAudio(true);
    }
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainder = sec % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const categoryOptions: { key: HealthLogEntry['category']; label: string; icon: React.ReactNode; activeColor: string; pillColor: string }[] = [
    { key: 'workout', label: 'Workout', icon: <Dumbbell size={14} />, activeColor: 'bg-tree-600 text-white border-tree-600', pillColor: 'bg-tree-50 text-tree-700 border-tree-200' },
    { key: 'meal', label: 'Meal / Food', icon: <Utensils size={14} />, activeColor: 'bg-amber-600 text-white border-amber-600', pillColor: 'bg-amber-50 text-amber-800 border-amber-200' },
    { key: 'medication', label: 'Medication', icon: <Pill size={14} />, activeColor: 'bg-rose-600 text-white border-rose-600', pillColor: 'bg-rose-50 text-rose-800 border-rose-200' },
    { key: 'event', label: 'Vitals / Event', icon: <HeartPulse size={14} />, activeColor: 'bg-teal-600 text-white border-teal-600', pillColor: 'bg-teal-50 text-teal-800 border-teal-200' },
    { key: 'general', label: 'General', icon: <MessageSquare size={14} />, activeColor: 'bg-stone-800 text-white border-stone-800', pillColor: 'bg-stone-100 text-stone-700 border-stone-200' },
  ];

  return (
    <>
      {/* Floating Trigger Button (when idle and visible) */}
      {visible && modalState === 'idle' && (
        <div className="fixed bottom-24 left-0 right-0 flex justify-center pointer-events-none px-6 z-40">
          <button 
            onClick={startRecording}
            className="pointer-events-auto flex items-center gap-4 bg-gradient-to-r from-tree-700 via-tree-600 to-tree-700 hover:from-tree-800 hover:to-tree-700 active:scale-95 text-white rounded-full pl-6 pr-8 py-4 shadow-xl shadow-tree-900/25 transition-all group border border-tree-500/30"
            aria-label="Add Voice Entry"
          >
            <div className="bg-white/20 p-3 rounded-full group-hover:bg-white/30 transition-colors">
              <Mic size={32} />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="font-bold text-xl leading-tight">Add Entry</span>
              <span className="text-xs font-semibold text-tree-100/90 tracking-wide">English • தமிழ் • हिन्दी</span>
            </div>
          </button>
        </div>
      )}

      {/* Active Recording Overlay */}
      {modalState === 'recording' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl p-6 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-200">
            
            {/* Header & Close */}
            <div className="w-full flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                <span className="font-bold text-stone-900 text-lg">Listening...</span>
              </div>
              <button 
                onClick={cancelRecording}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                aria-label="Cancel recording"
              >
                <X size={22} />
              </button>
            </div>

            {/* Pulse Visualizer & Timer */}
            <div className="relative flex flex-col items-center justify-center my-4">
              <div className="w-32 h-32 rounded-full bg-orange-100/60 flex items-center justify-center animate-pulse">
                <div className="w-24 h-24 rounded-full bg-orange-500 flex items-center justify-center text-white shadow-lg shadow-orange-500/40">
                  <Mic size={44} className="animate-bounce" />
                </div>
              </div>
              <span className="mt-4 text-3xl font-extrabold tracking-tight text-stone-900 font-mono">
                {formatSeconds(recordingDuration)}
              </span>
            </div>

            {/* Prompt Helper */}
            <p className="text-stone-500 text-sm font-medium text-center max-w-xs leading-relaxed">
              Speak naturally in English, தமிழ், or हिन्दी.<br />
              <span className="text-stone-700 font-semibold">Mention multiple things</span> (e.g. &ldquo;Ran 20 mins, had idly for lunch, took vitamins&rdquo;).
            </p>

            {/* Stop & Done Button */}
            <div className="w-full flex gap-3">
              <button
                onClick={cancelRecording}
                className="flex-1 py-4 text-stone-600 font-bold bg-stone-100 hover:bg-stone-200 rounded-2xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={stopAndTranscribe}
                className="flex-[2] py-4 bg-teal-600 hover:bg-teal-700 active:scale-98 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-teal-600/30 transition-all"
              >
                <Square size={20} className="fill-white" />
                <span>Done & Transcribe</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Transcribing State */}
      {modalState === 'transcribing' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
              <Loader2 size={36} className="animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Transcribing with Gemini AI...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Listening to audio and automatically classifying entries into meals, workouts, medications, and vitals.
            </p>
          </div>
        </div>
      )}

      {/* Saving State */}
      {modalState === 'saving' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center">
              <Loader2 size={36} className="animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Saving to Google Drive...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Updating your personal append-only health log in your private storage.
            </p>
          </div>
        </div>
      )}

      {/* Extracting Context State */}
      {modalState === 'extracting' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200">
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

      {/* Generating Caregiver Digest State */}
      {modalState === 'generating_digest' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Users size={36} className="animate-pulse" />
            </div>
            <h3 className="text-xl font-bold text-stone-900">Updating Family Digest...</h3>
            <p className="text-sm text-stone-500 font-medium leading-relaxed">
              Gemini is composing a privacy-safe overview for your shared family circle.
            </p>
          </div>
        </div>
      )}

      {/* Extraction Error State */}
      {modalState === 'extraction_error' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-5 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertCircle size={36} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-stone-900">Profile Update Note</h3>
              <p className="text-sm text-stone-500 font-medium leading-relaxed mt-2">
                Your entries were safely saved to Google Drive, but we couldn&apos;t update the background Health Profile facts.
              </p>
              {errorMessage && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg mt-3 text-left">
                  {errorMessage}
                </p>
              )}
            </div>
            <div className="flex gap-3 w-full">
              <button
                type="button"
                onClick={cancelRecording}
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
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition-all"
              >
                Retry Profile Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {modalState === 'success' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center gap-4 animate-in zoom-in-95 duration-200">
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

      {/* Review & Edit Modal (Centered, z-[70], multi-item classification) */}
      {modalState === 'review' && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <Edit3 size={20} className="text-teal-600" />
                  <h3 className="text-xl font-bold text-stone-900">
                    Review Health Entries
                  </h3>
                  {reviewEntries.length > 1 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                      {reviewEntries.length} Items Detected
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 font-medium mt-0.5">
                  Gemini classified your note into actionable entries. Edit or adjust as needed.
                </p>
              </div>
              <button 
                onClick={cancelRecording}
                className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Error / Status Message if any */}
            {errorMessage && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-medium flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Audio Playback Preview (if audio was recorded) */}
            {audioUrl && (
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-2xl border border-stone-200">
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleAudioPlayback}
                    className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-md hover:bg-teal-700 transition-colors"
                    aria-label={isPlayingAudio ? "Pause audio" : "Play audio"}
                  >
                    {isPlayingAudio ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </button>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-stone-800">Voice Note Preview</span>
                    <span className="text-[11px] text-stone-500 font-medium">{formatSeconds(recordingDuration)} duration</span>
                  </div>
                </div>
                <audio 
                  ref={audioPlayerRef} 
                  src={audioUrl} 
                  onEnded={() => setIsPlayingAudio(false)} 
                  className="hidden" 
                />
                <button
                  onClick={startRecording}
                  className="flex items-center gap-1 text-xs font-bold text-stone-500 hover:text-teal-600 px-2 py-1 rounded-lg hover:bg-stone-200/60 transition-colors"
                >
                  <RotateCcw size={14} />
                  <span>Rerecord</span>
                </button>
              </div>
            )}

            {/* Collapsible Spoken Verbatim Transcript */}
            {transcript && (
              <div className="bg-stone-50 rounded-2xl border border-stone-200 p-3 flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowRawTranscript(!showRawTranscript)}
                  className="flex items-center justify-between w-full text-left text-xs font-bold text-stone-600 hover:text-stone-900"
                >
                  <span className="flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-stone-400" />
                    Spoken Transcript
                  </span>
                  {showRawTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showRawTranscript && (
                  <p className="text-xs text-stone-700 leading-relaxed pt-1.5 border-t border-stone-200/60 font-medium italic">
                    &ldquo;{transcript}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Classified Entries List */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                  Classified Items ({reviewEntries.length})
                </label>
                <button
                  type="button"
                  onClick={reclassifyWithAi}
                  disabled={isClassifying}
                  className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-800 disabled:opacity-50"
                  title="Re-analyze and split into categories"
                >
                  {isClassifying ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} className="text-teal-600" />
                  )}
                  <span>Re-classify with AI</span>
                </button>
              </div>

              {reviewEntries.map((entry, idx) => (
                <div 
                  key={entry.id} 
                  className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 flex flex-col gap-2.5 transition-all hover:border-stone-300"
                >
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
                        onClick={() => removeEntry(entry.id)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                        title="Remove this item"
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {/* Headline & Time Bucket Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2 flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2.5 py-1.5 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-transparent">
                      <span className="text-[10px] uppercase font-bold text-stone-400 shrink-0">Headline:</span>
                      <input 
                        type="text"
                        value={entry.headline || ''}
                        onChange={(e) => updateEntryHeadline(entry.id, e.target.value)}
                        placeholder="2-4 word subject (e.g. Doctor Visit)"
                        className="w-full text-xs font-bold text-stone-900 outline-none bg-transparent"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-xl px-2 py-1.5">
                      <span className="text-[10px] uppercase font-bold text-stone-400 shrink-0">Bucket:</span>
                      <select
                        value={entry.timeBucket || 'Morning'}
                        onChange={(e) => updateEntryTimeBucket(entry.id, e.target.value as TimeBucket)}
                        className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
                      >
                        <option value="Morning">🌅 Morning</option>
                        <option value="Afternoon">☀️ Afternoon</option>
                        <option value="Evening">🌇 Evening</option>
                        <option value="Night">🌙 Night</option>
                      </select>
                    </div>
                  </div>

                  {/* Text Input for Entry */}
                  <textarea
                    value={entry.text}
                    onChange={(e) => updateEntryText(entry.id, e.target.value)}
                    placeholder="E.g., Ran for 20 minutes"
                    rows={2}
                    className="w-full p-2.5 bg-white border border-stone-200 rounded-xl text-stone-900 font-medium focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none resize-none text-sm leading-relaxed placeholder:text-stone-400"
                  />

                  {/* Calories / Calories Burned Row (for Meals & Workouts) */}
                  {entry.category === 'meal' && (
                    <div className="flex items-center justify-between bg-orange-50/80 border border-orange-200/90 rounded-xl px-3 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-orange-900 font-bold">
                        <Flame size={14} className="text-orange-600" />
                        <span className="text-[11px] uppercase tracking-wide">Calories Consumed:</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="number"
                          value={entry.calories !== undefined ? entry.calories : ''}
                          onChange={(e) => updateEntryCalories(entry.id, e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="AI estimate"
                          className="w-20 px-2 py-0.5 bg-white border border-orange-300 rounded-lg text-xs font-bold text-orange-950 text-right outline-none focus:ring-1 focus:ring-orange-500"
                        />
                        <span className="text-xs font-bold text-orange-700">kcal</span>
                      </div>
                    </div>
                  )}

                  {entry.category === 'workout' && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between bg-teal-50/80 border border-teal-200/90 rounded-xl px-3 py-1.5 text-xs">
                        <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                          <Timer size={14} className="text-teal-600" />
                          <span className="text-[11px] uppercase tracking-wide">Active Duration:</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number"
                            value={entry.activeMinutes !== undefined ? entry.activeMinutes : ''}
                            onChange={(e) => updateEntryActiveMinutes(entry.id, e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="e.g. 20"
                            className="w-20 px-2 py-0.5 bg-white border border-teal-300 rounded-lg text-xs font-bold text-teal-950 text-right outline-none focus:ring-1 focus:ring-teal-500"
                          />
                          <span className="text-xs font-bold text-teal-700">mins</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between bg-teal-50/80 border border-teal-200/90 rounded-xl px-3 py-1.5 text-xs">
                        <div className="flex items-center gap-1.5 text-teal-900 font-bold">
                          <Flame size={14} className="text-teal-600" />
                          <span className="text-[11px] uppercase tracking-wide">Calories Burned:</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="number"
                            value={entry.caloriesBurned !== undefined ? entry.caloriesBurned : ''}
                            onChange={(e) => updateEntryCaloriesBurned(entry.id, e.target.value ? Number(e.target.value) : undefined)}
                            placeholder="AI estimate"
                            className="w-20 px-2 py-0.5 bg-white border border-teal-300 rounded-lg text-xs font-bold text-teal-950 text-right outline-none focus:ring-1 focus:ring-teal-500"
                          />
                          <span className="text-xs font-bold text-teal-700">kcal burned</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add item button */}
              <button
                type="button"
                onClick={addEntry}
                className="py-2 px-3 border border-dashed border-stone-300 hover:border-teal-500 text-stone-600 hover:text-teal-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-stone-50/50 hover:bg-teal-50/40 transition-colors"
              >
                <Plus size={14} />
                <span>Add another item</span>
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="flex-1 py-3.5 border border-stone-200 text-stone-600 font-bold rounded-2xl hover:bg-stone-50 transition-colors text-sm"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={saveToHealthLog}
                disabled={reviewEntries.every(e => !e.text.trim())}
                className="flex-[2] py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 active:scale-98 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 transition-all text-sm"
              >
                <Check size={18} strokeWidth={2.5} />
                <span>
                  Save {reviewEntries.length > 1 ? `${reviewEntries.length} Entries` : 'to Health Log'}
                </span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
