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
  Timer,
  X,
  RefreshCw,
  Copy,
  Check,
  ChevronRight,
  FileText,
  Quote,
  Scale,
  TrendingUp
} from "lucide-react";
import React, { useState, useEffect, useMemo } from 'react';
import { DriveState, HealthLogEntry, UserProfile, TimeBucket, TrendMetricType } from '../types';
import { readJsonFile, getOrCreateMonthlyLogFile, getMonthlyLogFileName, getUserDisplayName, listMonthlyLogFiles } from '../lib/drive';
import TrendModal from './TrendModal';
import { parseProfileWeight, extractWeightFromLog } from '../lib/trendGenerator';
import { useWakeLock } from '../lib/wakeLock';
import { useModalBackHandler } from '../lib/backNavigation';

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
  source?: 'voice' | 'manual' | 'synced';
  rawTranscript?: string;
  timestamp?: number;
  timeBucket: TimeBucket;
  dateKey: string;
  dateLabel: string;
  dayName: string;
  calories?: number;
  caloriesBurned?: number;
  activeMinutes?: number;
  steps?: number;
  heartRate?: number;
  restingHeartRate?: number;
  sleepHours?: number;
  sleepEfficiency?: number;
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
  const [allHistoricalLogs, setAllHistoricalLogs] = useState<HealthLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Keep screen awake while loading and synthesizing monthly health logs and metrics
  useWakeLock(isLoadingLogs, 'loading_dashboard_context');
  const [todayCaloriesConsumed, setTodayCaloriesConsumed] = useState<number | null>(null);
  const [todayCaloriesBurned, setTodayCaloriesBurned] = useState<number | null>(null);
  const [todayActiveMinutes, setTodayActiveMinutes] = useState<number | null>(null);
  const [todaySteps, setTodaySteps] = useState<number | null>(null);
  const [todayHeartRate, setTodayHeartRate] = useState<number | null>(null);
  const [todaySleep, setTodaySleep] = useState<{ hours: number; efficiency?: number } | null>(null);
  const [todayWeight, setTodayWeight] = useState<number | null>(null);
  const [selectedTrendMetric, setSelectedTrendMetric] = useState<TrendMetricType | null>(null);
  const [activeFileName, setActiveFileName] = useState<string>('logs.json');
  const [activeMonthDisplay, setActiveMonthDisplay] = useState<string>('Today & Past 30 Days');
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
  const [selectedActivity, setSelectedActivity] = useState<ActivityEntry | null>(null);
  const [visibleDaysCount, setVisibleDaysCount] = useState<number>(3);

  // Close trend modal or activity detail modal on Android back button/swipe
  useModalBackHandler(selectedTrendMetric !== null, () => setSelectedTrendMetric(null));
  useModalBackHandler(selectedActivity !== null, () => setSelectedActivity(null));

  // Keep scroll focused on Today at top upon initial load
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

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
        setTodayWeight(null);
        setAllHistoricalLogs([]);
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

        // 2. Load health logs for Today and past 30 days (current month + previous month)
        const { fileId, fileName } = await getOrCreateMonthlyLogFile(driveState.token, driveState.mainFolderId);
        setActiveFileName(fileName);
        setActiveMonthDisplay('Today & Past 30 Days');

        const logMap = new Map<string, HealthLogEntry>();
        const currentData = await readJsonFile(driveState.token, fileId);
        if (currentData && Array.isArray(currentData.logs)) {
          currentData.logs.forEach((l: HealthLogEntry) => logMap.set(l.id, l));
        }

        // Also load previous month's logs to ensure 30 full days of history
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthNum = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
        const prevMonthFileName = `logs_${prevMonthDate.getFullYear()}_${prevMonthNum}.json`;
        
        const monthlyFiles = await listMonthlyLogFiles(driveState.token, driveState.mainFolderId);
        const prevFile = monthlyFiles.find(f => f.name === prevMonthFileName);
        if (prevFile) {
          const prevData = await readJsonFile(driveState.token, prevFile.id);
          if (prevData && Array.isArray(prevData.logs)) {
            prevData.logs.forEach((l: HealthLogEntry) => {
              if (!logMap.has(l.id)) logMap.set(l.id, l);
            });
          }
        }

        // Also load other monthly files in Drive in parallel for complete 3M/6M/12M trend history
        const otherMonthlyFiles = monthlyFiles.filter(f => f.id !== fileId && f.id !== prevFile?.id);
        if (otherMonthlyFiles.length > 0) {
          const otherData = await Promise.all(
            otherMonthlyFiles.map(f => readJsonFile(driveState.token, f.id).catch(() => null))
          );
          otherData.forEach(d => {
            if (d && Array.isArray(d.logs)) {
              d.logs.forEach((l: HealthLogEntry) => {
                if (!logMap.has(l.id)) logMap.set(l.id, l);
              });
            }
          });
        }

        const allLogs = Array.from(logMap.values());
        setAllHistoricalLogs(allLogs);

        // Filter: Keep only today and past 30 days for primary timeline view; EXCLUDE any future logs (> end of today)
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        let logs = allLogs.filter(l => {
          const t = new Date(l.timestamp).getTime();
          return !isNaN(t) && t <= endOfToday.getTime() && t >= thirtyDaysAgo.getTime();
        });

        // Fallback: If no logs in past 30 days, check other archive files so user still sees past data if needed
        if (logs.length === 0 && monthlyFiles.length > 0) {
          for (const mFile of monthlyFiles) {
            if (mFile.id !== fileId && mFile.id !== prevFile?.id) {
              const archiveData = await readJsonFile(driveState.token, mFile.id);
              if (archiveData && Array.isArray(archiveData.logs) && archiveData.logs.length > 0) {
                logs = archiveData.logs.filter(l => {
                  const t = new Date(l.timestamp).getTime();
                  return !isNaN(t) && t <= endOfToday.getTime();
                });
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
        let healthConnectActiveMins: number | null = null;
        let workoutActiveMins: number | null = null;
        let steps: number | null = null;
        let heartRate: number | null = null;
        let sleep: { hours: number; efficiency?: number } | null = null;
        let weight: number | null = null;

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

              // Active minutes: separate Health Connect whole-day activity from individual gym workouts
              const isHealthConnectActivity = log.id?.startsWith('import-activity-') || 
                log.headline === 'Daily Step Activity' || 
                log.transcript?.includes('Daily Activity:');

              let logActiveMins = 0;
              if (typeof log.activeMinutes === 'number' && log.activeMinutes > 0) {
                logActiveMins = log.activeMinutes;
              } else {
                const minMatch = log.transcript?.match(/(\d+)\s*(?:mins|minutes)/i);
                if (minMatch) {
                  logActiveMins = parseInt(minMatch[1], 10);
                }
              }

              if (isHealthConnectActivity) {
                // Health Connect already tracks full day's active duration including gym time
                healthConnectActiveMins = Math.max(healthConnectActiveMins || 0, logActiveMins);
              } else if (logActiveMins > 0) {
                workoutActiveMins = (workoutActiveMins || 0) + logActiveMins;
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

            // Weight
            const w = extractWeightFromLog(log);
            if (w !== null) {
              weight = w;
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

        // If no weight logged today, search latest weight in all historical logs
        if (weight === null) {
          const sorted = allLogs.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          for (const l of sorted) {
            const w = extractWeightFromLog(l);
            if (w !== null) {
              weight = w;
              break;
            }
          }
        }

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

        // Only include Health Connect activity time if available (which already includes gym workouts);
        // fallback to standalone workout active minutes only if Health Connect has not synced today.
        const effectiveActiveMins = healthConnectActiveMins !== null ? healthConnectActiveMins : workoutActiveMins;

        setTodayCaloriesConsumed(consumed);
        setTodayCaloriesBurned(burned);
        setTodayActiveMinutes(effectiveActiveMins);
        setTodaySteps(steps);
        setTodayHeartRate(heartRate);
        setTodaySleep(sleep);
        setTodayWeight(weight);
      } catch (err) {
        console.warn('Could not load dashboard data from Drive:', err);
        setRoutineActivities([]);
        setTodayCaloriesConsumed(null);
        setTodayCaloriesBurned(null);
        setTodayActiveMinutes(null);
        setTodaySteps(null);
        setTodayHeartRate(null);
        setTodaySleep(null);
        setTodayWeight(null);
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
        activeMinutes: l.activeMinutes,
        steps: l.steps,
        heartRate: l.heartRate,
        restingHeartRate: l.restingHeartRate,
        sleepHours: l.sleepHours,
        sleepEfficiency: l.sleepEfficiency
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

  const toggleDateCollapse = (dateKey: string, defaultCollapsed: boolean = false) => {
    setCollapsedDates((prev) => {
      const current = prev[dateKey] !== undefined ? prev[dateKey] : defaultCollapsed;
      return {
        ...prev,
        [dateKey]: !current,
      };
    });
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
  const profileWeight = parseProfileWeight(userProfile?.weight);
  const targetWeight = parseProfileWeight(userProfile?.userTargets?.weight);
  const displayWeight = todayWeight !== null ? todayWeight : profileWeight;

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

      {/* Vitals Summary - Restructured Layout with Trends & Weight Card */}
      <section className="flex flex-col gap-4">
        {/* Row 1: Left - Steps, Right - Active Time */}
        <div className="grid grid-cols-2 gap-4">
          <VitalCard 
            icon={<Footprints size={24} className="text-tree-600" />} 
            title="Daily Steps" 
            value={todaySteps !== null ? todaySteps.toLocaleString() : "-"} 
            subtitle={`Goal: ${targetSteps.toLocaleString()}`} 
            onClick={() => setSelectedTrendMetric('steps')}
          />
          <VitalCard 
            icon={<Activity size={24} className="text-blue-500" />} 
            title="Active Time" 
            value={todayActiveMinutes !== null ? todayActiveMinutes.toString() : "-"} 
            unit={todayActiveMinutes !== null ? "m" : undefined} 
            subtitle={`Goal: ${targetActiveTime}m`} 
            onClick={() => setSelectedTrendMetric('active_time')}
          />
        </div>

        {/* Row 2: Left - Resting Heart Rate, Right - Body Weight */}
        <div className="grid grid-cols-2 gap-4">
          <VitalCard 
            icon={<Heart size={24} className="text-rose-500" />} 
            title="Heart Rate" 
            value={todayHeartRate !== null ? String(todayHeartRate) : "-"} 
            unit={todayHeartRate !== null ? "bpm" : undefined} 
            subtitle={`Target: ${targetHR} bpm`} 
            onClick={() => setSelectedTrendMetric('heart_rate')}
          />
          <VitalCard 
            icon={<Scale size={24} className="text-teal-600" />} 
            title="Weight" 
            value={displayWeight !== null ? (Math.round(displayWeight * 10) / 10).toFixed(1) : "-"} 
            unit={displayWeight !== null ? "kg" : undefined} 
            subtitle={targetWeight ? `Goal: ${targetWeight} kg` : (profileWeight ? `Baseline: ${profileWeight} kg` : "Track weight")} 
            onClick={() => setSelectedTrendMetric('weight')}
          />
        </div>

        {/* Row 3: Simplified Calories Balance Card */}
        <div 
          onClick={() => setSelectedTrendMetric('calories')}
          className="bg-white rounded-[2rem] p-5 border border-stone-200 shadow-sm hover:border-stone-300 hover:shadow-md transition-all cursor-pointer flex flex-col gap-3.5 group active:scale-[0.99]"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-stone-500 font-semibold text-lg">
              <Flame size={24} className="text-orange-500" />
              <span>Calories</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
                Target: {targetCalories.toLocaleString()} kcal
              </span>
              <ChevronRight size={18} className="text-stone-300 group-hover:text-stone-600 transition-colors" />
            </div>
          </div>

          {/* Clean 3-Metric Summary: Burned, Intake, Net */}
          <div className="grid grid-cols-3 gap-3 my-0.5">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Burned</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold text-teal-600">
                  {todayCaloriesBurned !== null ? todayCaloriesBurned.toLocaleString() : "-"}
                </span>
                {todayCaloriesBurned !== null && <span className="text-xs font-bold text-stone-400">kcal</span>}
              </div>
              <span className="text-[11px] text-stone-400 font-medium">Workouts</span>
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Intake</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold text-orange-600">
                  {todayCaloriesConsumed !== null ? todayCaloriesConsumed.toLocaleString() : "-"}
                </span>
                {todayCaloriesConsumed !== null && <span className="text-xs font-bold text-stone-400">kcal</span>}
              </div>
              <span className="text-[11px] text-stone-400 font-medium">{todayCaloriesConsumed !== null ? "Meals logged" : "No intake"}</span>
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Net</span>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-2xl sm:text-3xl font-extrabold text-stone-900">
                  {todayCaloriesConsumed !== null || todayCaloriesBurned !== null ? (
                    ((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)) > 0 
                      ? `+${((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)).toLocaleString()}` 
                      : ((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)).toLocaleString()
                  ) : "-"}
                </span>
                {(todayCaloriesConsumed !== null || todayCaloriesBurned !== null) && <span className="text-xs font-bold text-stone-400">kcal</span>}
              </div>
              <span className="text-[11px] text-stone-400 font-medium">
                {((todayCaloriesConsumed || 0) - (todayCaloriesBurned || 0)) > targetCalories ? 'Over target' : 'Within target'}
              </span>
            </div>
          </div>

          {/* Clean Progress Bar against Daily Target */}
          <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden flex">
            <div 
              className="h-full bg-teal-500 rounded-full transition-all duration-500" 
              style={{ width: `${Math.min(100, Math.round(((todayCaloriesBurned || 0) / targetCalories) * 100))}%` }}
              title={`Burned: ${todayCaloriesBurned || 0} kcal`}
            />
          </div>

          {/* Subtitle / Footer with Trend link */}
          <div className="flex items-center justify-between text-xs text-stone-500 font-medium pt-0.5">
            <span>
              {todayCaloriesBurned ? `${todayCaloriesBurned.toLocaleString()} kcal active burn today` : 'No workout burn recorded today'}
            </span>
            <span className="text-tree-700 font-bold group-hover:underline flex items-center gap-0.5 text-xs">
              View Trends <ChevronRight size={14} />
            </span>
          </div>
        </div>

        {/* Row 4: Left - Daily Tasks, Right - Sleep Recovery */}
        <div className="grid grid-cols-2 gap-4">
          <VitalCard 
            icon={<Target size={24} className="text-purple-500" />} 
            title="Daily Tasks" 
            value={hasTasks ? taskCompletionPercentage : "-"} 
            unit={hasTasks ? "%" : undefined} 
            subtitle={taskCompletionText} 
            onClick={() => setSelectedTrendMetric('tasks')}
          />
          <VitalCard 
            icon={<Moon size={24} className="text-canopy-600" />} 
            title="Sleep" 
            value={todaySleep !== null ? String(todaySleep.hours) : "-"} 
            unit={todaySleep !== null ? "hrs" : undefined} 
            subtitle={
              todaySleep 
                ? (todaySleep.efficiency ? `${todaySleep.efficiency}% efficiency` : 'Restful sleep')
                : 'Aim for 7-8 hrs'
            } 
            onClick={() => setSelectedTrendMetric('sleep')}
          />
        </div>
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
            {dateGroups.slice(0, visibleDaysCount).map((dateGroup, dateIdx) => {
              // Keep Today and prev 2 days (indices 0, 1, 2) expanded by default;
              // everything else is collapsed unless explicitly toggled by user.
              const defaultCollapsed = dateIdx >= 3;
              const isCollapsed = collapsedDates[dateGroup.dateKey] !== undefined 
                ? !!collapsedDates[dateGroup.dateKey] 
                : defaultCollapsed;
              return (
                <div 
                  key={dateGroup.dateKey} 
                  className="bg-white rounded-[2rem] border border-stone-200 shadow-xs overflow-hidden transition-all"
                >
                  {/* Date Collapsible Separator */}
                  <button
                    type="button"
                    onClick={() => toggleDateCollapse(dateGroup.dateKey, defaultCollapsed)}
                    className="w-full flex items-center justify-between px-5 py-4 bg-stone-50/90 hover:bg-stone-100/90 transition-colors border-b border-stone-200/80 text-left cursor-pointer"
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
                                onSelect={(act) => setSelectedActivity(act)}
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

            {/* Show More Pagination Button (Shows 10 more at a time up to 30) */}
            {visibleDaysCount < dateGroups.length && (
              <div className="flex flex-col items-center justify-center pt-2 pb-6">
                <button
                  type="button"
                  onClick={() => setVisibleDaysCount(prev => Math.min(30, prev + 10))}
                  className="w-full py-3.5 px-4 bg-white hover:bg-stone-50 active:bg-stone-100 border border-stone-200 text-stone-700 font-bold text-xs rounded-2xl shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <ChevronDown size={16} className="text-stone-500" />
                  <span>Show earlier activity (+{Math.min(10, dateGroups.length - visibleDaysCount)} more days)</span>
                </button>
                <span className="text-[11px] text-stone-400 font-medium mt-1.5">
                  Showing {Math.min(visibleDaysCount, dateGroups.length)} of {dateGroups.length} days
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Full Activity Details Modal */}
      <ActivityDetailModal 
        activity={selectedActivity} 
        onClose={() => setSelectedActivity(null)} 
      />

      {/* Metric Trends Modal */}
      {selectedTrendMetric && (
        <TrendModal
          metric={selectedTrendMetric}
          logs={allHistoricalLogs.length > 0 ? allHistoricalLogs : healthLogs}
          userProfile={userProfile}
          onClose={() => setSelectedTrendMetric(null)}
        />
      )}
    </div>
  );
}

/**
 * Enhanced, beautiful preformatted renderer for imported and manual health/workout transcripts
 */
function FormattedActivityDetails({ text, category }: { text: string; category: string }) {
  if (!text || !text.trim()) {
    return <p className="text-stone-400 italic text-xs">No details recorded.</p>;
  }

  // Check if text has bullet formatting or special headers
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const hasBullets = lines.some(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*'));
  const isWorkoutFormat = text.includes('🏋️') || text.includes('Workout:') || text.includes('Exercises:');
  const isVitalsFormat = text.includes('🩺') || text.includes('Biometric Vitals') || text.includes('Resting Heart Rate:');
  const isSleepFormat = text.includes('😴') || text.includes('Sleep Summary:');
  const isActivityFormat = text.includes('🚶') || text.includes('Daily Activity:');

  // If none of these, render standard clean text block
  if (!hasBullets && !isWorkoutFormat && !isVitalsFormat && !isSleepFormat && !isActivityFormat) {
    return (
      <div className="text-stone-850 text-sm font-medium leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    );
  }

  // Parsed sections
  let headerText = '';
  const statChips: { label: string; value: string }[] = [];
  const exerciseList: { name: string; muscle?: string; equipment?: string; setsDetails?: string }[] = [];
  let notesText = '';
  const bulletItems: { label?: string; value: string }[] = [];

  lines.forEach(line => {
    // 1. Header line (e.g. "🏋️ Workout: Core", "🩺 Biometric Vitals Sync:")
    if (line.startsWith('🏋️') || line.startsWith('🩺') || line.startsWith('😴') || line.startsWith('🚶')) {
      headerText = line;
      return;
    }

    const cleanLine = line.replace(/^[•\-\*]\s*/, '').trim();

    // 2. Workout Exercises line
    if (cleanLine.startsWith('Exercises:')) {
      const exContent = cleanLine.replace(/^Exercises:\s*/, '').trim();

      // Depth-aware tokenizer: split entries on commas that are outside parentheses and brackets
      const rawParts: string[] = [];
      let current = '';
      let parenDepth = 0;
      let bracketDepth = 0;

      for (let i = 0; i < exContent.length; i++) {
        const char = exContent[i];
        if (char === '(') parenDepth++;
        else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
        else if (char === '[') bracketDepth++;
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

        if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
          if (current.trim()) rawParts.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      if (current.trim()) rawParts.push(current.trim());

      rawParts.forEach(part => {
        let itemStr = part.trim();
        if (!itemStr) return;

        let setsDetails: string | undefined;
        let meta: string | undefined;

        // 1. Extract sets in parentheses at end: e.g. "(2 sets @ 80kg, 12 reps)" or "(1 sets)"
        const setsMatch = itemStr.match(/\s*\(([^)]+)\)$/);
        if (setsMatch) {
          setsDetails = setsMatch[1].trim();
          itemStr = itemStr.slice(0, setsMatch.index).trim();
        }

        // 2. Extract metadata in brackets at end: e.g. "[Glutes / Barbell]" or "[Cardio / Machine]"
        const metaMatch = itemStr.match(/\s*\[([^\]]+)\]$/);
        if (metaMatch) {
          meta = metaMatch[1].trim();
          itemStr = itemStr.slice(0, metaMatch.index).trim();
        }

        let muscle: string | undefined;
        let equipment: string | undefined;
        if (meta) {
          const parts = meta.split('/').map(p => p.trim());
          muscle = parts[0] && parts[0] !== 'None' ? parts[0] : undefined;
          equipment = parts[1] && parts[1] !== 'None' ? parts[1] : undefined;
        }

        const name = itemStr.trim();
        if (name) {
          exerciseList.push({ name, muscle, equipment, setsDetails });
        }
      });
      return;
    }

    // 3. Notes line
    if (cleanLine.startsWith('Notes:')) {
      notesText = cleanLine.replace(/^Notes:\s*["']?/, '').replace(/["']?$/, '').trim();
      return;
    }

    // 4. Combined stat lines like: "Duration: 54 mins | Total Volume: 1,638 kg | Sets: 11"
    if (cleanLine.includes('|')) {
      const parts = cleanLine.split('|').map(p => p.trim());
      parts.forEach(part => {
        const kv = part.split(/:\s*/);
        if (kv.length === 2) {
          statChips.push({ label: kv[0].trim(), value: kv[1].trim() });
        } else {
          statChips.push({ label: '', value: part });
        }
      });
      return;
    }

    // 5. Single key-value lines like: "Calories Burned: 449 kcal", "Resting Heart Rate: 79 bpm (Range: ...)"
    const kvMatch = cleanLine.match(/^([^:]+):\s*(.+)$/);
    if (kvMatch) {
      bulletItems.push({ label: kvMatch[1].trim(), value: kvMatch[2].trim() });
    } else {
      bulletItems.push({ value: cleanLine });
    }
  });

  return (
    <div className="flex flex-col gap-3.5">
      {/* Header if present */}
      {headerText && (
        <div className="text-xs font-extrabold text-stone-700 pb-1.5 border-b border-stone-200/60 flex items-center gap-1.5">
          <span>{headerText}</span>
        </div>
      )}

      {/* Top Stat Pills / Chips */}
      {statChips.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {statChips.map((chip, idx) => (
            <div key={idx} className="bg-white border border-stone-200/90 p-2.5 rounded-xl flex flex-col shadow-2xs">
              {chip.label && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                  {chip.label}
                </span>
              )}
              <span className="text-xs font-black text-stone-900 mt-0.5">
                {chip.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Structured Key-Value items (e.g. Vitals measurements, Calories, Sleep scores) */}
      {bulletItems.length > 0 && (
        <div className="flex flex-col gap-2">
          {bulletItems.map((item, idx) => (
            <div key={idx} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white border border-stone-200/90 shadow-2xs">
              {item.label ? (
                <>
                  <span className="text-xs font-bold text-stone-600 shrink-0">{item.label}</span>
                  <span className="text-xs font-extrabold text-stone-900 text-right">{item.value}</span>
                </>
              ) : (
                <span className="text-xs font-medium text-stone-800">{item.value}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Structured Exercises Section for Workouts */}
      {exerciseList.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <Dumbbell size={13} className="text-teal-600" /> Exercises Breakdown ({exerciseList.length})
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {exerciseList.map((ex, idx) => {
              // Enhance setsDetails for cardio exercises (e.g. Treadmill, Cardio, Running)
              // If setsDetails is just "1 sets" and notesText has details like "Incline L 10" or duration
              let displayDetails = ex.setsDetails;
              const isCardioOrTimed = ex.muscle === 'Cardio' || 
                /treadmill|cardio|running|cycling|stretching|rowing|elliptical/i.test(ex.name);

              if (isCardioOrTimed && (displayDetails === '1 sets' || displayDetails === '1 set')) {
                if (notesText && !notesText.toLowerCase().includes('great energy')) {
                  displayDetails = `1 set • ${notesText}`;
                }
              }

              return (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-white border border-stone-200/90 shadow-2xs gap-2">
                  <div className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="font-bold text-stone-900 text-xs sm:text-sm">{ex.name}</span>
                    {ex.muscle && (
                      <span className="text-[10px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/70">
                        {ex.muscle}
                      </span>
                    )}
                    {ex.equipment && (
                      <span className="text-[10px] font-medium text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded-md">
                        {ex.equipment}
                      </span>
                    )}
                  </div>
                  {displayDetails && (
                    <div className="text-xs font-semibold text-stone-600 self-start sm:self-auto shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-stone-100 font-mono text-[11px] text-stone-700 font-bold border border-stone-200/60">
                        {displayDetails}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes Callout Box */}
      {notesText && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-amber-950 mt-1 shadow-2xs">
          <Quote size={16} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-bold text-amber-800 uppercase tracking-wider text-[10px]">Session Notes</span>
            <p className="font-medium text-amber-950 leading-relaxed italic">{notesText}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityDetailModal({ 
  activity, 
  onClose 
}: { 
  activity: ActivityEntry | null; 
  onClose: () => void; 
}) {
  const [copied, setCopied] = useState(false);
  if (!activity) return null;

  const isSynced = activity.source === 'synced' || (activity.source === 'manual' && activity.id.startsWith('import-'));

  const handleCopy = () => {
    const textToCopy = `Activity: ${activity.title} (${activity.dateLabel} • ${activity.time})\nCategory: ${activity.category}\nSource: ${isSynced ? 'Synced' : (activity.source || 'Manual')}\n\nTranscript & Notes:\n${activity.rawTranscript || activity.subtitle}\n\nLog ID: ${activity.id}`;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 pb-4 border-b border-stone-100 flex items-start justify-between gap-3 bg-stone-50/70">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-3 rounded-2xl ${
              activity.category === 'workout' ? 'bg-teal-100 text-teal-700' : 
              activity.category === 'meal' ? 'bg-amber-100 text-amber-700' : 
              activity.category === 'medication' ? 'bg-rose-100 text-rose-700' : 
              activity.category === 'event' ? 'bg-canopy-100 text-canopy-800' : 
              'bg-stone-200 text-stone-700'
            } flex-shrink-0 shadow-2xs mt-0.5`}>
              {activity.category === 'workout' && <Dumbbell size={22} />}
              {activity.category === 'meal' && <Utensils size={22} />}
              {activity.category === 'medication' && <Pill size={22} />}
              {activity.category === 'event' && <HeartPulse size={22} />}
              {activity.category === 'general' && <MessageSquare size={22} />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">
                  {activity.category}
                </span>
                {isSynced && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80">
                    <RefreshCw size={10} className="text-teal-600" /> Synced
                  </span>
                )}
                {activity.source === 'voice' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                    <Mic size={11} className="text-stone-500" /> Voice Note
                  </span>
                )}
                {activity.source === 'manual' && !isSynced && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                    Manual Log
                  </span>
                )}
              </div>
              <h2 className="text-xl font-extrabold text-stone-900 mt-1 leading-snug break-words">
                {activity.title}
              </h2>
              <p className="text-xs font-semibold text-stone-500 mt-0.5">
                {activity.dateLabel} • {activity.time} ({activity.dayName})
              </p>
            </div>
          </div>

          <button 
            type="button" 
            onClick={onClose} 
            className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-full transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-5 overflow-y-auto flex flex-col gap-4">
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {activity.activeMinutes !== undefined && activity.activeMinutes > 0 && (
              <div className="bg-stone-50 border border-stone-200/70 p-3 rounded-2xl flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Duration</span>
                <span className="text-lg font-extrabold text-stone-900 mt-0.5 flex items-baseline gap-1">
                  {activity.activeMinutes} <span className="text-xs font-semibold text-stone-400">mins</span>
                </span>
              </div>
            )}
            {(activity.caloriesBurned !== undefined || activity.calories !== undefined) && (
              <div className="bg-stone-50 border border-stone-200/70 p-3 rounded-2xl flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Calories</span>
                <span className="text-lg font-extrabold text-stone-900 mt-0.5 flex items-baseline gap-1">
                  {activity.caloriesBurned || activity.calories} <span className="text-xs font-semibold text-stone-400">kcal</span>
                </span>
              </div>
            )}
            {activity.steps !== undefined && activity.steps > 0 && (
              <div className="bg-stone-50 border border-stone-200/70 p-3 rounded-2xl flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Steps</span>
                <span className="text-lg font-extrabold text-stone-900 mt-0.5">
                  {activity.steps.toLocaleString()}
                </span>
              </div>
            )}
            {activity.restingHeartRate !== undefined && (
              <div className="bg-stone-50 border border-stone-200/70 p-3 rounded-2xl flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Resting HR</span>
                <span className="text-lg font-extrabold text-rose-600 mt-0.5 flex items-baseline gap-1">
                  {activity.restingHeartRate} <span className="text-xs font-semibold text-stone-400">bpm</span>
                </span>
              </div>
            )}
            {activity.sleepHours !== undefined && (
              <div className="bg-stone-50 border border-stone-200/70 p-3 rounded-2xl flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Sleep</span>
                <span className="text-lg font-extrabold text-teal-700 mt-0.5 flex items-baseline gap-1">
                  {activity.sleepHours} <span className="text-xs font-semibold text-stone-400">hrs</span>
                </span>
              </div>
            )}
          </div>

          {/* Full Record Details / Transcript */}
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
              <FileText size={14} /> Full Record Details
            </h3>
            <div className="bg-stone-50/90 border border-stone-200/80 rounded-2xl p-4">
              <FormattedActivityDetails 
                text={activity.rawTranscript || activity.subtitle || ''} 
                category={activity.category}
              />
            </div>
          </div>

          {/* Technical Metadata */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between text-xs text-stone-400">
              <span className="font-mono truncate max-w-[280px]" title={activity.id}>
                ID: {activity.id}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 hover:bg-stone-200/80 text-stone-700 font-bold rounded-lg transition-colors text-[11px]"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy Log'}
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-stone-900 text-white font-bold text-sm hover:bg-stone-800 transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function VitalCard({ 
  icon, 
  title, 
  value, 
  unit, 
  subtitle, 
  className = '',
  onClick
}: { 
  icon: React.ReactNode; 
  title: string; 
  value: string; 
  unit?: string; 
  subtitle: string; 
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-[2rem] p-5 border border-stone-200 shadow-sm flex flex-col gap-3 transition-all ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-stone-300 active:scale-[0.98] group' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-stone-500 font-semibold text-lg">
          {icon} {title}
        </div>
        {onClick && (
          <ChevronRight size={18} className="text-stone-300 group-hover:text-stone-600 transition-colors" />
        )}
      </div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-4xl font-extrabold text-stone-900 tracking-tight">{value}</span>
        {unit && value !== '-' ? <span className="text-lg text-stone-500 font-bold">{unit}</span> : null}
      </div>
      <div className="text-stone-500 text-sm font-medium leading-snug">{subtitle}</div>
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

function ActivityRow({ 
  activity, 
  onToggle,
  onSelect 
}: { 
  key?: string; 
  activity: ActivityEntry; 
  onToggle: () => void;
  onSelect: (act: ActivityEntry) => void;
}) {
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
  const isSynced = activity.source === 'synced' || (activity.source === 'manual' && activity.id.startsWith('import-'));

  return (
    <div 
      onClick={() => onSelect(activity)}
      className="group flex items-start justify-between p-4 gap-3 rounded-2xl hover:bg-stone-50/80 transition-all cursor-pointer border border-transparent hover:border-stone-200/80"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect(activity); }}
      aria-label={`View details for ${activity.title}`}
    >
      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        {/* Category Icon */}
        <div className={`p-3 rounded-2xl ${config.bgColor} flex-shrink-0 mt-0.5 shadow-2xs group-hover:scale-105 transition-transform`}>
          {config.icon}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-1 min-w-0 mt-0.5">
          {/* Headline in bold - top element */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`text-base font-bold leading-snug ${isCompleted && !activity.source ? 'text-stone-400 line-through' : 'text-stone-900'} group-hover:text-teal-900 transition-colors`}>
              {activity.title}
            </h3>
          </div>

          {/* Badges in the next row */}
          <div className="flex items-center gap-1.5 flex-wrap">
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
            {typeof activity.steps === 'number' && activity.steps > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-tree-800 bg-tree-50 px-2 py-0.5 rounded-md border border-tree-200/80">
                <Footprints size={11} className="text-tree-600" /> {activity.steps.toLocaleString()} steps
              </span>
            )}
            {isSynced && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200/80 shadow-2xs">
                <RefreshCw size={10} className="text-teal-600" /> Synced
              </span>
            )}
            {activity.source === 'voice' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                <Mic size={11} className="text-stone-500" /> Voice Note
              </span>
            )}
            {activity.source === 'manual' && !isSynced && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                Manual Log
              </span>
            )}
          </div>

          {/* Memo text / subtext in small font */}
          {activity.subtitle && (
            <p className="text-sm font-medium text-stone-500 leading-relaxed mt-0.5 line-clamp-2">
              {activity.subtitle}
            </p>
          )}

          {/* Event timestamp at the bottom like audit (12Hours format) */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-stone-400 text-[11px] font-bold uppercase tracking-wider">
              {activity.time}
            </span>
            <span className="text-[11px] font-bold text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
              View details <ChevronRight size={12} />
            </span>
          </div>
        </div>
      </div>

      {/* Action / Status Toggle if applicable */}
      <div className="flex items-center gap-1 flex-shrink-0 mt-1" onClick={(e) => e.stopPropagation()}>
        {isInteractive ? (
          <button 
            onClick={onToggle}
            className={`p-2 rounded-full transition-colors flex-shrink-0 ${isCompleted ? 'text-teal-600' : 'text-stone-300 hover:text-stone-400'}`}
            aria-label={isCompleted ? 'Mark as pending' : 'Mark as completed'}
          >
            {isCompleted ? <CheckCircle2 size={32} className="fill-teal-50" /> : <Circle size={32} />}
          </button>
        ) : (
          <div className="p-2 text-stone-300 group-hover:text-stone-600 transition-colors">
            <ChevronRight size={20} />
          </div>
        )}
      </div>
    </div>
  );
}

