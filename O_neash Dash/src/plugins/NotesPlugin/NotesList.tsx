import type { Note } from '@/types';

interface NotesListProps {
  notes: Note[];
  onNoteClick: (note: Note) => void;
  onNoteHover: (noteId: number | null) => void;
  groupName?: string;
  onEditGroup?: () => void;
}

/**
 * NotesList - Scrollable list of notes on the left side
 */
function NotesList({ notes, onNoteClick, onNoteHover, groupName, onEditGroup }: NotesListProps) {
  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const truncateTitle = (title: string, maxLength = 20): string => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  // Sort notes by creation date (newest first)
  const sortedNotes = [...notes].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="notes-list">
      <div className="notes-list-header">
        <div className="notes-list-header-left">
          <span className="notes-list-icon">📝</span>
          {groupName || 'Notes'}
        </div>
        {onEditGroup && (
          <button className="group-edit-btn" onClick={onEditGroup} title="Edit group">
            ✎
          </button>
        )}
      </div>
      <div className="notes-list-items">
        {sortedNotes.map(note => (
          <div
            key={note.id}
            className="notes-list-item"
            onClick={() => onNoteClick(note)}
            onMouseEnter={() => onNoteHover(note.id)}
            onMouseLeave={() => onNoteHover(null)}
          >
            <div className="notes-list-title">
              {truncateTitle(note.title)}
            </div>
            <div className="notes-list-date">
              {formatDate(note.createdAt)}
            </div>
          </div>
        ))}
        {sortedNotes.length === 0 && (
          <div className="notes-list-empty">No notes yet</div>
        )}
      </div>
    </div>
  );
}

export default NotesList;
