import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { X, Bold, Italic, Heading1, Heading2, List, ListOrdered, Tag, Plus } from 'lucide-react';

const PRESET_COLOURS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#64748b',
];

function ToolbarBtn({ onClick, active, children, title }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  );
}

export default function NoteEditor({ note, accounts, onSave, onClose }) {
  const isEdit = !!note;

  const [accountIds, setAccountIds] = useState(note?.account_ids ?? []);
  const [tagInput, setTagInput] = useState('');
  const [tagNames, setTagNames] = useState(note?.tag_names ?? []);
  const [colour, setColour] = useState(note?.colour ?? '#6366f1');
  const [saving, setSaving] = useState(false);
  const [autoColour, setAutoColour] = useState(!isEdit);

  const editor = useEditor({
    extensions: [StarterKit],
    content: note?.content ?? '',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[140px] text-sm text-slate-300 leading-relaxed prose prose-invert prose-sm max-w-none ' +
          '[&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-100 [&_h1]:mb-2 ' +
          '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-100 [&_h2]:mb-1.5 ' +
          '[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 ' +
          '[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5 ' +
          '[&_p]:my-1 [&_strong]:text-slate-100',
      },
    },
  });

  // Auto-pick colour from single tagged account
  useEffect(() => {
    if (!autoColour) return;
    if (accountIds.length === 1) {
      const acc = accounts.find(a => a.id === accountIds[0]);
      if (acc?.colour) setColour(acc.colour);
    } else if (accountIds.length !== 1) {
      setColour('#6366f1');
    }
  }, [accountIds, accounts, autoColour]);

  const toggleAccount = useCallback((id) => {
    setAutoColour(true);
    setAccountIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tagNames.includes(t)) setTagNames(prev => [...prev, t]);
    setTagInput('');
  }, [tagInput, tagNames]);

  const removeTag = useCallback((tag) => {
    setTagNames(prev => prev.filter(t => t !== tag));
  }, []);

  const handleSave = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await onSave({
        content: editor.getHTML(),
        colour,
        account_ids: accountIds,
        tag_names: tagNames,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl flex flex-col h-[95vh] sm:h-auto sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-200">{isEdit ? 'Edit Note' : 'New Note'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* TipTap toolbar */}
          <div className="flex items-center gap-0.5 p-1 bg-slate-800 rounded-lg border border-slate-700">
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleBold().run()}
              active={editor?.isActive('bold')}
              title="Bold"
            ><Bold size={14} /></ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleItalic().run()}
              active={editor?.isActive('italic')}
              title="Italic"
            ><Italic size={14} /></ToolbarBtn>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
              active={editor?.isActive('heading', { level: 1 })}
              title="Heading 1"
            ><Heading1 size={14} /></ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor?.isActive('heading', { level: 2 })}
              title="Heading 2"
            ><Heading2 size={14} /></ToolbarBtn>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
              active={editor?.isActive('bulletList')}
              title="Bullet List"
            ><List size={14} /></ToolbarBtn>
            <ToolbarBtn
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
              active={editor?.isActive('orderedList')}
              title="Numbered List"
            ><ListOrdered size={14} /></ToolbarBtn>
          </div>

          {/* Editor */}
          <div className="min-h-[140px] bg-slate-800/50 border border-slate-700 rounded-xl p-3 cursor-text"
            onClick={() => editor?.commands.focus()}>
            <EditorContent editor={editor} />
          </div>

          {/* Account tags */}
          <div>
            <div className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">Tag Accounts</div>
            <div className="flex flex-wrap gap-2">
              {accounts.map(a => {
                const selected = accountIds.includes(a.id);
                const c = a.colour || '#6366f1';
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggleAccount(a.id)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all border"
                    style={selected
                      ? { backgroundColor: c + '30', borderColor: c, color: c }
                      : { backgroundColor: 'transparent', borderColor: '#334155', color: '#64748b' }
                    }
                  >
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Free-text tags */}
          <div>
            <div className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">Tags</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tagNames.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-800 border border-slate-700 text-slate-300">
                  <Tag size={9} />
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-slate-500 hover:text-red-400 transition-colors ml-0.5">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Add tag..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 placeholder-slate-600 outline-none focus:border-slate-500"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Colour picker */}
          <div>
            <div className="text-xs text-slate-500 font-medium mb-2 uppercase tracking-wider">Colour</div>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLOURS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setAutoColour(false); setColour(c); }}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: colour === c ? 'white' : 'transparent',
                    transform: colour === c ? 'scale(1.2)' : 'scale(1)',
                  }}
                />
              ))}
              <input
                type="color"
                value={colour}
                onChange={e => { setAutoColour(false); setColour(e.target.value); }}
                className="w-6 h-6 rounded-full cursor-pointer border-2 border-slate-600 bg-transparent"
                title="Custom colour"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
