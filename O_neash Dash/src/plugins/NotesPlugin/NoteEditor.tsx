import { useState, useEffect } from 'react';
import type { Note, NoteData } from '@/types';
import LinkedTasksPanel from './LinkedTasksPanel';

interface NoteEditorProps {
  note: Note | null;
  groupId: string;
  onSave: (noteData: NoteData) => void;
  onDelete: (noteId: number) => void;
  onClose: () => void;
}

/**
 * NoteEditor - Inline editor for creating/editing notes
 */
function NoteEditor({ note, groupId, onSave, onDelete, onClose }: NoteEditorProps) {
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (note) {
      setTitle(note.title || '');
      setContent(note.content || '');
    } else {
      setTitle('');
      setContent('');
    }
  }, [note]);

  const handleSave = () => {
    onSave({ title, content });
  };

  const handleDelete = () => {
    if (note) {
      onDelete(note.id);
    }
  };

  const compositeNoteId = note ? `${groupId}:${note.id}` : null;

  return (
    <div className="note-editor-inline">
      <div className="note-editor-header">
        <input
          type="text"
          className="note-title-input"
          placeholder="note title..."
          value={title}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="note-editor-body">
        <textarea
          className="note-content-input"
          placeholder="write your note here... use #tags to categorize"
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
        />
      </div>

      <div className="note-editor-footer">
        <div className="note-editor-actions-left">
          {note && (
            <button className="note-delete-btn" onClick={handleDelete}>
              delete
            </button>
          )}
        </div>
        <div className="note-editor-actions-right">
          <button className="note-cancel-btn" onClick={onClose}>
            close
          </button>
          <button className="note-save-btn" onClick={handleSave}>
            save
          </button>
        </div>
      </div>

      {compositeNoteId && <LinkedTasksPanel compositeNoteId={compositeNoteId} />}
    </div>
  );
}

export default NoteEditor;
