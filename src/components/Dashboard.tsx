import { 
  Heart, 
  Footprints,
  Flame, 
  Moon, 
  Cloud, 
  CheckCircle2, 
  Circle, 
  Utensils, 
  Dumbbell, 
  Pill, 
  HeartPulse, 
  MessageSquare, 
  Mic, 
  Loader2, 
  Calendar,
  ChevronDown,
  ChevronUp,
  Sunrise,
  Sun,
  Sunset,
  Target,
  Activity,
  Sparkles,
  Timer
} from "lucide-react";
import React, { useState, useEffect, useMemo } from 'react';
import { DriveState, HealthLogEntry, UserProfile, TimeBucket } from '../types';
import { readJsonFile, getOrCreateMonthlyLogFile, getMonthlyLogFileName, getUserDisplayName, listMonthlyLogFiles } from '../lib/drive';

type ActivityCategory = 'all' | 'workout' | 'meal' | 'medication' | 'event' | 'general' | 'routine';

interface DashboardProps {
  driveState?: DriveState | null;
  refreshTrigger?: number;
  userProfile?: UserProfile | null;
  user?: { displayName?: string | null; email?: string | null } | null;
}

interface ActivityEntry {
  id: string;
  time: string;
  category: 'workout' | 'meal' | 'medication' | 'event' | 'general' | 'routine';
  title: string;
  subtitle: string;
  status?: 'completed' | 'pending';
  source?: 'voice' | 'manual';
  rawTranscript?: string;
  timestamp?: number;
  timeBucket: TimeBucket;
  dateKey: string;
  dateLabel: string;
  dayName: string;
  calories?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
}

function getDateInfo(date: Date) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fullYear = date.getFullYear();

  const dateKey = `${fullYear}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  let dateLabel = `${monthDay}, ${fullYear}`;
  if (isToday) {
    dateLabel = `Today • ${monthDay}`;
  } else if (isYesterday) {
    dateLabel = `Yesterday • ${monthDay}`;
  }

  return {
    dateKey,
    dateLabel,
    dayName,
  };
}

function inferTimeBucketFromTime(timeStr: string): TimeBucket {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const meridiem = match[3]?.toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;

    if (hour >= 5 && hour < 12) return 'Morning';
    if (hour >= 12 && hour < 17) return 'Afternoon';
    if (hour >= 17 && hour < 21) return 'Evening';
    return 'Night';
  }
  return 'Morning';
}

function getLogTimeBucket(log: HealthLogEntry): TimeBucket {
  if (log.timeBucket) return log.timeBucket;

  const text = (log.transcript || '').toLowerCase();
  if (/\b(breakfast|morning|am|woke\s*up|early)\b/.test(text)) return 'Morning';
  if (/\b(lunch|noon|afternoon|midday)\b/.test(text)) return 'Afternoon';
  if (/\b(evening|sunset|tea\s*time|snacks?)\b/.test(text)) return 'Evening';
  if (/\b(dinner|night|bedtime|sleep|slept)\b/.test(text)) return 'Night';

  if (log.displayTime) {
    return inferTimeBucketFromTime(log.displayTime);
  }
  if (log.timestamp) {
    const d = new Date(log.timestamp);
    if (!isNaN(d.getTime())) {
      const hour = d.getHours();
      if (hour >= 5 && hour < 12) return 'Morning';
      if (hour >= 12 && hour < 17) return 'Afternoon';
      if (hour >= 17 && hour < 21) return 'Evening';
      return 'Night';
    }
  }
  return 'Morning';
}

function extractFallbackHeadline(text: string, category: string): string {
  const clean = (text || '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const slice = words.slice(0, Math.min(4, Math.max(2, words.length)));
    return slice.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }
  const defaults: Record<string, string> = {
    workout: 'Workout Activity',
    meal: 'Meal Intake',
    medication: 'Medication Dose',
    event: 'Health Check',
    general: 'Health Note',
  };
  return defaults[category] || 'Health Note';
}

function getBucketIcon(bucket: TimeBucket) {
  switch (bucket) {
    case 'Morning':
      return <Sunrise size={13} className="text-amber-500" />;
    case 'Afternoon':
      return <Sun size={13} className="text-orange-500" />;
    case 'Evening':
      return <Sunset size={13} className="text-indigo-500" />;
    case 'Night':
      return <Moon size={13} className="text-blue-500" />;
  }
}


export default function Dashboard({ driveState, refreshTrigger, userProfile, user }: DashboardProps) {
  const [routineActivities, setRoutineActivities] = useState<ActivityEntry[]>([]);
  const [logStatusOverrides, setLogStatusOverrides] = useState<Record<string, 'completed' | 'pending'>>({});
  const [selectedFilter, setSelectedFilter] = useState<ActivityCategory>('all');
  const [healthLogs, setHealthLogs] = useState<HealthLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [todayCaloriesConsumed, setTodayCaloriesConsumed] = useState<number | null>(null);
  const [todayCaloriesBurned, setTodayCaloriesBurned] = useState<number | null>(null);
  const [todayActiveMinutes, setTodayActiveMinutes] = useState<number | null>(null);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [todayHeartRate, setTodayHeartRate] = useState<number | null>(null);
  const [todaySleep, setTodaySleep] = useState<{ hours: number; efficiency?: number } | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>('logs.json');
  const [activeMonthDisplay, setActiveMonthDisplay] = useState<string>('');
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadDashboardData() {
      if (!driveState?.token) {
        setRoutineActivities([]);
        setTodayCaloriesConsumed(null);
        setTodayCaloriesBurned(null);
        setTodayActiveMinutes(null);
        setTodaySteps(null);
        setTodayHeartRate(null);
        setTodaySleep(null);
        return;
      }

      setIsLoadingLogs(true);
      try {
        // 1. Load routine activities from context_memory.json if available
        if (driveState.contextFileId) {
          const context = await readJsonFile(driveState.token, driveState.contextFileId);
          if (context && Array.isArray(context.facts)) {
            const routineFacts = context.facts.filter((f: any) => 
              f.category === 'routine' || 
              f.category === 'medication' || 
              f.key?.toLowerCase().includes('routine') || 
              f.key?.toLowerCase().includes('walk') || 
              f.key?.toLowerCase().includes('medication')
            );
            if (routineFacts.length > 0) {
              const mappedRoutines: ActivityEntry[] = routineFacts.map((f: any, idx: number) => {
                const timeStr = f.value?.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i)?.[1] || '08:00 AM';
                return {
                  id: `fact-${f.id || idx}`,
                  time: timeStr,
                  category: (f.category === 'medication' ? 'medication' : f.category === 'workout' ? 'workout' : f.category === 'meal' ? 'meal' : 'routine') as ActivityCategory,
                  title: f.key ? f.key.charAt(0).toUpperCase() + f.key.slice(1).replace(/_/g, ' ') : 'Daily Activity',
                  subtitle: f.value || '',
                  status: 'pending' as const,
                  timeBucket: inferTimeBucketFromTime(timeStr),
                  dateKey: 'today',
                  dateLabel: 'Today',
                  dayName: 'Today'
                };
              });
              setRoutineActivities(mappedRoutines);
            } else {
              setRoutineActivities([]);
            }
          }
        }

        // 2. Load monthly health logs
        const { fileId, fileName, monthKey } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId);
        setActiveFileName(fileName);
        setActiveMonthDisplay(monthKey);
        const logData = await readJsonFile(driveState.token, fileId);
        let logs: HealthLogEntry[] = [];
        if (logData && Array.isArray(logData.logs)) {
          logs = logData.logs;
        }

        // If current month has no logs, inspect other monthly partition files in Drive so imported data is immediately shown
        if (logs.length === 0) {
          const monthlyFiles = await listMonthlyLogFiles(driveState.token, driveState.mainFolderId);
          for (const mFile of monthlyFiles) {
            if (mFile.id !== fileId) {
              const pastData = await readJsonFile(driveState.token, mFile.id);
              if (pastData && Array.isArray(pastData.logs) && pastData.logs.length > 0) {
                logs = pastData.logs;
                setActiveFileName(mFile.name);
                setActiveMonthDisplay(mFile.month);
                break;
              }
            }
          }
        }

        setHealthLogs(logs);

        // Calculate today's real stats from logs
        const todayInfo = getDateInfo(new Date());
        let consumed: number | null = null;
        let burned: number | null = null;
        let activeMins: number | null = null;
        let steps: number | null = null;
        let heartRate: number | null = null;
        let sleep: { hours: number; efficiency?: number } | null = null;

        logs.forEach((log: HealthLogEntry) => {
          const logDate = log.timestamp ? new Date(log.timestamp) : null;
          const isToday = logDate && !isNaN(logDate.getTime()) && getDateInfo(logDate).dateKey === todayInfo.dateKey;
          
          if (isToday) {
            // Meals / Calories consumed
            if (log.category === 'meal') {
              if (typeof log.calories === 'number' && log.calories > 0) {
                consumed = (consumed || 0) + log.calories;
              } else {
                const calMatch = log.transcript?.match(/(\d+)\s*(?:kcal|calories)/i);
                if (calMatch) {
                  consumed = (consumed || 0) + parseInt(calMatch[1], 10);
                }
              }
            }

            // Workouts & active minutes & calories burned
            if (log.category === 'workout') {
              const calBurn = typeof log.caloriesBurned === 'number' 
                ? log.caloriesBurned 
                : (typeof log.calories === 'number' ? log.calories : undefined);
              if (calBurn !== undefined && calBurn > 0) {
                burned = (burned || 0) + calBurn;
              } else {
                const burnMatch = log.transcript?.match(/(\d+)\s*(?:kcal burned|calories burned)/i);
                if (burnMatch) {
                  burned = (burned || 0) + parseInt(burnMatch[1], 10);
                }
              }

              if (typeof log.activeMinutes === 'number' && log.activeMinutes > 0) {
                activeMins = (activeMins || 0) + log.activeMinutes;
              } else {
                const minMatch = log.transcript?.match(/(\d+)\s*(?:mins|minutes)/i);
                if (minMatch) {
                  activeMins = (activeMins || 0) + parseInt(minMatch[1], 10);
                }
              }
            }

            // Steps (could be on activity or workout log)
            if (typeof log.steps === 'number' && log.steps > 0) {
              steps = Math.max(steps || 0, log.steps);
            } else {
              const stepMatch = log.transcript?.match(/([\d,]+)\s*steps/i);
              if (stepMatch) {
                const parsedSteps = parseInt(stepMatch[1].replace(/,/g, ''), 10);
                if (!isNaN(parsedSteps) && parsedSteps > 0) {
                  steps = Math.max(steps || 0, parsedSteps);
                }
              }
            }

            // Heart Rate / Resting Heart Rate
            if (typeof log.restingHeartRate === 'number' && log.restingHeartRate > 0) {
              heartRate = log.restingHeartRate;
            } else if (typeof log.heartRate === 'number' && log.heartRate > 0 && heartRate === null) {
              heartRate = log.heartRate;
            } else if (heartRate === null) {
              const hrMatch = log.transcript?.match(/(\d{2,3})\s*bpm/i);
              if (hrMatch) {
                const parsedHr = parseInt(hrMatch[1], 10);
                if (!isNaN(parsedHr) && parsedHr >= 40 && parsedHr <= 200) {
                  heartRate = parsedHr;
                }
              }
            }

            // Sleep logged today (e.g. woke up today morning)
            if (typeof log.sleepHours === 'number' && log.sleepHours > 0) {
              sleep = { hours: log.sleepHours, efficiency: log.sleepEfficiency };
            } else if (sleep === null) {
              const sleepMatch = log.transcript?.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours)\s*(?:total\s*)?sleep/i);
              if (sleepMatch) {
                const parsedHours = parseFloat(sleepMatch[1]);
                if (!isNaN(parsedHours) && parsedHours > 0) {
                  const effMatch = log.transcript?.match(/Efficiency:\s*(\d+)%/i);
                  sleep = { 
                    hours: parsedHours, 
                    efficiency: effMatch ? parseInt(effMatch[1], 10) : undefined 
                  };
                }
              }
            }
          }
        });

        // If no sleep was logged today morning, check if sleep was logged yesterday
        if (!sleep) {
          const yesterdayInfo = getDateInfo(new Date(Date.now() - 86400000));
          for (const log of logs) {
            const logDate = log.timestamp ? new Date(log.timestamp) : null;
            const isYesterday = logDate && !isNaN(logDate.getTime()) && getDateInfo(logDate).dateKey === yesterdayInfo.dateKey;
            if (isYesterday) {
              if (typeof log.sleepHours === 'number' && log.sleepHours > 0) {
                sleep = { hours: log.sleepHours, efficiency: log.sleepEfficiency };
                break;
              } else {
                const sleepMatch = log.transcript?.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|hours)\s*(?:total\s*)?sleep/i);
                if (sleepMatch) {
                  const parsedHours = parseFloat(sleepMatch[1]);
                  if (!isNaN(parsedHours) && parsedHours > 0) {
                    const effMatch = log.transcript?.match(/Efficiency:\s*(\d+)%/i);
                    sleep = { 
                      hours: parsedHours, 
                      efficiency: effMatch ? parseInt(effMatch[1], 10) : undefined 
                    };
                    break;
                  }
                }
              }
            }
          }
        }

        setTodayCaloriesConsumed(consumed);
        setTodayCaloriesBurned(burned);
        setTodayActiveMinutes(activeMins);
        setTodaySteps(steps);
        setTodayHeartRate(heartRate);
        setTodaySleep(sleep);
      } catch (err) {
        console.warn('Could not load dashboard data from Drive:', err);
        setRoutineActivities([]);
        setTodayCaloriesConsumed(null);
        setTodayCaloriesBurned(null);
        setTodayActiveMinutes(null);
        setTodaySteps(null);
        setTodayHeartRate(null);
        setTodaySleep(null);
      } finally {
        setIsLoadingLogs(false);
      }
    }

    loadDashboardData();
  }, [driveState, refreshTrigger]);
  
  const toggleStatus = (id: string, currentStatus: 'completed' | 'pending') => {
    setLogStatusOverrides(prev => ({
      ...prev,
      [id]: currentStatus === 'completed' ? 'pending' : 'completed'
    }));
  };

  const combinedActivities = useMemo(() => {
    const rawItems: ActivityEntry[] = [
      ...routineActivities.map((r) => ({
        ...r,
        status: logStatusOverrides[r.id] || r.status,
      })),
      ...healthLogs.map((l) => ({
        id: l.id,
        time: new Date(l.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        category: l.category,
        title: l.headline || (l.category === 'meal' ? 'Meal Log' : l.category === 'workout' ? 'Workout Log' : 'Health Note'),
        subtitle: l.transcript.length > 60 ? l.transcript.substring(0, 60) + '...' : l.transcript,
        status: 'completed' as const,
        timestamp: new Date(l.timestamp).getTime(),
        timeBucket: l.timeBucket || getLogTimeBucket(l),
        dateKey: getDateInfo(new Date(l.timestamp)).dateKey,
        dateLabel: getDateInfo(new Date(l.timestamp)).dateLabel,
        dayName: getDateInfo(new Date(l.timestamp)).dayName,
        source: l.source,
        rawTranscript: l.transcript,
        calories: l.calories,
        caloriesBurned: l.caloriesBurned,
        activeMinutes: l.activeMinutes
      })),
    ];

    let filtered = rawItems;
    if (selectedFilter !== 'all') {
      filtered = rawItems.filter((i) => i.category === selectedFilter);
    }
    return filtered;
  }, [routineActivities, healthLogs, selectedFilter, logStatusOverrides]);

  const dateGroups = useMemo(() => {
    const groups: Record<string, { items: ActivityEntry[]; dateLabel: string; dayName: string; rawDate: Date }> = {};
    
    combinedActivities.forEach(act => {
      let dateKey = 'Today';
      let dateLabel = 'Today';
      let dayName = 'Today';
      let sortTime = new Date().getTime();
      let rawDate = new Date();
      
      if (act.timestamp) {
        rawDate = new Date(act.timestamp);
        const info = getDateInfo(rawDate);
        dateKey = info.dateKey;
        dateLabel = info.dateLabel;
        dayName = info.dayName;
        sortTime = rawDate.getTime();
      } else {
        const info = getDateInfo(new Date());
        dateKey = info.dateKey;
        dateLabel = info.dateLabel;
        dayName = info.dayName;
      }
      
      if (!groups[dateKey]) {
        groups[dateKey] = {
          items: [],
          dateLabel,
          dayName,
          rawDate
        };
      }
      groups[dateKey].items.push({ ...act, _sortTime: sortTime } as any);
    });

    const TIME_BUCKET_ORDER: TimeBucket[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

    const sortedGroups = Object.entries(groups).sort(([, a], [, b]) => {
      return b.rawDate.getTime() - a.rawDate.getTime();
    });

    return sortedGroups.map(([dateKey, groupData]) => {
      groupData.items.sort((a, b) => ((b as any)._sortTime as number) - ((a as any)._sortTime as number));
      
      const timeBuckets: Record<TimeBucket, ActivityEntry[]> = {
        Morning: [],
        Afternoon: [],
        Evening: [],
        Night: []
      };
      
      groupData.items.forEach(item => {
        const bucket: TimeBucket = item.timeBucket || (item.timestamp ? getLogTimeBucket(item as any) : inferTimeBucketFromTime(item.time)) || 'Morning';
        if (timeBuckets[bucket]) {
          timeBuckets[bucket].push(item);
        } else {
          timeBuckets['Morning'].push(item);
        }
      });

      const bucketGroups = TIME_BUCKET_ORDER.map(bucket => ({
        bucket,
        activities: timeBuckets[bucket]
      })).filter(bg => bg.activities.length > 0);
      
      return { 
        dateKey, 
        dateLabel: groupData.dateLabel,
        dayName: groupData.dayName,
        totalCount: groupData.items.length,
        bucketGroups 
      };
    });
  }, [combinedActivities]);

const toggleDateCollapse = (dateKey: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [dateKey]: !prev[dateKey],
    }));
  };

  const effectiveName = getUserDisplayName(userProfile, user);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const currentDateDisplay = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const isCustomCalorieTarget = userProfile?.userTargets?.calories !== undefined && userProfile.userTargets.calories > 0;
  const isAiCalorieTarget = !isCustomCalorieTarget && userProfile?.aiTargets?.calories !== undefined && userProfile.aiTargets.calories > 0;
  const targetCalories = userProfile?.userTargets?.calories || userProfile?.aiTargets?.calories || 2000;
  const targetSteps = userProfile?.userTargets?.steps || userProfile?.aiTargets?.steps || 6000;
  const targetActiveTime = userProfile?.userTargets?.activeTimeMins || userProfile?.aiTargets?.activeTimeMins || 30;
  const targetHR = userProfile?.userTargets?.restingHeartRate || userProfile?.aiTargets?.restingHeartRate || 65;

  // Task Completion
  const todayRoutines = routineActivities;
  const completedRoutines = todayRoutines.filter(r => (logStatusOverrides[r.id] || r.status) === 'completed').length;
  const hasTasks = todayRoutines.length > 0;
  const taskCompletionText = hasTasks ? `${completedRoutines} out of ${todayRoutines.length} today's tasks completed` : 'No tasks scheduled';
  const taskCompletionPercentage = hasTasks ? Math.round((completedRoutines / todayRoutines.length) * 100).toString() : "-";

  return (
    <div className="flex flex-col gap-6 pt-6 pb-32 bg-[#F9F7F4] min-h-screen relative">
      <header className="flex items-start justify-between px-1">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">
            {getGreeting()}, {effectiveName}
          </h1>
          <p className="text-sm text-stone-500 font-medium mt-0.5">{currentDateDisplay}</p>
        </div>
      </header>

      {/* Vitals Summary - Restructured 4-Row Layout */}
      <section className="flex flex-col gap-4">
        {/* Row 1: Left - Steps, Right - Active Time */}
        <div className="grid grid-cols-2 gap-4">
          <VitalCard 
            icon={<Footprints size={24} className="text-tree-600" />} 
            title="Daily Steps" 
            value={todaySteps !== null ? todaySteps.toLocaleString() : "-"} 
            subtitle={`Goal: ${targetSteps.toLocaleString()}`} 
          />
          <VitalCard 
            icon={<Activity size={24} className="text-blue-500" />} 
            title="Active Time" 
            value={todayActiveMinutes !== null ? todayActiveMinutes.toString() : "-"} 
            unit={todayActiveMinutes !== null ? "m" : undefined} 
            subtitle={`Goal: ${targetActiveTime}m`} 
          />
        </div>

        {/* Row 2: Left - Resting Heart Rate, Right - Daily Task Completion Tracker */}
        <div className="grid grid-cols-2 gap-4">
          <VitalCard 
            icon={<Heart size={24} className="text-rose-500" />} 
            title="Heart Rate" 
            value={todayHeartRate !== null ? String(todayHeartRate) : "-"} 
            unit={todayHeartRate !== null ? "bpm" : undefined} 
            subtitle={`Target Resting: ${targetHR} bpm`} 
          />
          <VitalCard 
            icon={<Target size={24} className="text-purple-500" />} 
            title="Daily Tasks" 
            value={hasTasks ? taskCompletionPercentage : "-"} 
            unit={hasTasks ? "%" : undefined} 
            subtitle={taskCompletionText} 
          />
        </div>

        {/* Row 3: Rich Visual Calories Tracker - Consumed & Burnt vs Target (Stacked / Visual Bar) */}
        <div className="bg-white rounded-[1.75rem] border border-stone-200/90 p-5 shadow-xs flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center text-orange-600 shadow-2xs">
                <Flame size={20} />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-stone-900 leading-tight">Calories Balance</h3>
                <p className="text-xs text-stone-500 font-medium">Consumed & Burnt vs Daily Target</p>
              </div>
            </div>
            
            {/* Target source badge */}
            <div className="flex items-center gap-1.5">
              {isCustomCalorieTarget ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/80 shadow-2xs">
                  🎯 Target: {targetCalories.toLocaleString()} kcal
                </span>
              ) : isAiCalorieTarget ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-900 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200/80 shadow-2xs">
                  <Sparkles size={12} className="text-teal-600" /> AI Target: {targetCalories.toLocaleString()} kcal
                </span>
              ) : (
                <span className="text-xs font-bold text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
                  Target: {targetCalories.toLocaleString()} kcal
                </span>
              )}
            </div>
          </div>

          {/* Visual Stacked & Comparative Bars */}
          <div className="flex flex-col gap-3.5 bg-stone-50/80 p-4 rounded-2xl border border-stone-100">
            {/* Consumed Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-stone-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                  Consumed (Intake)
                </span>
                <span className="text-stone-900">
                  {todayCaloriesConsumed !== null ? (
                    <>
                      {todayCaloriesConsumed.toLocaleString()} <span className="text-stone-400 font-normal">/ {targetCalories.toLocaleString()} kcal</span>
                      <span className="ml-1.5 text-xs font-extrabold text-orange-600">
                        ({Math.round((todayCaloriesConsumed / targetCalories) * 100)}%)
                      </span>
                    </>
                  ) : (
                    <span className="text-stone-400 font-bold">-</span>
                  )}
                </span>
              </div>
              <div className="relative h-3 w-full bg-stone-200/80 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-linear-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-700" 
                  style={{ width: `${todayCaloriesConsumed !== null ? Math.min((todayCaloriesConsumed / targetCalories) * 100, 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Burned Bar */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-stone-700 flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-500 inline-block" />
                  Burned (Active Workout)
                </span>
                <span className="text-stone-900">
                  {todayCaloriesBurned !== null ? (
                    <>
                      {todayCaloriesBurned.toLocaleString()} <span className="text-stone-400 font-normal">kcal burned</span>
                    </>
                  ) : (
                    <span className="text-stone-400 font-bold">-</span>
                  )}
                </span>
              </div>
              <div className="relative h-3 w-full bg-stone-200/80 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-linear-to-r from-teal-400 to-emerald-500 rounded-full transition-all duration-700" 
                  style={{ width: `${todayCaloriesBurned !== null ? Math.min((todayCaloriesBurned / (targetCalories * 0.4)) * 100, 100) : 0}%` }} 
                />
              </div>
            </div>

            {/* Stacked Proportional Bar (Consumed vs Burned vs Net) */}
            <div className="pt-2 border-t border-stone-200/70">
              <div className="flex justify-between items-center text-[11px] font-bold text-stone-500 mb-1.5">
                <span>Visual Comparison (Intake vs. Burn)</span>
                <span>
                  {todayCaloriesConsumed !== null ? `${todayCaloriesConsumed} in` : '- in'} • {todayCaloriesBurned !== null ? `${todayCaloriesBurned} out` : '- out'}
                </span>
              </div>
              <div className="h-3.5 w-full bg-stone-200 rounded-full flex overflow-hidden p-0.5 gap-0.5 shadow-2xs">
                {(todayCaloriesConsumed || todayCaloriesBurned) ? (
                  <>
                    <div 
                      className="h-full bg-orange-500 rounded-l-full transition-all duration-500" 
                      style={{ width: `${Math.max(10, Math.min(85, ((todayCaloriesConsumed || 0) / ((todayCaloriesConsumed || 0) + (todayCaloriesBurned || 0) || 1)) * 100))}%` }}
                      title={`Consumed: ${todayCaloriesConsumed || 0} kcal`}
                    />
                    <div 
                      className="h-full bg-teal-500 rounded-r-full transition-all duration-500" 
                      style={{ width: `${Math.max(10, Math.min(85, ((todayCaloriesBurned || 0) / ((todayCaloriesConsumed || 0) + (todayCaloriesBurned || 0) || 1)) * 100))}%` }}
                      title={`Burned: ${todayCaloriesBurned || 0} kcal`}
                    />
                  </>
                ) : (
                  <div className="h-full w-full bg-stone-100 rounded-full" />
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-orange-50/70 border border-orange-200/70 rounded-xl p-2.5 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700">Intake</span>
              <span className="text-base font-extrabold text-stone-900 mt-0.5">
                {todayCaloriesConsumed !== null ? todayCaloriesConsumed.toLocaleString() : "-"}
              </span>
              <span className="text-[10px] text-orange-600 font-semibold">
                {todayCaloriesConsumed !== null ? "kcal consumed" : "no data"}
              </span>
            </div>
            <div className="bg-teal-50/70 border border-teal-200/70 rounded-xl p-2.5 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Burned</span>
              <span className="text-base font-extrabold text-stone-900 mt-0.5">
                {todayCaloriesBurned !== null ? todayCaloriesBurned.toLocaleString() : "-"}
              </span>
              <span className="text-[10px] text-teal-600 font-semibold">
                {todayCaloriesBurned !== null ? "kcal active" : "no data"}
              </span>
            </div>
            <div className="bg-stone-50 border border-stone-200/80 rounded-xl p-2.5 flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Net Calories</span>
              {todayCaloriesConsumed !== null || todayCaloriesBurned !== null ? (
                <>
                  <span className={`text-base font-extrabold mt-0.5 ${((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)) > targetCalories ? 'text-rose-600' : 'text-stone-900'}`}>
                    {((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)) > 0 
                      ? `+${((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)).toLocaleString()}` 
                      : ((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold">
                    {((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)) > targetCalories ? 'Over target' : 'Within target'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-base font-extrabold mt-0.5 text-stone-400">-</span>
                  <span className="text-[10px] text-stone-400 font-semibold">no data</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 4: Sleep Recovery Info */}
        <VitalCard 
          className="w-full border-stone-200/90 hover:border-canopy-200 transition-colors" 
          icon={<Moon size={24} className="text-canopy-600" />} 
          title="Sleep Recovery" 
          value={todaySleep !== null ? String(todaySleep.hours) : "-"} 
          unit={todaySleep !== null ? "hrs" : undefined} 
          subtitle={
            todaySleep 
              ? (todaySleep.efficiency ? `Restful sleep • ${todaySleep.efficiency}% recovery score` : 'Restful sleep')
              : 'No sleep data logged'
          } 
        />
      </section>

      {/* Unified Activity Timeline Section */}
      <section className="mt-2 flex flex-col gap-4">
        <div className="flex justify-between items-center px-1">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">Activity</h2>
            <p className="text-sm text-stone-500 font-medium">Workouts, meals, meds & recorded health notes</p>
          </div>
          <div className="flex items-center gap-2">
            {isLoadingLogs && (
              <span className="flex items-center gap-1.5 text-xs text-stone-400 font-medium">
                <Loader2 size={13} className="animate-spin text-tree-600" />
                Syncing...
              </span>
            )}
            <span className="text-xs font-bold uppercase tracking-wider bg-stone-100 text-stone-600 px-3 py-1.5 rounded-full">
              {activeMonthDisplay || 'Today'}
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          <FilterChip 
            label={`All (${combinedActivities.length})`} 
            active={selectedFilter === 'all'} 
            onClick={() => setSelectedFilter('all')} 
          />
          <FilterChip 
            label="Workouts" 
            active={selectedFilter === 'workout'} 
            onClick={() => setSelectedFilter('workout')} 
          />
          <FilterChip 
            label="Meals" 
            active={selectedFilter === 'meal'} 
            onClick={() => setSelectedFilter('meal')} 
          />
          <FilterChip 
            label="Medications" 
            active={selectedFilter === 'medication'} 
            onClick={() => setSelectedFilter('medication')} 
          />
          <FilterChip 
            label="Health Events" 
            active={selectedFilter === 'event'} 
            onClick={() => setSelectedFilter('event')} 
          />
          <FilterChip 
            label="Notes" 
            active={selectedFilter === 'general'} 
            onClick={() => setSelectedFilter('general')} 
          />
        </div>

        {/* Activity Items List Grouped by Collapsible Date & Time Buckets */}
        {dateGroups.length === 0 ? (
          <div className="bg-white rounded-[2rem] border border-stone-200 shadow-sm p-8 text-center flex flex-col items-center justify-center gap-2 text-stone-400">
            <p className="text-sm font-semibold text-stone-600">No activities found</p>
            <p className="text-xs">No entries match the selected filter.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {dateGroups.map((dateGroup) => {
              const isCollapsed = !!collapsedDates[dateGroup.dateKey];
              return (
                <div 
                  key={dateGroup.dateKey} 
                  className="bg-white rounded-[2rem] border border-stone-200 shadow-xs overflow-hidden transition-all"
                >
                  {/* Date Collapsible Separator */}
                  <button
                    type="button"
                    onClick={() => toggleDateCollapse(dateGroup.dateKey)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-stone-50/90 hover:bg-stone-100/90 transition-colors border-b border-stone-200/80 text-left"
                    aria-expanded={!isCollapsed}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-tree-100 text-tree-800 flex items-center justify-center shadow-xs">
                        <Calendar size={17} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-base text-stone-900">
                          {dateGroup.dateLabel}
                        </span>
                        <span className="text-xs font-bold text-stone-600 bg-white border border-stone-200 px-2.5 py-0.5 rounded-full shadow-2xs">
                          {dateGroup.dayName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-stone-500 bg-stone-200/60 px-2.5 py-0.5 rounded-full">
                        {dateGroup.totalCount} {dateGroup.totalCount === 1 ? 'entry' : 'entries'}
                      </span>
                      <div className={`text-stone-400 p-1 rounded-full hover:bg-stone-200/60 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`}>
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </button>

                  {/* Date Contents (Separators for Morning, Afternoon, Evening, Night) */}
                  {!isCollapsed && (
                    <div className="flex flex-col p-3 divide-y divide-stone-100/80">
                      {dateGroup.bucketGroups.map((bg, idx) => (
                        <div key={bg.bucket} className={`flex flex-col ${idx > 0 ? 'pt-4' : 'pt-1.5'} pb-2`}>
                          {/* Time Bucket Separator */}
                          <div className="flex items-center gap-2 px-2 py-1 mb-2">
                            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-stone-100 text-stone-700 text-xs font-extrabold border border-stone-200/70 shadow-2xs">
                              {getBucketIcon(bg.bucket)}
                              <span>{bg.bucket}</span>
                            </div>
                            <div className="h-px flex-1 bg-stone-200/70" />
                            <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                              {bg.activities.length} {bg.activities.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>

                          {/* Activities inside this bucket */}
                          <div className="flex flex-col divide-y divide-stone-100">
                            {bg.activities.map((activity) => (
                              <ActivityRow 
                                key={activity.id} 
                                activity={activity} 
                                onToggle={() => toggleStatus(activity.id, activity.status as any)} 
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function VitalCard({ icon, title, value, unit, subtitle, className = '' }: { icon: React.ReactNode, title: string, value: string, unit?: string, subtitle: string, className?: string }) {
  return (
    <div className={`bg-white rounded-[2rem] p-5 border border-stone-200 shadow-sm flex flex-col gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-stone-500 font-semibold text-lg">
        {icon} {title}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-4xl font-extrabold text-stone-900 tracking-tight">{value}</span>
        {unit && value !== '-' ? <span className="text-lg text-stone-500 font-bold">{unit}</span> : null}
      </div>
      <div className="text-stone-500 text-base font-medium">{subtitle}</div>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
        active 
          ? 'bg-stone-900 text-white shadow-sm' 
          : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
      }`}
    >
      {label}
    </button>
  );
}

function ActivityRow({ activity, onToggle }: { key?: string; activity: ActivityEntry; onToggle: () => void }) {
  const getCategoryConfig = () => {
    switch (activity.category) {
      case 'workout':
        return {
          icon: <Dumbbell size={20} className="text-teal-600" />,
          bgColor: 'bg-teal-50',
          badgeText: 'Workout',
          badgeColor: 'text-teal-700 bg-teal-50/80',
        };
      case 'meal':
        return {
          icon: <Utensils size={20} className="text-amber-600" />,
          bgColor: 'bg-amber-50',
          badgeText: 'Meal',
          badgeColor: 'text-amber-700 bg-amber-50/80',
        };
      case 'medication':
        return {
          icon: <Pill size={20} className="text-rose-600" />,
          bgColor: 'bg-rose-50',
          badgeText: 'Medication',
          badgeColor: 'text-rose-700 bg-rose-50/80',
        };
      case 'event':
        return {
          icon: <HeartPulse size={20} className="text-canopy-600" />,
          bgColor: 'bg-canopy-50',
          badgeText: 'Health Event',
          badgeColor: 'text-canopy-800 bg-canopy-100/80',
        };
      case 'general':
      default:
        return {
          icon: <MessageSquare size={20} className="text-stone-600" />,
          bgColor: 'bg-stone-100',
          badgeText: 'Health Note',
          badgeColor: 'text-stone-700 bg-stone-100',
        };
    }
  };

  const config = getCategoryConfig();
  const isInteractive = activity.status !== undefined;
  const isCompleted = activity.status === 'completed';

  return (
    <div className="flex items-start justify-between p-4 gap-3 rounded-2xl hover:bg-stone-50/70 transition-colors">
      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        {/* Category Icon */}
        <div className={`p-3 rounded-2xl ${config.bgColor} flex-shrink-0 mt-0.5`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1 min-w-0 mt-0.5">
          {/* Headline in bold - top element */}
          <h3 className={`text-base font-bold leading-snug ${isCompleted && !activity.source ? 'text-stone-400 line-through' : 'text-stone-900'}`}>
            {activity.title}
          </h3>

          {/* Badges in the next row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${config.badgeColor}`}>
              {config.badgeText}
            </span>
            {typeof activity.activeMinutes === 'number' && activity.activeMinutes > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80">
                <Timer size={11} className="text-teal-600" /> {activity.activeMinutes} mins
              </span>
            )}
            {typeof activity.caloriesBurned === 'number' && activity.caloriesBurned > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80">
                <Flame size={11} className="text-teal-600" /> {activity.caloriesBurned} kcal
              </span>
            )}
            {typeof activity.calories === 'number' && activity.calories > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-800 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/80">
                <Flame size={11} className="text-orange-600" /> {activity.calories} kcal
              </span>
            )}
            {activity.source === 'voice' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                <Mic size={11} className="text-stone-500" /> Voice Note
              </span>
            )}
            {activity.source === 'manual' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                Manual Log
              </span>
            )}
          </div>

          {/* Memo text / subtext in small font */}
          {activity.subtitle && (
            <p className="text-sm font-medium text-stone-500 leading-relaxed mt-0.5">
              {activity.subtitle}
            </p>
          )}

          {/* Event timestamp at the bottom like audit (12Hours format) */}
          <span className="text-stone-400 text-[11px] font-bold uppercase tracking-wider mt-1">
            {activity.time}
          </span>
        </div>
      </div>

      {/* Action / Status Toggle if applicable */}
      {isInteractive ? (
        <button 
          onClick={onToggle}
          className={`p-2 rounded-full transition-colors flex-shrink-0 mt-1 ${isCompleted ? 'text-teal-600' : 'text-stone-300 hover:text-stone-400'}`}
          aria-label={isCompleted ? 'Mark as pending' : 'Mark as completed'}
        >
          {isCompleted ? <CheckCircle2 size={32} className="fill-teal-50" /> : <Circle size={32} />}
        </button>
      ) : (
        <div className="w-10 flex-shrink-0" />
      )}
    </div>
  );
}

