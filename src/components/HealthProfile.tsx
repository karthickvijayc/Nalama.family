import { Calendar, ArrowLeft, Plus, Edit3, Trash2, Stethoscope, Utensils, Dumbbell, Clock, Infinity as InfinityIcon, Save, X, Loader2, Sparkles, MessageSquare } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { readJsonFile, writeJsonFile } from '../lib/drive';
import { DriveState, HealthFact, TimeBucket } from '../types';

interface HealthProfileProps {
  onBack: () => void;
  driveState: DriveState | null;
  onFactsUpdated?: () => void;
}

export default function HealthProfile({ onBack, driveState, onFactsUpdated }: HealthProfileProps) {
  const [facts, setFacts] = useState<HealthFact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // For adding new fact
  const [isAdding, setIsAdding] = useState(false);
  const [newFact, setNewFact] = useState<Partial<HealthFact>>({ 
    category: 'medical', 
    expiresAt: null,
    timeBucket: 'Morning',
    frequency: 'daily'
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (driveState) {
      loadProfile();
    }
  }, [driveState]);

  const loadProfile = async () => {
    if (!driveState) return;
    setIsLoading(true);
    try {
      const data = await readJsonFile(driveState.token, driveState.contextFileId);
      if (data && data.facts) {
        setFacts(data.facts);
      }
    } catch (err) {
      console.error("Failed to load profile", err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveFacts = async (updatedFacts: HealthFact[]) => {
    if (!driveState) return;
    setIsSaving(true);
    try {
      const data = await readJsonFile(driveState.token, driveState.contextFileId) || {};
      const newData = { ...data, facts: updatedFacts, schema_version: "1.0" };
      await writeJsonFile(driveState.token, 'context_memory.json', newData, driveState.mainFolderId, driveState.contextFileId);
      setFacts(updatedFacts);
      if (onFactsUpdated) onFactsUpdated();
    } catch (err) {
      console.error("Failed to save profile", err);
      alert("Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdd = async () => {
    if (!newFact.text || !newFact.category) return;
    const fact: HealthFact = {
      id: 'fact-' + Date.now().toString(),
      category: newFact.category as any,
      text: newFact.text.trim(),
      source: 'Manual Entry',
      addedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      expiresAt: newFact.expiresAt || null,
      frequency: newFact.category === 'routine' ? (newFact.frequency || 'daily') : undefined,
      timeBucket: newFact.category === 'routine' ? (newFact.timeBucket || 'Morning') : undefined,
    };
    await saveFacts([...facts, fact]);
    setIsAdding(false);
    setNewFact({ 
      category: 'medical', 
      expiresAt: null,
      timeBucket: 'Morning',
      frequency: 'daily'
    });
  };

  const handleUpdate = async (id: string, updatedFact: Partial<HealthFact>) => {
    const updatedFacts = facts.map(f => f.id === id ? { ...f, ...updatedFact } : f);
    await saveFacts(updatedFacts);
  };

  const handleDelete = async (id: string) => {
    const updatedFacts = facts.filter(f => f.id !== id);
    await saveFacts(updatedFacts);
  };

  const medicalFacts = facts.filter(f => f.category === 'medical');
  const dietFacts = facts.filter(f => f.category === 'diet');
  const fitnessFacts = facts.filter(f => f.category === 'fitness');
  const routineFacts = facts.filter(f => f.category === 'routine');
  const otherFacts = facts.filter(f => !['medical', 'diet', 'fitness', 'routine'].includes(f.category));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 pt-6 pb-40 min-h-screen bg-[#F9F7F4] items-center justify-center">
        <Loader2 className="animate-spin text-tree-600" size={32} />
        <p className="text-stone-500 font-bold">Syncing profile from Google Drive...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-6 pb-40 min-h-screen bg-[#F9F7F4]">
      {/* Header */}
      <header className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-3 bg-white rounded-full border border-stone-200 shadow-sm hover:bg-stone-50 transition-colors cursor-pointer"
          aria-label="Go back"
        >
          <ArrowLeft size={24} className="text-stone-700" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">
            My Health Profile
          </h1>
          <p className="text-xs text-stone-500 font-medium">
            {facts.length} {facts.length === 1 ? 'detail' : 'details'} remembered • All editable
          </p>
        </div>
      </header>

      {/* Description */}
      <section className="bg-stone-900 text-white p-5 rounded-[2rem] shadow-sm">
        <p className="font-medium text-stone-100 leading-relaxed text-sm">
          This is what Gemini remembers about you from your logged notes and documents. All entries can be edited or deleted at any time.
        </p>
        {!isAdding && (
          <button 
            onClick={() => setIsAdding(true)} 
            className="mt-4 w-full bg-white text-stone-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-sm hover:bg-stone-100 text-sm"
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>Add a new detail or routine</span>
          </button>
        )}
      </section>

      {/* Add New Fact Form */}
      {isAdding && (
        <div className="bg-white p-5 rounded-[2rem] border-2 border-tree-500 shadow-md flex flex-col gap-4 animate-in fade-in duration-200">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-stone-900 text-base">Add New Health Detail</h3>
            <button 
              onClick={() => setIsAdding(false)} 
              className="p-2 bg-stone-100 text-stone-500 hover:text-stone-700 rounded-full cursor-pointer transition-colors"
              aria-label="Cancel adding"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">Category</label>
            <select 
              className="w-full p-3.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-tree-500 text-sm cursor-pointer"
              value={newFact.category}
              onChange={(e) => setNewFact({...newFact, category: e.target.value as any})}
            >
              <option value="medical">🩺 Medical & Vitals</option>
              <option value="diet">🥗 Diet & Kitchen</option>
              <option value="routine">⏰ Routines & Reminders</option>
              <option value="fitness">🏃 Fitness & Mobility</option>
            </select>
          </div>

          {/* Routine specific inputs */}
          {newFact.category === 'routine' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-blue-900 uppercase">Time of Day</label>
                <select
                  value={newFact.timeBucket || 'Morning'}
                  onChange={(e) => setNewFact({...newFact, timeBucket: e.target.value as TimeBucket})}
                  className="w-full p-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-stone-800 outline-none"
                >
                  <option value="Morning">🌅 Morning</option>
                  <option value="Afternoon">☀️ Afternoon</option>
                  <option value="Evening">🌇 Evening</option>
                  <option value="Night">🌙 Night</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-blue-900 uppercase">Frequency</label>
                <select
                  value={newFact.frequency || 'daily'}
                  onChange={(e) => setNewFact({...newFact, frequency: e.target.value})}
                  className="w-full p-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-stone-800 outline-none"
                >
                  <option value="daily">Daily Schedule</option>
                  <option value="weekly">Weekly Routine</option>
                </select>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">Detail Description</label>
            <textarea 
              className="w-full p-3.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-tree-500 resize-y min-h-[90px]"
              rows={3}
              placeholder={newFact.category === 'routine' ? "e.g., Drink 500ml water right after waking up..." : "e.g., Allergic to penicillin..."}
              value={newFact.text || ''}
              onChange={(e) => setNewFact({...newFact, text: e.target.value})}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">How long is this valid?</label>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setNewFact({...newFact, expiresAt: null})}
                className={`flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-colors cursor-pointer ${
                  newFact.expiresAt === null 
                    ? 'bg-tree-50 border-tree-600 text-tree-800' 
                    : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                }`}
              >
                Permanent
              </button>
              <button 
                type="button"
                onClick={() => setNewFact({...newFact, expiresAt: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0]})}
                className={`flex-1 py-2.5 px-3 rounded-xl border-2 font-bold text-xs transition-colors cursor-pointer ${
                  newFact.expiresAt !== null 
                    ? 'bg-amber-50 border-amber-500 text-amber-800' 
                    : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                }`}
              >
                Temporary
              </button>
            </div>
            
            {newFact.expiresAt !== null && (
               <div className="mt-1 flex flex-col gap-1">
                 <label className="text-xs font-bold text-stone-500">Expiration Date</label>
                 <input 
                   type="date" 
                   value={newFact.expiresAt}
                   onChange={(e) => setNewFact({...newFact, expiresAt: e.target.value})}
                   className="w-full p-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
                 />
               </div>
            )}
          </div>

          <button 
            type="button"
            onClick={handleAdd}
            disabled={isSaving || !newFact.text?.trim()}
            className="mt-2 w-full bg-tree-700 hover:bg-tree-800 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer shadow-md text-sm"
          >
            {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
            <span>Save to Google Drive</span>
          </button>
        </div>
      )}

      {/* Categories */}
      <div className="flex flex-col gap-6">
        
        {/* Routines & Reminders Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Calendar size={20} className="text-blue-600" />
            <h2 className="text-xl font-bold text-stone-900">Routines & Reminders</h2>
            <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {routineFacts.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {routineFacts.length === 0 ? (
              <div className="bg-white p-5 rounded-2xl border border-stone-200/80 text-stone-400 text-sm font-medium italic text-center">
                No active routines saved. Accepted suggestions and manual routines appear here.
              </div>
            ) : (
              routineFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} 
                  fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

        {/* Medical & Vitals Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Stethoscope size={20} className="text-rose-600" />
            <h2 className="text-xl font-bold text-stone-900">Medical & Vitals</h2>
            <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {medicalFacts.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {medicalFacts.length === 0 ? (
              <p className="text-stone-400 font-medium italic p-2 text-sm">No medical details saved yet.</p>
            ) : (
              medicalFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} 
                  fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

        {/* Diet & Kitchen Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Utensils size={20} className="text-amber-600" />
            <h2 className="text-xl font-bold text-stone-900">Diet & Kitchen</h2>
            <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {dietFacts.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {dietFacts.length === 0 ? (
              <p className="text-stone-400 font-medium italic p-2 text-sm">No diet details saved yet.</p>
            ) : (
              dietFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} 
                  fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

        {/* Fitness & Mobility Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Dumbbell size={20} className="text-teal-600" />
            <h2 className="text-xl font-bold text-stone-900">Fitness & Mobility</h2>
            <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {fitnessFacts.length}
            </span>
          </div>
          <div className="flex flex-col gap-3">
            {fitnessFacts.length === 0 ? (
              <p className="text-stone-400 font-medium italic p-2 text-sm">No fitness details saved yet.</p>
            ) : (
              fitnessFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} 
                  fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

        {/* Other / General Notes Section */}
        {otherFacts.length > 0 && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2 px-1">
              <MessageSquare size={20} className="text-stone-600" />
              <h2 className="text-xl font-bold text-stone-900">General Notes</h2>
              <span className="text-xs font-bold text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                {otherFacts.length}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {otherFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} 
                  fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

function ProfileFactCard({ 
  fact,
  onUpdate,
  onDelete
}: { 
  fact: HealthFact;
  onUpdate: (updates: Partial<HealthFact>) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(fact.text);
  const [draftCategory, setDraftCategory] = useState<HealthFact['category']>(fact.category || 'medical');
  const [draftTimeBucket, setDraftTimeBucket] = useState<TimeBucket>(fact.timeBucket || 'Morning');
  const [draftFrequency, setDraftFrequency] = useState<string>(fact.frequency || 'daily');
  const [isPermanent, setIsPermanent] = useState(fact.expiresAt === null);
  const [draftExpiresAt, setDraftExpiresAt] = useState(fact.expiresAt || new Date().toISOString().split('T')[0]);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const handleSave = async () => {
    if (!draftText.trim()) return;
    setIsSavingEdit(true);
    try {
      await onUpdate({
        text: draftText.trim(),
        category: draftCategory,
        expiresAt: isPermanent ? null : draftExpiresAt,
        timeBucket: draftCategory === 'routine' ? draftTimeBucket : undefined,
        frequency: draftCategory === 'routine' ? (draftFrequency || 'daily') : undefined
      });
      setIsEditing(false);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleCancel = () => {
    setDraftText(fact.text);
    setDraftCategory(fact.category || 'medical');
    setDraftTimeBucket(fact.timeBucket || 'Morning');
    setDraftFrequency(fact.frequency || 'daily');
    setIsPermanent(fact.expiresAt === null);
    setDraftExpiresAt(fact.expiresAt || new Date().toISOString().split('T')[0]);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  if (isDeleting) {
    return (
      <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center justify-center gap-3 opacity-60">
        <Loader2 className="animate-spin text-rose-500" size={20} />
        <span className="font-bold text-rose-500 text-sm">Deleting detail...</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-white p-5 rounded-2xl border-2 border-tree-500 shadow-md flex flex-col gap-4 animate-in fade-in duration-200">
        <div className="flex justify-between items-center pb-2 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Edit3 size={18} className="text-tree-600" />
            <h3 className="font-bold text-stone-900 text-sm">Edit Profile Detail</h3>
          </div>
          <button 
            type="button"
            onClick={handleCancel} 
            className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full cursor-pointer transition-colors"
            aria-label="Cancel editing"
          >
            <X size={18} />
          </button>
        </div>

        {/* Category Switcher */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">Category</label>
          <select 
            className="w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold text-xs focus:ring-2 focus:ring-tree-500 outline-none cursor-pointer"
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value as any)}
          >
            <option value="routine">⏰ Routine / Habit Reminder</option>
            <option value="medical">🩺 Medical & Vitals</option>
            <option value="diet">🥗 Diet & Kitchen</option>
            <option value="fitness">🏃 Fitness & Mobility</option>
          </select>
        </div>

        {/* Routine Specific Controls */}
        {draftCategory === 'routine' && (
          <div className="grid grid-cols-2 gap-2.5 p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-blue-900 uppercase">Time of Day</label>
              <select
                value={draftTimeBucket}
                onChange={(e) => setDraftTimeBucket(e.target.value as TimeBucket)}
                className="w-full p-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-stone-800 outline-none"
              >
                <option value="Morning">🌅 Morning</option>
                <option value="Afternoon">☀️ Afternoon</option>
                <option value="Evening">🌇 Evening</option>
                <option value="Night">🌙 Night</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-blue-900 uppercase">Frequency</label>
              <select
                value={draftFrequency}
                onChange={(e) => setDraftFrequency(e.target.value)}
                className="w-full p-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-stone-800 outline-none"
              >
                <option value="daily">Daily Schedule</option>
                <option value="weekly">Weekly Routine</option>
                <option value="specific_days">Specific Days</option>
              </select>
            </div>
          </div>
        )}

        {/* Text Input */}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">Description</label>
          <textarea 
            className="w-full p-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-tree-500 resize-y min-h-[80px]"
            rows={3}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            placeholder="Detail description..."
          />
        </div>

        {/* Validity */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-stone-500 uppercase tracking-wide">Validity Period</label>
          <div className="flex gap-2">
            <button 
              type="button"
              onClick={() => setIsPermanent(true)}
              className={`flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs transition-colors cursor-pointer ${
                isPermanent 
                  ? 'bg-tree-50 border-tree-600 text-tree-800' 
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              Permanent
            </button>
            <button 
              type="button"
              onClick={() => setIsPermanent(false)}
              className={`flex-1 py-2 px-3 rounded-xl border-2 font-bold text-xs transition-colors cursor-pointer ${
                !isPermanent 
                  ? 'bg-amber-50 border-amber-500 text-amber-800' 
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              Temporary
            </button>
          </div>
          
          {!isPermanent && (
             <div className="mt-1 flex flex-col gap-1">
               <label className="text-[10px] font-bold text-stone-400">Valid Until</label>
               <input 
                 type="date" 
                 value={draftExpiresAt}
                 onChange={(e) => setDraftExpiresAt(e.target.value)}
                 className="w-full p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 text-xs"
               />
             </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1 border-t border-stone-100">
          <button 
            type="button"
            onClick={handleCancel}
            className="flex-1 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={handleSave}
            disabled={isSavingEdit || !draftText.trim()}
            className="flex-[2] py-2.5 bg-tree-700 hover:bg-tree-800 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 text-xs transition-transform active:scale-98 shadow-sm cursor-pointer"
          >
            {isSavingEdit ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            <span>Save Changes</span>
          </button>
        </div>
      </div>
    );
  }

  const isPermanentView = fact.expiresAt === null;

  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-sm transition-all flex flex-col gap-3">
      {/* Top Badges */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Category Pill */}
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
            fact.category === 'routine' ? 'bg-blue-100 text-blue-800' :
            fact.category === 'medical' ? 'bg-rose-100 text-rose-800' :
            fact.category === 'diet' ? 'bg-amber-100 text-amber-800' :
            fact.category === 'fitness' ? 'bg-teal-100 text-teal-800' :
            'bg-stone-100 text-stone-700'
          }`}>
            {fact.category === 'routine' && <Clock size={11} />}
            {fact.category === 'medical' && <Stethoscope size={11} />}
            {fact.category === 'diet' && <Utensils size={11} />}
            {fact.category === 'fitness' && <Dumbbell size={11} />}
            <span>{fact.category}</span>
          </span>

          {/* Routine specific schedule badges */}
          {fact.category === 'routine' && (
            <>
              {fact.timeBucket && (
                <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-md">
                  {fact.timeBucket === 'Morning' ? '🌅 Morning' :
                   fact.timeBucket === 'Afternoon' ? '☀️ Afternoon' :
                   fact.timeBucket === 'Evening' ? '🌇 Evening' : '🌙 Night'}
                </span>
              )}
              {fact.frequency && (
                <span className="text-[10px] font-bold text-stone-500 bg-stone-50 border border-stone-200 px-1.5 py-0.5 rounded-md capitalize">
                  {fact.frequency}
                </span>
              )}
            </>
          )}

          {fact.source === 'gemini_extraction' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-stone-400 bg-stone-50 px-1.5 py-0.5 rounded-md">
              <Sparkles size={9} /> Auto-extracted
            </span>
          )}
        </div>

        {/* Validity Badge */}
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${
          isPermanentView 
            ? 'bg-stone-50 border-stone-200 text-stone-500' 
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {isPermanentView ? <InfinityIcon size={11} /> : <Clock size={11} />}
          <span>{isPermanentView ? 'Permanent' : `Until ${fact.expiresAt}`}</span>
        </div>
      </div>

      {/* Main Fact Text */}
      <p className="text-sm font-semibold text-stone-900 leading-snug break-words">
        {fact.text}
      </p>
      
      {/* Bottom Action Bar */}
      <div className="flex items-center justify-between pt-2.5 border-t border-stone-100">
        <span className="text-[11px] font-medium text-stone-400">
          Added {fact.addedAt}
        </span>

        {isConfirmingDelete ? (
          <div className="flex gap-1.5 items-center bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-200">
            <span className="text-xs font-bold text-rose-600 mr-1">Delete?</span>
            <button 
              type="button"
              onClick={handleDelete}
              className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors cursor-pointer"
            >
              Yes
            </button>
            <button 
              type="button"
              onClick={() => setIsConfirmingDelete(false)}
              className="px-2 py-1 bg-white text-stone-500 border border-stone-200 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors cursor-pointer"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button 
              type="button"
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200/80 rounded-lg transition-colors cursor-pointer" 
              aria-label="Edit detail"
            >
              <Edit3 size={13} />
              <span>Edit</span>
            </button>
            <button 
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer" 
              aria-label="Delete detail"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
