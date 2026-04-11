import { create } from 'zustand';
import type { CommentRow } from '../lib/notesDb';
import { loadComments, createComment, deleteComment, updateComment } from '../lib/notesDb';

interface CommentsStore {
  comments:  CommentRow[];
  activeId:  string | null;
  load:      (docId: string) => Promise<void>;
  add:       (docId: string, markId: string, body: string) => Promise<string>;
  remove:    (id: string) => Promise<void>;
  update:    (id: string, body: string) => Promise<void>;
  setActive: (id: string | null) => void;
}

export const useCommentsStore = create<CommentsStore>((set, get) => ({
  comments:  [],
  activeId:  null,
  load: async (docId) => {
    const comments = await loadComments(docId);
    set({ comments });
  },
  add: async (docId, markId, body) => {
    const id = await createComment(docId, markId, body);
    await get().load(docId);
    return id;
  },
  remove: async (id) => {
    await deleteComment(id);
    set(s => ({ comments: s.comments.filter(c => c.id !== id) }));
  },
  update: async (id, body) => {
    await updateComment(id, body);
    set(s => ({ comments: s.comments.map(c => c.id === id ? { ...c, body } : c) }));
  },
  setActive: (id) => set({ activeId: id }),
}));
