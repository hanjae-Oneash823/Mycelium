import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNotesStore } from '../store/useNotesStore';
import type { NoteRow } from '../lib/notesDb';
import { loadNotes } from '../lib/notesDb';
import FileSystemView from '../components/FileSystemView';
import TypewriterEditor from '../components/TypewriterEditor';

const transition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] };

interface DocumentsViewProps {
  defaultOpenDoc?: NoteRow | null;
  onDefaultDocOpened?: () => void;
}

export default function DocumentsView({ defaultOpenDoc, onDefaultDocOpened }: DocumentsViewProps) {
  const { loadDocuments, createDocument, updateDocument, deleteNote } = useNotesStore();
  const [openDoc, setOpenDoc] = useState<NoteRow | null>(null);
  const dirRef = useRef<1 | -1>(1);

  useEffect(() => { loadDocuments(); }, []);

  // Auto-open a doc passed in from the promote flow
  useEffect(() => {
    if (!defaultOpenDoc) return;
    dirRef.current = 1;
    setOpenDoc(defaultOpenDoc);
    onDefaultDocOpened?.();
  }, [defaultOpenDoc?.id]);

  const handleSave = useCallback(async (title: string, contentJson: string) => {
    if (!openDoc) return;
    await updateDocument(openDoc.id, title, contentJson);
  }, [openDoc?.id, updateDocument]);

  const openEditor  = useCallback((doc: NoteRow) => { dirRef.current = 1;  setOpenDoc(doc); }, []);
  const closeEditor = useCallback(()             => { dirRef.current = -1; setOpenDoc(null); loadDocuments(); }, [loadDocuments]);

  const handleNavigate = useCallback(async (docId: string) => {
    const docs = await loadNotes('document');
    const target = docs.find(d => d.id === docId) ?? null;
    if (target) openEditor(target);
  }, [openEditor]);

  const handleDeleteDoc = useCallback(async (id: string) => {
    await deleteNote(id);
    // If the deleted doc is currently open, go back to the file system
    if (openDoc?.id === id) closeEditor();
  }, [deleteNote, openDoc?.id, closeEditor]);

  const handleCreateDoc = async (arcId: string | null, projectId: string | null) => {
    const id  = await createDocument('New Document', arcId, projectId);
    const doc = (await loadNotes('document')).find(d => d.id === id) ?? null;
    if (doc) openEditor(doc);
  };

  return (
    <div style={{ height: '100%', position: 'relative', overflow: 'hidden' }}>
      <AnimatePresence mode="popLayout" custom={dirRef.current}>
        {openDoc ? (
          <motion.div
            key={openDoc.id}
            initial={{ x: '6%', opacity: 0, scale: 0.98 }}
            animate={{ x: 0,    opacity: 1, scale: 1    }}
            exit={{    x: '6%', opacity: 0, scale: 0.98 }}
            transition={transition}
            style={{ position: 'absolute', inset: 0 }}
          >
            <TypewriterEditor
              doc={openDoc}
              onSave={handleSave}
              onBack={closeEditor}
              onDelete={() => handleDeleteDoc(openDoc.id)}
              onNavigate={handleNavigate}
            />
          </motion.div>
        ) : (
          <motion.div
            key="fs"
            initial={{ x: '-6%', opacity: 0 }}
            animate={{ x: 0,     opacity: 1 }}
            exit={{    x: '-6%', opacity: 0 }}
            transition={transition}
            style={{ position: 'absolute', inset: 0 }}
          >
            <FileSystemView onOpenDoc={openEditor} onCreateDoc={handleCreateDoc} onDeleteDoc={handleDeleteDoc} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
