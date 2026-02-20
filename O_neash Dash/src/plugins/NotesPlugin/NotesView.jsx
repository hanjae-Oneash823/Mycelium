import { useState, useEffect } from 'react';
import ForceGraph from './ForceGraph';
import NoteEditor from './NoteEditor';
import NotesList from './NotesList';
import ConfirmDialog from './ConfirmDialog';
import { BaseDirectory, readTextFile, writeTextFile, exists, readDir, mkdir, remove } from '@tauri-apps/plugin-fs';

/**
 * NotesView - The force-directed graph note-taking interface for a specific group
 */
function NotesView({ group, onBack }) {
  const [notes, setNotes] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Get directory path for this group
  const getGroupDir = () => `notes/${group.id}`;

  // Load notes from individual files on mount
  useEffect(() => {
    const loadNotes = async () => {
      console.log('Loading notes for group:', group.id);
      try {
        const groupDir = getGroupDir();
        console.log('Loading from directory:', groupDir);
        
        // Ensure group directory exists
        const dirExists = await exists(groupDir, { baseDir: BaseDirectory.AppData });
        console.log('Directory exists:', dirExists);
        if (!dirExists) {
          console.log('Creating directory:', groupDir);
          await mkdir(groupDir, { baseDir: BaseDirectory.AppData, recursive: true });
          setNotes([]);
          return;
        }

        // Read all files in group directory
        const entries = await readDir(groupDir, { baseDir: BaseDirectory.AppData });
        console.log('Found entries:', entries.length);
        const loadedNotes = [];

        for (const entry of entries) {
          console.log('Processing entry:', entry.name);
          if (entry.isFile && entry.name.endsWith('.json')) {
            const data = await readTextFile(`${groupDir}/${entry.name}`, { baseDir: BaseDirectory.AppData });
            loadedNotes.push(JSON.parse(data));
          }
        }

        console.log('Loaded notes:', loadedNotes.length);
        setNotes(loadedNotes);
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    };
    loadNotes();
  }, [group]);

  const handleSaveNote = async (noteData) => {
    console.log('handleSaveNote called with:', noteData);
    if (!noteData.title.trim()) {
      alert('Note must have a title');
      return;
    }

    const timestamp = Date.now();
    let updatedNote;
    
    if (selectedNote) {
      // Update existing note
      updatedNote = { ...noteData, id: selectedNote.id, createdAt: selectedNote.createdAt, updatedAt: timestamp, type: 'note' };
      console.log('Updating existing note:', updatedNote);
      setNotes(notes.map(n => n.id === selectedNote.id ? updatedNote : n));
    } else {
      // Create new note
      updatedNote = {
        ...noteData,
        id: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
        type: 'note'
      };
      console.log('Creating new note:', updatedNote);
      setNotes([...notes, updatedNote]);
    }
    
    // Save to individual file
    try {
      const groupDir = getGroupDir();
      console.log('Group directory:', groupDir);
      
      // Ensure directory exists
      const dirExists = await exists(groupDir, { baseDir: BaseDirectory.AppData });
      console.log('Directory exists:', dirExists);
      if (!dirExists) {
        console.log('Creating directory:', groupDir);
        await mkdir(groupDir, { baseDir: BaseDirectory.AppData, recursive: true });
      }
      
      const filePath = `${groupDir}/${updatedNote.id}.json`;
      console.log('Saving to:', filePath);
      await writeTextFile(
        filePath,
        JSON.stringify(updatedNote, null, 2),
        { baseDir: BaseDirectory.AppData }
      );
      console.log('Note saved successfully:', updatedNote.id);
      
      // Verify file was written
      const fileExists = await exists(filePath, { baseDir: BaseDirectory.AppData });
      console.log('File exists after save:', fileExists);
      
      if (!fileExists) {
        throw new Error('File was not created');
      }
    } catch (error) {
      console.error('Failed to save note:', error);
      alert('Failed to save note: ' + error.message);
      return;
    }
    
    setIsEditorOpen(false);
    setSelectedNote(null);
  };

  const handleDeleteNote = async (noteId) => {
    setConfirmDelete(noteId);
  };

  const handleConfirmDeleteNote = async () => {
    if (confirmDelete) {
      setNotes(notes.filter(n => n.id !== confirmDelete));
      
      // Delete file
      try {
        const groupDir = getGroupDir();
        await remove(`${groupDir}/${confirmDelete}.json`, { baseDir: BaseDirectory.AppData });
      } catch (error) {
        console.error('Failed to delete note:', error);
      }
      
      setIsEditorOpen(false);
      setSelectedNote(null);
      setConfirmDelete(null);
    }
  };

  const handleCancelDeleteNote = () => {
    setConfirmDelete(null);
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setSelectedNote(null);
  };

  const handleNoteHover = (noteId) => {
    setFocusedNodeId(noteId);
  };

  const handleCreateNote = () => {
    setSelectedNote(null);
    setIsEditorOpen(true);
  };

  const handleListItemClick = (note) => {
    setSelectedNote(note);
    setIsEditorOpen(true);
  };

  // Filter notes based on search query
  const filteredNotes = notes.filter(note => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const title = (note.title || '').toLowerCase();
    const content = (note.content || '').toLowerCase();
    const tags = content.match(/#\w+/g) || [];
    const tagsString = tags.join(' ').toLowerCase();
    return title.includes(query) || content.includes(query) || tagsString.includes(query);
  });

  return (
    <div className="plugin-notes">
      {/* Back Button - positioned above search bar */}
      <button className="notes-back-btn" onClick={onBack} title="Back to groups">
        ←
      </button>

      {/* Left Column: Search, Graph, Notes List */}
      <div className="notes-left-column">
        <div className="notes-search-container">
          <input
            type="text"
            className="notes-search-input"
            placeholder="Search notes, tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        
        <div className="notes-graph-section">
          <ForceGraph 
            notes={notes}
            focusedNodeId={focusedNodeId}
            highlightedNodes={filteredNotes.map(n => n.id)}
          />
          
          <button 
            className="notes-add-btn"
            onClick={handleCreateNote}
            title="Create new note"
          >
            +
          </button>
        </div>

        <NotesList 
          notes={filteredNotes}
          onNoteClick={handleListItemClick}
          onNoteHover={handleNoteHover}
          groupName={group.name}
        />
      </div>

      {/* Right Column: Editor/Viewer */}
      <div className="notes-right-column">
        {isEditorOpen ? (
          <NoteEditor
            note={selectedNote}
            onSave={handleSaveNote}
            onDelete={handleDeleteNote}
            onClose={handleCloseEditor}
          />
        ) : (
          <div className="notes-empty-state">
            <span className="notes-empty-text">no note open :(</span>
          </div>
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this note?"
          onConfirm={handleConfirmDeleteNote}
          onCancel={handleCancelDeleteNote}
        />
      )}
    </div>
  );
}

export default NotesView;
