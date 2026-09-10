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
  Moon
} from 'lucide-react';
import { getInsightsFromDrive, saveInsightsToDrive, readJsonFile, getOrCreateMonthlyLogFile, getUserProfileFromDrive, writeJsonFile, getOrCreateCareDigestFile, appendCaregiverDigest } from '../lib/drive';
import { CoachingRoomId, CoachingMessage, UserProfile, HealthFact, HealthLogEntry } from '../types';

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
    bgGradient: 'bg-gradient-to-br from-emerald-50 to-teal-100/60 border-emerald-200/80',
    chipBg: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-800',
    chipText: 'text-emerald-700',
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
    icon: <Utensils size={24} className="text-amber-700" />,
    themeColor: 'amber',
    bgGradient: 'bg-gradient-to-br from-amber-50 to-orange-100/60 border-amber-200/80',
    chipBg: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-800',
    chipText: 'text-amber-700',
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
    icon: <Stethoscope size={24} className="text-rose-700" />,
    themeColor: 'rose',
    bgGradient: 'bg-gradient-to-br from-rose-50 to-pink-100/60 border-rose-200/80',
    chipBg: 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-800',
    chipText: 'text-rose-700',
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
    icon: <Moon size={24} className="text-canopy-700" />,
    themeColor: 'canopy',
    bgGradient: 'bg-gradient-to-br from-sky-50 to-blue-100/60 border-sky-200/80',
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
  user
}: { 
  onOpenProfile: () => void;
  driveState: any;
  userProfile?: UserProfile | null;
  user?: any;
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
      if (!forceGenerate) {
        const existing = await getInsightsFromDrive(driveState.token, driveState.mainFolderId);
        if (existing && existing.lastGeneratedDate) {
          const generatedDate = new Date(existing.lastGeneratedDate);
          const now = new Date();
          const daysSince = (now.getTime() - generatedDate.getTime()) / (1000 * 3600 * 24);
          
          if (daysSince < 7) {
            setInsights(existing.data);
            setIsGenerating(false);
            return;
          }
        }
      }
      
      const { fileId } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId);
      const data = await readJsonFile(driveState.token, fileId);
      const logs = data?.logs || [];
      
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: recentLogs, facts, userProfile: profile })
      });
      
      if (!res.ok) throw new Error('Failed to generate insights');
      const newInsights = await res.json();
      
      await saveInsightsToDrive(driveState.token, driveState.mainFolderId, {
        lastGeneratedDate: new Date().toISOString(),
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
  }, [driveState?.token, driveState?.mainFolderId]);

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

      const response = await fetch('/api/coaching-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: activeRoomId,
          message: text,
          conversationHistory: currentHistory,
          facts,
          recentLogs,
          userProfile: profile
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get coaching response');
      }

      const data = await response.json();
      const newBotMsg: CoachingMessage = {
        id: 'msg-bot-' + Date.now(),
        role: 'assistant',
        text: data.reply || "I'm here to support you.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setRoomMessages(prev => ({
        ...prev,
        [activeRoomId]: [...(prev[activeRoomId] || []), newBotMsg]
      }));
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

    return (
      <div className="flex flex-col min-h-screen pt-4 pb-28">
        {/* Room Header */}
        <header className="flex items-center gap-3 pb-3 border-b border-stone-200/80 sticky top-0 bg-[#F9F7F4] z-10">
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
        </header>

        {/* Chat Messages Area */}
        <div className="flex-1 flex flex-col gap-4 py-4 overflow-y-auto">
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
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed font-medium shadow-xs ${
                  msg.role === 'user'
                    ? 'bg-stone-900 text-white rounded-br-xs'
                    : 'bg-white text-stone-800 border border-stone-200/80 rounded-bl-xs whitespace-pre-wrap'
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[10px] font-bold text-stone-400 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          ))}

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

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="fixed bottom-16 left-0 right-0 max-w-md mx-auto px-6 bg-[#F9F7F4]/90 backdrop-blur-md pt-2 pb-3 z-30">
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
              placeholder={`Ask in ${roomConfig.title}...`}
              disabled={isSendingMessage}
              className="flex-1 bg-transparent px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 font-medium focus:outline-none"
            />
            <button
              type="submit"
              disabled={!inputMessage.trim() || isSendingMessage}
              className="p-2.5 rounded-xl bg-tree-600 hover:bg-tree-700 text-white disabled:opacity-40 disabled:hover:bg-tree-600 transition-all active:scale-95 flex-shrink-0"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-8 pb-40">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">
          Coaching
        </h1>
        <p className="text-base text-stone-500 font-medium leading-relaxed">
          Contextual AI coaching rooms and weekly wellness insights grounded in your personal health profile.
        </p>
      </header>

      {/* Health Profile Link Card */}
      <section>
        <button 
          onClick={onOpenProfile}
          className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-3xl p-5 flex items-center justify-between transition-transform active:scale-98 shadow-md shadow-stone-900/10"
        >
          <div className="flex items-center gap-4">
            <div className="bg-stone-700/60 p-3 rounded-2xl">
              <BrainCircuit size={24} className="text-stone-100" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-bold text-lg">My Health Profile</span>
              <span className="text-stone-300 text-xs font-medium">Review verified facts & customized targets</span>
            </div>
          </div>
          <ChevronRight size={22} className="text-stone-400" />
        </button>
      </section>

      {/* Interactive Coaching Rooms Grid */}
      <section className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xl font-bold text-stone-900">Specialized Coaching Rooms</h2>
          <span className="text-xs font-semibold text-stone-500">Zero-database AI</span>
        </div>

        <div className="grid grid-cols-1 gap-3.5">
          {COACHING_ROOMS.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`w-full rounded-3xl p-5 border text-left flex items-start justify-between gap-4 transition-all hover:shadow-md active:scale-98 ${room.bgGradient}`}
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
            className="flex items-center gap-1.5 text-xs font-bold text-canopy-700 bg-canopy-50 hover:bg-canopy-100 border border-canopy-200 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
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
            {/* Summary */}
            <div className="bg-stone-900 text-stone-50 rounded-3xl p-5 shadow-sm">
              <h3 className="font-bold text-tree-300 text-xs tracking-wider uppercase mb-2 flex items-center gap-1.5">
                <Sparkles size={14} /> Weekly Overview
              </h3>
              <p className="text-sm leading-relaxed font-medium text-stone-200">
                {insights.summary}
              </p>
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

            {/* Suggested Routines */}
            {insights.suggestedRoutines && insights.suggestedRoutines.length > 0 && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-3xl p-5 shadow-xs">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="p-2 bg-amber-200/70 text-amber-800 rounded-xl">
                    <CalendarPlus size={18} />
                  </div>
                  <h3 className="font-bold text-stone-900 text-base">Suggested Routines</h3>
                </div>
                <p className="text-xs text-stone-600 mb-3">Consistent habits detected in your logs. Add them to your daily tracking?</p>
                <div className="flex flex-col gap-2.5">
                  {insights.suggestedRoutines.map((routine: any, i: number) => {
                    const isAccepted = acceptedRoutines.has(i);
                    return (
                      <div key={i} className="bg-white p-3.5 rounded-2xl shadow-2xs border border-amber-200/60 flex items-center justify-between gap-3">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-stone-900 text-xs truncate">{routine.text}</span>
                          <span className="text-stone-500 text-[11px] mt-0.5">{routine.timeBucket} • {routine.frequency}</span>
                        </div>
                        <button 
                          onClick={() => acceptRoutine(routine, i)}
                          disabled={isAccepted}
                          className={"flex-shrink-0 flex items-center justify-center p-2 rounded-xl transition-all " + (isAccepted ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-900 text-white hover:bg-stone-800 active:scale-95')}
                        >
                          {isAccepted ? <CheckCircle2 size={16} /> : <span className="text-xs font-bold px-2">Accept</span>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
