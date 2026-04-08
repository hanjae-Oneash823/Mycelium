import { create } from 'zustand';
import * as db from '../lib/notesDb';
import type { NoteRow } from '../lib/notesDb';

interface NotesStore {
  memos:          NoteRow[];
  archivedMemos:  NoteRow[];
  documents:      NoteRow[];

  loadMemos:          () => Promise<void>;
  loadArchivedMemos:  () => Promise<void>;
  loadDocuments:      () => Promise<void>;

  createMemo:     (content: string) => Promise<string>;
  createDocument: (title: string, arc_id?: string | null, project_id?: string | null) => Promise<string>;

  updateMemo:     (id: string, content: string) => Promise<void>;
  updateDocument: (id: string, title: string, contentJson: string) => Promise<void>;

  archiveMemo:  (id: string) => Promise<void>;
  restoreMemo:  (id: string) => Promise<void>;
  deleteNote:   (id: string) => Promise<void>;
  promoteToDoc: (id: string, title: string, contentJson: string) => Promise<void>;
}

export const useNotesStore = create<NotesStore>((set, get) => ({
  memos:         [],
  archivedMemos: [],
  documents:     [],

  loadMemos: async () => {
    const memos = await db.loadNotes('memo');
    set({ memos });
  },

  loadArchivedMemos: async () => {
    const archivedMemos = await db.loadArchivedMemos();
    set({ archivedMemos });
  },

  loadDocuments: async () => {
    const documents = await db.loadNotes('document');
    set({ documents });
  },

  createMemo: async (content) => {
    const id = await db.createNote({ note_type: 'memo', title: null, content_plain: content, content_json: null, arc_id: null, project_id: null });
    await get().loadMemos();
    return id;
  },

  createDocument: async (title, arc_id = null, project_id = null) => {
    const id = await db.createNote({ note_type: 'document', title, content_plain: null, content_json: null, arc_id, project_id });
    await get().loadDocuments();
    return id;
  },

  updateMemo: async (id, content) => {
    await db.updateNote(id, { content_plain: content });
    await get().loadMemos();
  },

  updateDocument: async (id, title, contentJson) => {
    await db.updateNote(id, { title, content_json: contentJson });
    await get().loadDocuments();
  },

  archiveMemo: async (id) => {
    await db.archiveNote(id);
    await get().loadMemos();
    await get().loadArchivedMemos();
  },

  restoreMemo: async (id) => {
    await db.updateNote(id, { status: 'active' });
    await get().loadArchivedMemos();
    await get().loadMemos();
  },

  deleteNote: async (id) => {
    await db.deleteNote(id);
    await get().loadMemos();
    await get().loadDocuments();
  },

  promoteToDoc: async (id, title, contentJson) => {
    await db.promoteToDocument(id, title, contentJson);
    await get().loadMemos();
    await get().loadDocuments();
  },
}));
