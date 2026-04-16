import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Plus, Tag, X } from 'lucide-react';
import Masonry from 'react-masonry-css';
import NoteCard from './NoteCard';
import NoteEditor from './NoteEditor';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function NotesPage({ accounts }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [activeAccountIds, setActiveAccountIds] = useState([]);
  const [activeTag, setActiveTag] = useState('');
  const [tagFilterInput, setTagFilterInput] = useState('');
  const [allTags, setAllTags] = useState([]);

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/notes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotes(await res.json());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/tags`);
      if (!res.ok) return;
      setAllTags(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchNotes(); fetchTags(); }, [fetchNotes, fetchTags]);

  const toggleAccountFilter = (id) => {
    setActiveAccountIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSave = async (data) => {
    if (editingNote) {
      await fetch(`${API_URL}/api/notes/${editingNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    } else {
      await fetch(`${API_URL}/api/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    }
    setEditorOpen(false);
    setEditingNote(null);
    await fetchNotes();
    await fetchTags();
  };

  const handleDelete = async (id) => {
    await fetch(`${API_URL}/api/notes/${id}`, { method: 'DELETE' });
    await fetchNotes();
  };

  const handleEdit = (note) => {
    setEditingNote(note);
    setEditorOpen(true);
  };

  // Filtered notes
  const filteredNotes = notes.filter(note => {
    if (activeAccountIds.length > 0) {
      const hasAccount = activeAccountIds.every(id => note.account_ids?.includes(id));
      if (!hasAccount) return false;
    }
    if (activeTag) {
      if (!note.tag_names?.includes(activeTag)) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-3 md:px-6 py-5 md:py-8">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xs text-slate-500 font-medium uppercase tracking-widest">Notes</h2>
        <button
          onClick={() => { setEditingNote(null); setEditorOpen(true); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
        >
          <Plus size={13} />
          New Note
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex overflow-x-auto gap-2 mb-6 pb-1 sm:flex-wrap sm:overflow-x-visible">
        {/* Account filter chips */}
        {accounts.map(a => {
          const active = activeAccountIds.includes(a.id);
          const c = a.colour || '#6366f1';
          return (
            <button
              key={a.id}
              onClick={() => toggleAccountFilter(a.id)}
              className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-all"
              style={active
                ? { backgroundColor: c + '30', borderColor: c, color: c }
                : { backgroundColor: 'transparent', borderColor: '#334155', color: '#64748b' }
              }
            >
              {a.name}
            </button>
          );
        })}

        {/* Tag filter */}
        {allTags.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-700 bg-slate-800/50">
            <Tag size={10} className="text-slate-500" />
            <select
              value={activeTag}
              onChange={e => setActiveTag(e.target.value)}
              className="bg-transparent text-xs text-slate-400 outline-none cursor-pointer"
            >
              <option value="">All tags</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {/* Clear filters */}
        {(activeAccountIds.length > 0 || activeTag) && (
          <button
            onClick={() => { setActiveAccountIds([]); setActiveTag(''); }}
            className="flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded-full text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-500 transition-colors"
          >
            <X size={10} /> Clear
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <Masonry
          breakpointCols={{ default: 3, 1280: 3, 768: 2, 0: 1 }}
          className="flex gap-4"
          columnClassName="flex flex-col gap-4"
        >
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl h-40 animate-pulse" />
          ))}
        </Masonry>
      ) : error ? (
        <div className="text-center py-16 text-red-400 text-sm">{error}</div>
      ) : filteredNotes.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">📝</div>
          <div className="text-sm">No notes yet</div>
          <div className="text-xs mt-1 text-slate-700">
            {notes.length > 0 ? 'Try adjusting your filters' : 'Click "New Note" to get started'}
          </div>
        </div>
      ) : (
        <Masonry
          breakpointCols={{ default: 3, 1280: 3, 768: 2, 0: 1 }}
          className="flex gap-4"
          columnClassName="flex flex-col gap-4"
        >
          <AnimatePresence>
            {filteredNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                accounts={accounts}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>
        </Masonry>
      )}

      {editorOpen && (
        <NoteEditor
          note={editingNote}
          accounts={accounts}
          onSave={handleSave}
          onClose={() => { setEditorOpen(false); setEditingNote(null); }}
        />
      )}
    </div>
  );
}
