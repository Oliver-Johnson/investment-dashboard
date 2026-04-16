import { useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, Trash2, Tag } from 'lucide-react';

export default function NoteCard({ note, accounts, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const taggedAccounts = accounts.filter(a => note.account_ids?.includes(a.id));
  const colour = note.colour || '#6366f1';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="bg-slate-900 border rounded-xl overflow-hidden"
      style={{ borderColor: colour + '40' }}
    >
      {/* Colour accent bar */}
      <div className="h-0.5 w-full" style={{ backgroundColor: colour }} />

      {/* Scrollable content */}
      <div className="max-h-64 overflow-y-auto p-4">
        <div
          className="prose prose-invert prose-sm max-w-none text-slate-300
            [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-slate-100 [&_h1]:mb-2
            [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-slate-100 [&_h2]:mb-1.5
            [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-slate-200 [&_h3]:mb-1
            [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5
            [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5
            [&_p]:text-sm [&_p]:leading-relaxed [&_p]:my-1
            [&_strong]:text-slate-100 [&_em]:text-slate-300"
          dangerouslySetInnerHTML={{ __html: note.content }}
        />
      </div>

      {/* Footer: accounts + tags + actions */}
      <div className="px-4 pb-3 pt-2 border-t border-slate-800/60 flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {taggedAccounts.map(a => (
            <span
              key={a.id}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium"
              style={{ backgroundColor: (a.colour || '#6366f1') + '25', color: a.colour || '#6366f1' }}
            >
              {a.name}
            </span>
          ))}
          {note.tag_names?.map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400"
            >
              <Tag size={8} />
              {tag}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onEdit(note)}
            className="p-2 rounded hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Pencil size={13} />
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onDelete(note.id)}
                className="px-2.5 py-1 rounded text-[10px] bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-2.5 py-1 rounded text-[10px] bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-2 rounded hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
