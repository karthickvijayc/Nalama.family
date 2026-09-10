import { Calendar, ArrowLeft, Plus, Edit3, Trash2, Stethoscope, Utensils, Dumbbell, Clock, Infinity as InfinityIcon, Save, X, Loader2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { readJsonFile, writeJsonFile } from '../lib/drive';
import { DriveState } from '../App';

export interface HealthFact {
  id: string;
  category: 'medical' | 'diet' | 'fitness';
  text: string;
  source: string;
  addedAt: string;
  expiresAt: string | null;
}

export default function HealthProfile({ onBack, driveState }: { onBack: () => void, driveState: DriveState | null }) {
  const [facts, setFacts] = useState<HealthFact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // For adding new fact
  const [isAdding, setIsAdding] = useState(false);
  const [newFact, setNewFact] = useState<Partial<HealthFact>>({ category: 'medical', expiresAt: null });
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
      id: Date.now().toString(),
      category: newFact.category as any,
      text: newFact.text,
      source: 'Manual Entry',
      addedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      expiresAt: newFact.expiresAt || null,
    };
    await saveFacts([...facts, fact]);
    setIsAdding(false);
    setNewFact({ category: 'medical', expiresAt: null });
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 pt-6 pb-40 min-h-screen bg-[#F9F7F4] items-center justify-center">
        <Loader2 className="animate-spin text-teal-600" size={32} />
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
          className="p-3 bg-white rounded-full border border-stone-200 shadow-sm hover:bg-stone-50 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={24} className="text-stone-700" />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">
            My Health Profile
          </h1>
        </div>
      </header>

      {/* Description */}
      <section className="bg-stone-900 text-white p-5 rounded-[2rem] shadow-sm">
        <p className="font-medium text-stone-100 leading-relaxed">
          This is what I remember about you from our conversations and your files. Saved privately in your Google Drive.
        </p>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="mt-4 w-full bg-white text-stone-900 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95">
            <Plus size={20} strokeWidth={3} />
            Add a new detail manually
          </button>
        )}
      </section>

      {/* Add New Fact Form */}
      {isAdding && (
        <div className="bg-white p-5 rounded-[2rem] border-2 border-teal-500 shadow-md flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-stone-900 text-lg">Add New Detail</h3>
            <button onClick={() => setIsAdding(false)} className="p-2 bg-stone-100 text-stone-500 rounded-full">
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">Category</label>
            <select 
              className="w-full p-4 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              value={newFact.category}
              onChange={(e) => setNewFact({...newFact, category: e.target.value as any})}
            >
              <option value="medical">Medical & Vitals</option>
              <option value="diet">Diet & Kitchen</option>
              <option value="fitness">Fitness & Mobility</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">Detail</label>
            <textarea 
              className="w-full p-4 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium text-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              rows={3}
              placeholder="e.g., Allergic to penicillin..."
              value={newFact.text || ''}
              onChange={(e) => setNewFact({...newFact, text: e.target.value})}
            />
          </div>

          <div className="flex flex-col gap-3">
            <label className="text-xs font-bold text-stone-600 uppercase tracking-wide">How long is this valid?</label>
            <div className="flex gap-3">
              <button 
                onClick={() => setNewFact({...newFact, expiresAt: null})}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-colors ${
                  newFact.expiresAt === null 
                    ? 'bg-teal-50 border-teal-600 text-teal-800' 
                    : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                }`}
              >
                Permanent
              </button>
              <button 
                onClick={() => setNewFact({...newFact, expiresAt: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0]})}
                className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-colors ${
                  newFact.expiresAt !== null 
                    ? 'bg-amber-50 border-amber-500 text-amber-800' 
                    : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
                }`}
              >
                Temporary
              </button>
            </div>
            
            {newFact.expiresAt !== null && (
               <div className="mt-2 flex flex-col gap-1">
                 <label className="text-xs font-bold text-stone-500">Expiration Date</label>
                 <input 
                   type="date" 
                   value={newFact.expiresAt}
                   onChange={(e) => setNewFact({...newFact, expiresAt: e.target.value})}
                   className="w-full p-4 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                 />
               </div>
            )}
          </div>

          <button 
            onClick={handleAdd}
            disabled={isSaving || !newFact.text}
            className="mt-2 w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
          >
            {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
            Save to Google Drive
          </button>
        </div>
      )}

      {/* Categories */}
      <div className="flex flex-col gap-6">
        
        {/* Medical Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Stethoscope size={20} className="text-rose-600" />
            <h2 className="text-xl font-bold text-stone-900">Medical & Vitals</h2>
          </div>
          <div className="flex flex-col gap-3">
            {medicalFacts.length === 0 ? (
              <p className="text-stone-400 font-medium italic p-2">No medical details saved yet.</p>
            ) : (
              medicalFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

        {/* Diet Section */}
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Utensils size={20} className="text-amber-600" />
            <h2 className="text-xl font-bold text-stone-900">Diet & Kitchen</h2>
          </div>
          <div className="flex flex-col gap-3">
            {dietFacts.length === 0 ? (
              <p className="text-stone-400 font-medium italic p-2">No diet details saved yet.</p>
            ) : (
              dietFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

        
        {/* Routines Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-stone-100 text-stone-600 rounded-lg">
              <Calendar size={20} />
            </div>
            <h2 className="text-xl font-bold text-stone-900">Routines & Reminders</h2>
          </div>
          
          <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
            {routineFacts.length === 0 ? (
              <div className="p-6 text-center text-stone-500 text-sm">
                No routines or reminders tracked yet.
              </div>
            ) : (
              routineFacts.map(fact => (
                <div key={fact.id} className="p-4 border-b border-stone-100 last:border-b-0 flex gap-4 items-start hover:bg-stone-50 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 leading-snug">{fact.text}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-stone-400">
                      <span>{new Date(fact.addedAt).toLocaleDateString()}</span>
                      {fact.source === 'gemini_extraction' && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-stone-300" />
                          <span>Auto-extracted</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(fact.id)}
                    className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    aria-label="Delete routine"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
        
        {/* Fitness Section */}

        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <Dumbbell size={20} className="text-teal-600" />
            <h2 className="text-xl font-bold text-stone-900">Fitness & Mobility</h2>
          </div>
          <div className="flex flex-col gap-3">
            {fitnessFacts.length === 0 ? (
              <p className="text-stone-400 font-medium italic p-2">No fitness details saved yet.</p>
            ) : (
              fitnessFacts.map(fact => (
                <ProfileFactCard 
                  key={fact.id} fact={fact} 
                  onUpdate={(updates) => handleUpdate(fact.id, updates)} 
                  onDelete={() => handleDelete(fact.id)} 
                />
              ))
            )}
          </div>
        </section>

      </div>
    </div>
  );
}

function ProfileFactCard({ 
  fact,
  onUpdate,
  onDelete
}: { 
  key?: string;
  fact: HealthFact;
  onUpdate: (updates: Partial<HealthFact>) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(fact.text);
  const [isPermanent, setIsPermanent] = useState(fact.expiresAt === null);
  const [draftExpiresAt, setDraftExpiresAt] = useState(fact.expiresAt || new Date().toISOString().split('T')[0]);

  const handleSave = () => {
    onUpdate({
      text: draftText,
      expiresAt: isPermanent ? null : draftExpiresAt
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftText(fact.text);
    setIsPermanent(fact.expiresAt === null);
    setDraftExpiresAt(fact.expiresAt || new Date().toISOString().split('T')[0]);
    setIsEditing(false);
  };

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center justify-center gap-3 opacity-50">
        <Loader2 className="animate-spin text-rose-500" size={24} />
        <span className="font-bold text-rose-500">Deleting...</span>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="bg-white p-5 rounded-[2rem] border-2 border-teal-500 shadow-md flex flex-col gap-5">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-stone-900 text-lg">Edit Detail</h3>
          <button onClick={handleCancel} className="p-2 bg-stone-100 text-stone-500 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-stone-600 uppercase tracking-wide">Fact Description</label>
          <textarea 
            className="w-full p-4 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-medium text-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            rows={3}
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-sm font-bold text-stone-600 uppercase tracking-wide">How long is this valid?</label>
          <div className="flex gap-3">
            <button 
              onClick={() => setIsPermanent(true)}
              className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-colors ${
                isPermanent 
                  ? 'bg-teal-50 border-teal-600 text-teal-800' 
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              Permanent
            </button>
            <button 
              onClick={() => setIsPermanent(false)}
              className={`flex-1 py-3 px-4 rounded-xl border-2 font-bold transition-colors ${
                !isPermanent 
                  ? 'bg-amber-50 border-amber-500 text-amber-800' 
                  : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50'
              }`}
            >
              Temporary
            </button>
          </div>
          
          {!isPermanent && (
             <div className="mt-2 flex flex-col gap-1">
               <label className="text-xs font-bold text-stone-500">Expiration Date</label>
               <input 
                 type="date" 
                 value={draftExpiresAt}
                 onChange={(e) => setDraftExpiresAt(e.target.value)}
                 className="w-full p-4 rounded-xl border border-stone-200 bg-stone-50 text-stone-900 font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
               />
             </div>
          )}
        </div>

        <button 
          onClick={handleSave}
          className="mt-2 w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-4 px-4 rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
        >
          <Save size={20} />
          Save Changes
        </button>
      </div>
    );
  }

  const isPermanentView = fact.expiresAt === null;

  return (
    <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex flex-col gap-3">
      <div className="flex justify-between items-start gap-2">
        <p className="text-lg font-bold text-stone-900 leading-snug flex-1">
          {fact.text}
        </p>
        
        {/* Validity Badge */}
        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border shrink-0 ${
          isPermanentView 
            ? 'bg-stone-50 border-stone-200 text-stone-500' 
            : 'bg-amber-50 border-amber-200 text-amber-700'
        }`}>
          {isPermanentView ? <InfinityIcon size={14} /> : <Clock size={14} />}
          <span>{isPermanentView ? 'Permanent' : `Until ${fact.expiresAt}`}</span>
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-2 border-t border-stone-100 mt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
            From: {fact.source}
          </span>
          <span className="text-[11px] font-semibold text-stone-400">
            Added on {fact.addedAt}
          </span>
        </div>
        {isConfirmingDelete ? (
          <div className="flex gap-2 items-center bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
            <span className="text-xs font-bold text-rose-600 mr-2">Delete?</span>
            <button 
              onClick={handleDelete}
              className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors"
            >
              Yes
            </button>
            <button 
              onClick={() => setIsConfirmingDelete(false)}
              className="px-3 py-1 bg-white text-stone-500 border border-stone-200 rounded-lg text-xs font-bold hover:bg-stone-50 transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <div className="flex gap-1">
            <button 
              onClick={() => setIsEditing(true)}
              className="p-2.5 text-stone-400 hover:text-stone-700 hover:bg-stone-50 rounded-xl transition-colors" 
              aria-label="Edit this detail"
            >
              <Edit3 size={20} />
            </button>
            <button 
              onClick={() => setIsConfirmingDelete(true)}
              className="p-2.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors" 
              aria-label="Delete this detail"
            >
              <Trash2 size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
