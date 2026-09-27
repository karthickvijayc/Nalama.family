import React, { useState, useEffect, useRef } from 'react';
import { 
  Dumbbell, 
  Utensils, 
  Stethoscope, 
  Leaf, 
  ChevronRight, 
  BrainCircuit, 
  RefreshCw, 
  Trophy, 
  CalendarPlus, 
  CheckCircle2,
  ArrowLeft,
  Send,
  Sparkles,
  Bot,
  User as UserIcon,
  MessageSquare,
  Flame,
  Activity,
  Heart,
  Moon,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  HelpCircle
} from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getInsightsFromDrive, saveInsightsToDrive, readJsonFile, getOrCreateMonthlyLogFile, getUserProfileFromDrive, writeJsonFile, getOrCreateCareDigestFile, appendCaregiverDigest, findFileOrFolder } from '../lib/drive';
import { CoachingRoomId, CoachingMessage, UserProfile, HealthFact, HealthLogEntry } from '../types';
import { getGeminiApiKeyHeader } from '../lib/geminiApiKey';

function formatMarkdownForDisplay(content: string): string {
  if (!content) return '';
  let text = content;
  // 1. Convert inline concatenated markdown table rows "| |" or "|  |" into newlines
  text = text.replace(/\|\s*\|\s*(?=[^:\s|])/g, '|\n| ');
  text = text.replace(/\|\s*\|\s*(?=:\-)/g, '|\n|');
  text = text.replace(/\|\s*\|\s*(?=\|)/g, '|\n|');

  // 2. Ensure table delimiter lines like "| :--- | :--- |" have clean newlines before and after
  text = text.replace(/([^\n])\s*(\|[ \t]*:?---+:?[ \t]*\|)/g, '$1\n$2');

  // 3. Ensure a blank line before any table starting with "| " if preceded by regular text
  text = text.replace(/([^\n])\n(\|[^\n]+\|)/g, '$1\n\n$2');

  return text;
}

interface CoachingRoomConfig {
  id: CoachingRoomId;
  title: string;
  subtitle: string;
  badge: string;
  icon: React.ReactNode;
  themeColor: string;
  bgGradient: string;
  chipBg: string;
  chipText: string;
  suggestedPrompts: string[];
  initialGreeting: string;
}

const COACHING_ROOMS: CoachingRoomConfig[] = [
  {
    id: 'workout',
    title: 'Workout & Movement',
    subtitle: 'Strength, cardio, active minutes & recovery',
    badge: 'Fitness AI',
    icon: <Dumbbell size={24} className="text-tree-700" />,
    themeColor: 'tree',
    bgGradient: 'bg-gradient-to-br from-tree-50/50 to-emerald-100/40 border-tree-100/80',
    chipBg: 'bg-tree-50 hover:bg-tree-100 border-tree-200 text-tree-800',
    chipText: 'text-tree-700',
    initialGreeting: "Hi! I'm your Workout & Movement Specialist. I have full context of your fitness goals, target active minutes, and recent logs. What would you like to focus on today?",
    suggestedPrompts: [
      "Suggest a 20-minute low impact cardio routine",
      "How can I safely hit my daily active minutes target?",
      "Review my recent exercise logs and suggest next steps"
    ]
  },
  {
    id: 'diet',
    title: 'Nutrition & Diet',
    subtitle: 'Calorie balance, mindful meals & hydration',
    badge: 'Nutrition AI',
    icon: <Utensils size={24} className="text-tree-800" />,
    themeColor: 'tree',
    bgGradient: 'bg-gradient-to-br from-emerald-50/40 to-tree-100/30 border-tree-100/70',
    chipBg: 'bg-tree-50 hover:bg-tree-100 border-tree-200 text-tree-800',
    chipText: 'text-tree-700',
    initialGreeting: "Hello! I'm your Nutrition & Mindful Diet Specialist. Based on your dietary preferences and target calories, I can help you plan balanced meals and healthy snacks.",
    suggestedPrompts: [
      "Suggest healthy high-protein snacks within my calorie goal",
      "How to balance my carb and protein intake this week?",
      "Quick 15-minute nourishing dinner ideas"
    ]
  },
  {
    id: 'medical',
    title: 'Medical & Wellness',
    subtitle: 'Medications, vitals & doctor checkup prep',
    badge: 'Wellness AI',
    icon: <Stethoscope size={24} className="text-sky-700" />,
    themeColor: 'sky',
    bgGradient: 'bg-gradient-to-br from-sky-50/60 to-blue-100/40 border-sky-100/80',
    chipBg: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-800',
    chipText: 'text-sky-700',
    initialGreeting: "Welcome. I'm your Medical & Wellness Adherence Guide. I can help organize your health questions, track routine consistency, and review resting heart rate targets.",
    suggestedPrompts: [
      "Help me prepare a bulleted summary for my next doctor visit",
      "What are evidence-based tips to keep resting heart rate healthy?",
      "How can I stay consistent with my morning wellness routines?"
    ]
  },
  {
    id: 'reflection',
    title: 'Mindful Recovery',
    subtitle: 'Sleep hygiene, stress balance & daily habits',
    badge: 'Recovery AI',
    icon: <Moon size={24} className="text-sky-600" />,
    themeColor: 'sky',
    bgGradient: 'bg-gradient-to-br from-blue-50/50 to-sky-100/30 border-sky-100/70',
    chipBg: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-800',
    chipText: 'text-sky-700',
    initialGreeting: "Peace and welcome. I'm your Mindful Recovery Coach. Let's talk about restorative sleep, managing everyday stress, or building sustainable micro-habits.",
    suggestedPrompts: [
      "Guided 3-minute evening wind-down breathing routine",
      "How to improve deep sleep quality after high activity days?",
      "Help me reflect on my wellness progress this week"
    ]
  }
];

export default function Coaching({ 
  onOpenProfile, 
  driveState, 
  userProfile,
  user,
  refreshTrigger
}: { 
  onOpenProfile: () => void;
  driveState: any;
  userProfile?: UserProfile | null;
  user?: any;
  refreshTrigger?: number;
}) {
  const [activeRoomId, setActiveRoomId] = useState<CoachingRoomId | null>(null);
  const [roomMessages, setRoomMessages] = useState<Record<CoachingRoomId, CoachingMessage[]>>({
    workout: [],
    diet: [],
    medical: [],
    reflection: []
  });
  const [inputMessage, setInputMessage] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatError, setChatError] = useState('');

  const [chatFileId, setChatFileId] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [bridgeContexts, setBridgeContexts] = useState<Record<CoachingRoomId, string>>({
    workout: '',
    diet: '',
    medical: '',
    reflection: ''
  });

  // Voice dictation & Audio Readout States
  const [isListening, setIsListening] = useState(false);
  const [showCoachingHelp, setShowCoachingHelp] = useState(false);
  const [currentlyReadingId, setCurrentlyReadingId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn('Speech recognition stop error:', e);
        }
      }
    };
  }, []);

  // Load chats from Google Drive
  useEffect(() => {
    async function initChats() {
      if (!driveState?.token || !driveState?.mainFolderId) return;
      setIsLoadingChats(true);
      try {
        const fileId = await findFileOrFolder(driveState.token, 'coaching_chats.json', 'application/json', driveState.mainFolderId);
        if (fileId) {
          setChatFileId(fileId);
          const content = await readJsonFile(driveState.token, fileId);
          if (content && content.rooms) {
            setRoomMessages({
              workout: Array.isArray(content.rooms.workout) ? content.rooms.workout : [],
              diet: Array.isArray(content.rooms.diet) ? content.rooms.diet : [],
              medical: Array.isArray(content.rooms.medical) ? content.rooms.medical : [],
              reflection: Array.isArray(content.rooms.reflection) ? content.rooms.reflection : []
            });
          } else {
            setRoomMessages({ workout: [], diet: [], medical: [], reflection: [] });
          }
        } else {
          setRoomMessages({ workout: [], diet: [], medical: [], reflection: [] });
        }
      } catch (err) {
        console.warn('Error loading chats from Google Drive:', err);
        setRoomMessages({ workout: [], diet: [], medical: [], reflection: [] });
      } finally {
        setIsLoadingChats(false);
      }
    }
    initChats();
  }, [driveState?.token, driveState?.mainFolderId, refreshTrigger]);

  const saveChatsToDrive = async (updatedRooms: Record<CoachingRoomId, CoachingMessage[]>) => {
    if (!driveState?.token || !driveState?.mainFolderId) return;
    try {
      const payload = {
        schema_version: "1.0",
        rooms: updatedRooms
      };
      const fileId = await writeJsonFile(
        driveState.token,
        'coaching_chats.json',
        payload,
        driveState.mainFolderId,
        chatFileId || undefined
      );
      if (fileId && fileId !== chatFileId) {
        setChatFileId(fileId);
      }
    } catch (err) {
      console.warn('Error saving chats to Google Drive:', err);
    }
  };

  const handleResetChat = async (continueTopic: boolean) => {
    if (!activeRoomId) return;
    
    let bridgeText = '';
    if (continueTopic) {
      const messages = roomMessages[activeRoomId] || [];
      const lastFew = messages.slice(-4);
      bridgeText = lastFew.map(m => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.text}`).join('\n');
    }

    const updatedRooms = {
      ...roomMessages,
      [activeRoomId]: []
    };

    setRoomMessages(updatedRooms);
    setBridgeContexts(prev => ({
      ...prev,
      [activeRoomId]: bridgeText
    }));
    setShowResetConfirm(false);
    
    await saveChatsToDrive(updatedRooms);
  };

  const startSpeechRecognition = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice dictation is not supported in this browser. Please try typing directly.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputMessage(prev => {
            const separator = prev ? ' ' : '';
            return prev + separator + transcript;
          });
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  // Weekly Insights State
  const [insights, setInsights] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [acceptedRoutines, setAcceptedRoutines] = useState<Set<number>>(new Set());

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (activeRoomId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [roomMessages, activeRoomId, isSendingMessage]);

  const loadOrGenerateInsights = async (forceGenerate = false) => {
    if (!driveState?.token || !driveState?.mainFolderId) return;
    setIsGenerating(true);
    setError('');
    
    try {
      const { fileId } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId);
      const data = await readJsonFile(driveState.token, fileId);
      const logs = data?.logs || [];
      
      const logsCount = logs.length;
      const latestTimestamp = logs.length > 0 ? Math.max(...logs.map((l: any) => l.timestamp || 0), 0) : 0;
      const logsSignature = `${logsCount}_${latestTimestamp}`;

      if (!forceGenerate) {
        const existing = await getInsightsFromDrive(driveState.token, driveState.mainFolderId);
        if (existing && existing.lastGeneratedDate) {
          // If the log activity signature matches, or if it doesn't exist yet but has existing insights (backward compatibility)
          if (existing.logsSignature === logsSignature || !existing.logsSignature) {
            console.log('Using persisted weekly insights (no new activities detected).');
            setInsights(existing.data || existing);
            setIsGenerating(false);
            
            // If existing did not have logsSignature, let's back-populate it now in Drive
            if (!existing.logsSignature) {
              await saveInsightsToDrive(driveState.token, driveState.mainFolderId, {
                lastGeneratedDate: existing.lastGeneratedDate,
                logsSignature,
                data: existing.data || existing
              });
            }
            return;
          }
        }
      }
      
      const twoWeeksAgo = Date.now() - (14 * 24 * 3600 * 1000);
      const recentLogs = logs.filter((l: any) => l.timestamp >= twoWeeksAgo || (new Date(l.displayDate)).getTime() >= twoWeeksAgo);

      let facts = [];
      let profile = userProfile || {};
      if (driveState.contextFileId) {
        const contextData = await readJsonFile(driveState.token, driveState.contextFileId);
        if (contextData && Array.isArray(contextData.facts)) {
          facts = contextData.facts;
        }
        if (!userProfile) {
          profile = await getUserProfileFromDrive(driveState.token, driveState.contextFileId) || {};
        }
      }
      
      const res = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getGeminiApiKeyHeader()
        },
        body: JSON.stringify({ logs: recentLogs, facts, userProfile: profile })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate insights');
      }
      const newInsights = await res.json();
      
      await saveInsightsToDrive(driveState.token, driveState.mainFolderId, {
        lastGeneratedDate: new Date().toISOString(),
        logsSignature,
        data: newInsights
      });
      
      // Append Weekly Insights to Caregiver Digest
      try {
        if (driveState.familyFolderId) {
          const { fileId: careFileId } = await getOrCreateCareDigestFile(driveState.token, driveState.familyFolderId);
          const achievementsStr = newInsights.achievements?.join(', ') || 'Maintained stability.';
          const weeklyDigest = {
            id: 'insight-' + Date.now(),
            timestamp: new Date().toISOString(),
            displayDate: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            displayTime: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
            status: 'good' as const,
            status_label: 'Weekly Health Insights',
            summary: newInsights.summary + '\n\nWins: ' + achievementsStr,
            metrics: []
          };
          
          await appendCaregiverDigest(driveState.token, driveState.familyFolderId, careFileId, weeklyDigest);
          console.log("Weekly insights appended to caregiver digest");
        }
      } catch (digestErr) {
        console.warn("Failed to append insights to digest", digestErr);
      }

      setInsights(newInsights);
      setAcceptedRoutines(new Set());
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate insights');
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    loadOrGenerateInsights(false);
  }, [driveState?.token, driveState?.mainFolderId, refreshTrigger]);

  const acceptRoutine = async (routine: any, index: number) => {
    if (!driveState?.token || !driveState?.contextFileId) return;
    try {
      const contextData = await readJsonFile(driveState.token, driveState.contextFileId);
      const newFact = {
        id: 'fact-' + Math.random().toString(36).substring(7),
        category: 'routine',
        text: routine.text,
        source: 'gemini_extraction',
        addedAt: new Date().toISOString(),
        expiresAt: null,
        frequency: routine.frequency || 'daily',
        timeBucket: routine.timeBucket || 'Morning'
      };
      const updatedFacts = [...(contextData.facts || []), newFact];
      
      await writeJsonFile(driveState.token, 'context_memory.json', { ...contextData, facts: updatedFacts }, driveState.mainFolderId, driveState.contextFileId);
      
      setAcceptedRoutines(prev => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
    } catch (err) {
      console.error(err);
      alert('Failed to add routine.');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text || !activeRoomId || isSendingMessage) return;

    setInputMessage('');
    setChatError('');

    const newUserMsg: CoachingMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const currentHistory = roomMessages[activeRoomId] || [];
    const updatedHistory = [...currentHistory, newUserMsg];

    setRoomMessages(prev => ({
      ...prev,
      [activeRoomId]: updatedHistory
    }));

    setIsSendingMessage(true);

    try {
      // Gather context memory facts & recent logs from Drive
      let facts: HealthFact[] = [];
      let recentLogs: HealthLogEntry[] = [];
      let profile = userProfile || {};

      if (driveState?.token) {
        if (driveState.contextFileId) {
          const contextData = await readJsonFile(driveState.token, driveState.contextFileId);
          if (contextData && Array.isArray(contextData.facts)) {
            facts = contextData.facts;
          }
          if (!userProfile) {
            profile = await getUserProfileFromDrive(driveState.token, driveState.contextFileId) || {};
          }
        }

        if (driveState.mainFolderId) {
          const { fileId } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId);
          const data = await readJsonFile(driveState.token, fileId);
          if (data && Array.isArray(data.logs)) {
            recentLogs = data.logs;
          }
        }
      }

      const activeBridge = bridgeContexts[activeRoomId] || '';

      const response = await fetch('/api/coaching-chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...getGeminiApiKeyHeader()
        },
        body: JSON.stringify({
          roomId: activeRoomId,
          message: text,
          conversationHistory: currentHistory,
          facts,
          recentLogs,
          userProfile: profile,
          bridgeContext: activeBridge
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get coaching response');
      }

      const data = await response.json();
      const newBotMsg: CoachingMessage = {
        id: 'msg-bot-' + Date.now(),
        role: 'assistant',
        text: data.reply || "I'm here to support you.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      const finalMessages = [...updatedHistory, newBotMsg];
      const finalRooms = {
        ...roomMessages,
        [activeRoomId]: finalMessages
      };

      setRoomMessages(finalRooms);

      // Clear the bridge context as it has successfully primed this new thread's first message
      if (activeBridge) {
        setBridgeContexts(prev => ({
          ...prev,
          [activeRoomId]: ''
        }));
      }

      // Persist conversations in Google Drive
      await saveChatsToDrive(finalRooms);

    } catch (err: any) {
      console.error('Coaching chat error:', err);
      setChatError(err.message || 'Could not send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  // If inside an active coaching room, render the interactive chat interface
  if (activeRoomId) {
    const roomConfig = COACHING_ROOMS.find(r => r.id === activeRoomId) || COACHING_ROOMS[0];
    const messages = roomMessages[activeRoomId] || [];
    const messageCount = messages.length;
    const saturationPercentage = Math.min(100, Math.round((messageCount / 12) * 100));

    return (
      <div className="flex flex-col min-h-screen pt-4 pb-28 relative">
        {/* Room Header */}
        <header className="flex flex-col gap-2 pb-3 border-b border-stone-200/80 sticky top-0 bg-[#F9F7F4] z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveRoomId(null)}
              className="p-2 -ml-2 rounded-2xl hover:bg-stone-200/60 text-stone-700 transition-colors active:scale-95"
              aria-label="Back to coaching rooms"
            >
              <ArrowLeft size={22} />
            </button>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2.5 rounded-2xl bg-white border border-stone-200/80 shadow-xs flex-shrink-0">
                {roomConfig.icon}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-stone-900 truncate">
                    {roomConfig.title}
                  </h1>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-stone-200/80 text-stone-700 flex-shrink-0">
                    {roomConfig.badge}
                  </span>
                </div>
                <p className="text-xs text-stone-500 truncate font-medium">
                  {roomConfig.subtitle}
                </p>
              </div>
            </div>
          </div>

          {/* Context Saturation Meter */}
          <div className="flex flex-col gap-1 w-full border-t border-stone-150 pt-2 px-1 mt-1">
            <div className="flex justify-between items-center text-[10px] font-bold text-stone-500">
              <span className="flex items-center gap-1">
                Context Saturation: 
                <span className={
                  saturationPercentage >= 80 ? 'text-rose-600 font-extrabold animate-pulse' :
                  saturationPercentage >= 50 ? 'text-amber-600 font-extrabold' : 'text-tree-700 font-extrabold'
                }>
                  {saturationPercentage}% {saturationPercentage >= 80 ? '(High - Hallucination Risk)' : saturationPercentage >= 50 ? '(Medium)' : '(Optimal)'}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="text-tree-700 hover:text-tree-800 underline font-bold"
              >
                New Chat
              </button>
            </div>
            <div className="h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  saturationPercentage >= 80 ? 'bg-rose-500' :
                  saturationPercentage >= 50 ? 'bg-amber-500' : 'bg-tree-600'
                }`}
                style={{ width: `${saturationPercentage}%` }}
              />
            </div>
          </div>
        </header>

        {/* Nudge Alert Modal if context is high */}
        {saturationPercentage >= 70 && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-3xl flex flex-col gap-3 mx-1 mt-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-2.5">
              <Sparkles size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-bold text-stone-900">AI Chat is reaching saturation limits</p>
                <p className="text-[11px] font-medium text-stone-600 leading-relaxed mt-1">
                  Long threads can sometimes lead to AI hallucinations. Start a new chat to keep the AI sharp! You can continue the active topic focus behind the scenes.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => handleResetChat(true)}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-xl shadow-2xs transition-colors"
              >
                Continue Current Topic (Smart Bridge)
              </button>
              <button
                type="button"
                onClick={() => handleResetChat(false)}
                className="px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-bold rounded-xl transition-colors"
              >
                Fresh Start
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages Area */}
        <div className="flex-1 flex flex-col gap-4 pt-4 pb-36 overflow-y-auto">
          {/* Initial Bot Greeting Card */}
          <div className="bg-white rounded-3xl p-5 border border-stone-200/80 shadow-xs flex items-start gap-3.5">
            <div className="p-2 rounded-xl bg-tree-50 text-tree-700 mt-0.5 flex-shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <p className="text-sm text-stone-800 leading-relaxed font-medium">
                {roomConfig.initialGreeting}
              </p>
              {messages.length === 0 && (
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-stone-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-400">
                    Suggested prompts
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {roomConfig.suggestedPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(prompt)}
                        className={`text-left text-xs font-semibold px-3 py-2 rounded-xl border transition-all active:scale-98 ${roomConfig.chipBg}`}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Conversation Messages */}
          {messages.map((msg) => {
            const isReadingThis = currentlyReadingId === msg.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[92%] sm:max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed font-medium shadow-xs ${
                    msg.role === 'user'
                      ? 'bg-tree-700 text-white rounded-br-xs shadow-tree-900/10'
                      : 'bg-white text-stone-800 border border-stone-200/80 rounded-bl-xs'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  ) : (
                    <div className="markdown-body text-stone-800 text-[13px] leading-relaxed font-medium overflow-hidden">
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({children}) => <p className="mb-2 last:mb-0 leading-relaxed font-semibold">{children}</p>,
                          ul: ({children}) => <ul className="list-disc pl-4 mb-2 space-y-1.5 font-semibold text-stone-700">{children}</ul>,
                          ol: ({children}) => <ol className="list-decimal pl-4 mb-2 space-y-1.5 font-semibold text-stone-700">{children}</ol>,
                          li: ({children}) => <li className="leading-relaxed">{children}</li>,
                          strong: ({children}) => <strong className="font-extrabold text-stone-900">{children}</strong>,
                          h1: ({children}) => <h1 className="text-base font-bold mt-3 mb-1.5 text-stone-950">{children}</h1>,
                          h2: ({children}) => <h2 className="text-sm font-bold mt-2.5 mb-1.5 text-stone-950">{children}</h2>,
                          h3: ({children}) => <h3 className="text-xs font-bold mt-2 mb-1 text-stone-950">{children}</h3>,
                          table: ({children}) => (
                            <div className="w-full my-3 overflow-x-auto rounded-2xl border border-stone-200 bg-stone-50/40 shadow-2xs">
                              <table className="min-w-full text-xs text-left border-collapse">{children}</table>
                            </div>
                          ),
                          thead: ({children}) => <thead className="bg-stone-100 text-stone-900 font-bold border-b border-stone-200">{children}</thead>,
                          tbody: ({children}) => <tbody className="divide-y divide-stone-200/70 bg-white font-medium">{children}</tbody>,
                          tr: ({children}) => <tr className="hover:bg-stone-50/60 transition-colors">{children}</tr>,
                          th: ({children}) => <th className="px-3 py-2.5 font-bold text-stone-900 whitespace-nowrap">{children}</th>,
                          td: ({children}) => <td className="px-3 py-2 text-stone-700 whitespace-nowrap">{children}</td>,
                          code: ({children}) => <code className="bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>,
                        }}
                      >
                        {formatMarkdownForDisplay(msg.text)}
                      </Markdown>
                    </div>
                  )}
                </div>
                
                {msg.role === 'assistant' ? (
                  <div className="flex items-center gap-2 mt-2 px-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (typeof window !== 'undefined' && window.speechSynthesis) {
                          if (currentlyReadingId === msg.id) {
                            window.speechSynthesis.cancel();
                            setCurrentlyReadingId(null);
                          } else {
                            window.speechSynthesis.cancel();
                            // Clean markdown & table pipes before audio read out
                            const cleanText = msg.text
                              .replace(/\|/g, ', ')
                              .replace(/:?---+:?/g, '')
                              .replace(/[*#_`~-]/g, '')
                              .replace(/\[(.*?)\]\(.*?\)/g, '$1')
                              .replace(/,(\s*,)+/g, ',');
                            const utterance = new SpeechSynthesisUtterance(cleanText);
                            utterance.onend = () => setCurrentlyReadingId(null);
                            utterance.onerror = () => setCurrentlyReadingId(null);
                            setCurrentlyReadingId(msg.id);
                            window.speechSynthesis.speak(utterance);
                          }
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer select-none active:scale-95 shadow-2xs ${
                        isReadingThis
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-950 border-amber-300 ring-2 ring-amber-400/40'
                          : 'bg-white hover:bg-stone-100 text-stone-700 border-stone-300'
                      }`}
                      title={isReadingThis ? "Stop reading audio aloud" : "Read message aloud"}
                    >
                      {isReadingThis ? (
                        <>
                          <VolumeX size={13} className="text-amber-800 animate-pulse" />
                          <span>Stop Reading</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={13} className="text-tree-700" />
                          <span>Read Aloud</span>
                        </>
                      )}
                    </button>
                    <span className="text-[10px] font-bold text-stone-400">
                      {msg.timestamp}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] font-bold text-stone-400 mt-1 px-1">
                    {msg.timestamp}
                  </span>
                )}
              </div>
            );
          })}

          {/* Loading Indicator */}
          {isSendingMessage && (
            <div className="flex items-center gap-2 text-stone-500 text-xs font-semibold px-2 py-1">
              <div className="w-4 h-4 border-2 border-tree-600 border-t-transparent rounded-full animate-spin" />
              <span>Thinking with your health profile...</span>
            </div>
          )}

          {chatError && (
            <div className="bg-rose-50 text-rose-700 p-3 rounded-2xl text-xs font-medium border border-rose-200">
              {chatError}
            </div>
          )}

          <div ref={messagesEndRef} className="h-6 shrink-0" />
        </div>

        {/* Input Bar */}
        <div className="fixed bottom-[82px] left-0 right-0 max-w-md mx-auto px-6 bg-[#F9F7F4]/95 backdrop-blur-md pt-2 pb-4 z-30">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2 bg-white rounded-2xl border border-stone-300/80 p-1.5 shadow-md focus-within:border-tree-600 transition-colors"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder={isListening ? "Listening... Speak now" : `Ask in ${roomConfig.title}...`}
              disabled={isSendingMessage}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 font-medium focus:outline-none"
            />
            
            <button
              type="button"
              onClick={startSpeechRecognition}
              disabled={isSendingMessage}
              className={`p-2.5 rounded-xl transition-all cursor-pointer active:scale-95 flex-shrink-0 flex items-center justify-center ${
                isListening 
                  ? 'bg-rose-100 text-rose-600 animate-pulse' 
                  : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
              }`}
              title={isListening ? "Listening... Tap to stop" : "Voice Dictate / Speak"}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <button
              type="submit"
              disabled={!inputMessage.trim() || isSendingMessage || isListening}
              className="p-2.5 rounded-xl bg-tree-600 hover:bg-tree-700 text-white disabled:opacity-40 disabled:hover:bg-tree-600 transition-all active:scale-95 flex-shrink-0"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>

        {/* New Chat Reset Confirmation Dialog */}
        {showResetConfirm && (
          <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-6 z-50">
            <div className="bg-[#F9F7F4] rounded-[2rem] border border-stone-200 shadow-2xl max-w-sm w-full p-6 flex flex-col gap-4 animate-in fade-in zoom-in-95">
              <div className="flex flex-col gap-2">
                <h3 className="text-lg font-bold text-stone-900">Start a new chat?</h3>
                <p className="text-xs font-medium text-stone-500 leading-relaxed">
                  Start fresh to keep the AI focused and accurate. Select whether you'd like to carry forward the active topic focus, or start completely clean.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleResetChat(true)}
                  className="w-full bg-tree-600 hover:bg-tree-700 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-transform active:scale-98"
                >
                  <Sparkles size={16} />
                  Continue Current Topic (Smart Bridge)
                </button>
                
                <button
                  type="button"
                  onClick={() => handleResetChat(false)}
                  className="w-full bg-white hover:bg-stone-50 text-stone-800 font-bold py-3 px-4 rounded-xl border border-stone-200/80 text-xs flex items-center justify-center gap-2 transition-transform active:scale-98"
                >
                  Start Completely Fresh
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center transition-transform active:scale-98"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-8 pb-40">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-stone-900 leading-none">
            Coaching
          </h1>
          <span className="text-[10px] text-stone-400 font-semibold tracking-wide uppercase mt-1 inline-block">Personal AI Advisors</span>
        </div>
        <button 
          onClick={() => setShowCoachingHelp(!showCoachingHelp)}
          className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
            showCoachingHelp 
              ? 'bg-sky-50 text-sky-700 border-sky-200 shadow-2xs' 
              : 'bg-stone-50 text-stone-400 border-stone-200 hover:text-stone-600'
          }`}
          aria-label="Coaching guide help"
        >
          <HelpCircle size={14} />
        </button>
      </header>

      {showCoachingHelp && (
        <div className="bg-gradient-to-r from-tree-50/50 to-sky-50/50 border border-tree-100 rounded-2xl p-4 text-xs text-stone-600 font-medium leading-relaxed animate-in fade-in">
          <span>Explore custom contextual AI coaching rooms. These models automatically ingest your daily workouts, meal descriptions, physiological vitals, and habits directly from your private Google Drive files to provide highly safe and tailored lifestyle insights.</span>
        </div>
      )}

      {/* Specialized Coaching Rooms Grid */}
      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-bold text-stone-900">Specialized Coaching Rooms</h2>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {COACHING_ROOMS.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`w-full rounded-3xl p-5 border text-left flex items-start justify-between gap-4 transition-all hover:shadow-md active:scale-98 cursor-pointer ${room.bgGradient}`}
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="p-3 bg-white/90 rounded-2xl shadow-xs flex-shrink-0 mt-0.5">
                  {room.icon}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base text-stone-900 truncate">
                      {room.title}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/80 text-stone-700 shadow-2xs">
                      {room.badge}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-stone-600 mt-1 leading-relaxed">
                    {room.subtitle}
                  </p>
                </div>
              </div>
              <div className="p-2 rounded-full bg-white/70 text-stone-500 flex-shrink-0 mt-1">
                <ChevronRight size={18} />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Weekly Insights Section */}
      <section className="flex flex-col gap-4 mt-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-bold text-stone-900">Weekly Insights</h2>
          <button 
            onClick={() => loadOrGenerateInsights(true)}
            disabled={isGenerating}
            className="flex items-center gap-1.5 text-xs font-bold text-tree-700 bg-tree-50 hover:bg-tree-100 border border-tree-200/60 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
            {isGenerating ? "Analyzing..." : "Generate"}
          </button>
        </div>

        {error && (
          <div className="bg-rose-50 text-rose-700 p-4 rounded-2xl text-sm font-medium border border-rose-100">
            {error} - Please try generating again manually.
          </div>
        )}

        {!insights && !isGenerating && !error && (
          <div className="bg-white border border-stone-200/80 rounded-3xl p-6 text-center shadow-xs">
            <Leaf size={32} className="mx-auto text-tree-600 mb-2" />
            <p className="text-stone-800 font-bold">Ready to review your week?</p>
            <p className="text-xs text-stone-500 mt-1">Tap generate to analyze recent workouts, meals, and adherence.</p>
          </div>
        )}

        {insights && (
          <div className="flex flex-col gap-4">
            {/* Formatted Weekly Overview Card (Calming Green/Warm Stone instead of harsh black) */}
            <div className="bg-gradient-to-br from-emerald-50/90 via-tree-50/50 to-stone-50 border border-emerald-200/70 text-stone-800 rounded-3xl p-5 shadow-xs flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                <h3 className="font-extrabold text-emerald-800 text-xs tracking-wider uppercase flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                    <Sparkles size={14} />
                  </div>
                  <span>Weekly Summary & Analysis</span>
                </h3>
                <span className="text-[10px] font-bold text-emerald-600 bg-white/80 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                  AI Evaluated
                </span>
              </div>
              
              {/* Clean structured formatting for summary text */}
              <div className="text-sm leading-relaxed text-stone-700 font-medium flex flex-col gap-2">
                {insights.summary.split('\n\n').length > 1 ? (
                  insights.summary.split('\n\n').map((paragraph: string, idx: number) => (
                    <p key={idx}>{paragraph}</p>
                  ))
                ) : (
                  insights.summary.split(/(?<=[.?!])\s+/).reduce((acc: string[][], sentence: string, idx: number) => {
                    const chunkIdx = Math.floor(idx / 2);
                    if (!acc[chunkIdx]) acc[chunkIdx] = [];
                    acc[chunkIdx].push(sentence);
                    return acc;
                  }, []).map((sentences: string[], pIdx: number) => (
                    <p key={pIdx} className="leading-relaxed">{sentences.join(' ')}</p>
                  ))
                )}
              </div>
            </div>

            {/* Achievements */}
            {insights.achievements && insights.achievements.length > 0 && (
              <div className="bg-white border border-stone-200/80 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                    <Trophy size={18} />
                  </div>
                  <h3 className="font-bold text-stone-900 text-base">Wins This Week</h3>
                </div>
                <ul className="flex flex-col gap-2.5">
                  {insights.achievements.map((ach: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="text-stone-700 text-xs font-medium leading-relaxed">{ach}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Enhanced Suggested Routines (Larger & More Actionable) */}
            {insights.suggestedRoutines && insights.suggestedRoutines.length > 0 && (
              <div className="bg-gradient-to-br from-amber-50/80 to-amber-100/30 border border-amber-200/90 rounded-3xl p-5 shadow-xs flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-amber-200/80 text-amber-900 rounded-xl shadow-2xs">
                      <CalendarPlus size={20} />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-stone-900 text-base leading-tight">Suggested Routines</h3>
                      <span className="text-[11px] text-stone-500 font-medium">Auto-detected recurring habits</span>
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-stone-600 font-medium">
                  Add consistent habits detected in your daily logs to your active schedule:
                </p>

                <div className="flex flex-col gap-3 mt-1">
                  {insights.suggestedRoutines.map((routine: any, i: number) => {
                    const isAccepted = acceptedRoutines.has(i);
                    return (
                      <div key={i} className="bg-white p-4 rounded-2xl shadow-xs border border-amber-200/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all hover:border-amber-300">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60 shrink-0 mt-0.5">
                            <Sparkles size={16} />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-stone-900 text-sm leading-snug">{routine.text}</span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] font-semibold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-md">
                                {routine.timeBucket}
                              </span>
                              <span className="text-[11px] font-medium text-stone-500">
                                {routine.frequency}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                          {isAccepted ? (
                            <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold">
                              <CheckCircle2 size={16} />
                              <span>Added to Routine</span>
                            </div>
                          ) : (
                            <button 
                              onClick={() => acceptRoutine(routine, i)}
                              className="w-full sm:w-auto px-4 py-2.5 bg-tree-700 hover:bg-tree-800 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <CheckCircle2 size={15} />
                              <span>Accept Routine</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Health Profile Link Card - Moved to Bottom of Page with Fresh Color Scheme */}
      <section className="mt-4 pt-4 border-t border-stone-200/80">
        <button 
          onClick={onOpenProfile}
          className="w-full bg-gradient-to-r from-tree-700 via-tree-600 to-canopy-700 hover:from-tree-800 hover:to-canopy-800 text-white rounded-3xl p-5 flex items-center justify-between transition-all active:scale-98 shadow-lg shadow-tree-900/15 cursor-pointer border border-tree-500/30"
        >
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <BrainCircuit size={24} className="text-white" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-lg leading-snug">My Health Profile</span>
              <span className="text-tree-100 text-xs font-medium">Review verified facts & customized targets</span>
            </div>
          </div>
          <ChevronRight size={22} className="text-tree-200" />
        </button>
      </section>
    </div>
  );
}
