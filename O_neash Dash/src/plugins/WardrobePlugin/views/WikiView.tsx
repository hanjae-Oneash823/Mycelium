import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { WikiEntryRow, WikiCategory } from '../lib/wardrobeDb';
import { loadEntries, createEntry, updateEntry, deleteEntry, getEntryById } from '../lib/wardrobeDb';
import WikiIndexView from './WikiIndexView';
import WikiEntryEditor from '../components/WikiEntryEditor';

const transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

export default function WikiView() {
  const [entries, setEntries]   = useState<WikiEntryRow[]>([]);
  const [openEntry, setOpenEntry] = useState<WikiEntryRow | null>(null);
  const dirRef = useRef<1 | -1>(1);

  const load = useCallback(async () => {
    setEntries(await loadEntries());
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEditor  = useCallback((entry: WikiEntryRow) => { dirRef.current = 1;  setOpenEntry(entry); }, []);
  const closeEditor = useCallback(() => { dirRef.current = -1; setOpenEntry(null); load(); }, [load]);

  const handleCreate = useCallback(async (category: WikiCategory) => {
    const id = await createEntry({ category, title: 'New Entry', content_plain: null, content_json: null });
    const entry = await getEntryById(id);
    if (entry) openEditor(entry);
  }, [openEditor]);

  const handleSave = useCallback(async (title: string, category: WikiCategory, contentJson: string) => {
    if (!openEntry) return;
    await updateEntry(openEntry.id, { title, category, content_json: contentJson });
  }, [openEntry?.id]);

  const handleDelete = useCallback(async () => {
    if (!openEntry) return;
    await deleteEntry(openEntry.id);
    closeEditor();
  }, [openEntry?.id, closeEditor]);

  const handleNavigate = useCallback(async (entryId: string) => {
    const target = await getEntryById(entryId);
    if (target) openEditor(target);
  }, [openEditor]);

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <AnimatePresence mode="popLayout" custom={dirRef.current}>
        {openEntry ? (
          <motion.div
            key={openEntry.id}
            initial={{ x: '6%', opacity: 0, scale: 0.98 }}
            animate={{ x: 0,    opacity: 1, scale: 1    }}
            exit={{    x: '6%', opacity: 0, scale: 0.98 }}
            transition={transition}
            style={{ position: 'absolute', inset: 0 }}
          >
            <WikiEntryEditor
              entry={openEntry}
              onSave={handleSave}
              onBack={closeEditor}
              onDelete={handleDelete}
              onNavigate={handleNavigate}
            />
          </motion.div>
        ) : (
          <motion.div
            key="index"
            initial={{ x: '-6%', opacity: 0 }}
            animate={{ x: 0,     opacity: 1 }}
            exit={{    x: '-6%', opacity: 0 }}
            transition={transition}
            style={{ position: 'absolute', inset: 0 }}
          >
            <WikiIndexView entries={entries} onOpen={openEditor} onCreate={handleCreate} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
