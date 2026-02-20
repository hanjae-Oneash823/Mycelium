import { useState, useEffect } from 'react';
import './NotesPlugin.css';
import GroupGrid from './GroupGrid';
import GroupCreator from './GroupCreator';
import NotesView from './NotesView';
import ConfirmDialog from './ConfirmDialog';
import { BaseDirectory, readTextFile, writeTextFile, exists, mkdir } from '@tauri-apps/plugin-fs';

const DEFAULT_GROUPS = [
  { id: 'quick-notes', name: 'quick notes', color: '#4A90E2' },
  { id: 'shopping-list', name: 'shopping list', color: '#5B9BD5' },
  { id: 'ideas', name: 'ideas', color: '#7BA3CC' },
];

/**
 * NotesPlugin - Multi-group note-taking system with force-directed graphs
 */
function NotesPlugin() {
  const [view, setView] = useState('grid'); // 'grid' or 'notes'
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Load groups from file on mount
  useEffect(() => {
    const loadGroups = async () => {
      try {
        console.log('Initializing notes plugin...');
        // Ensure notes directory exists
        const dirExists = await exists('notes', { baseDir: BaseDirectory.AppData });
        console.log('Notes directory exists:', dirExists);
        if (!dirExists) {
          console.log('Creating notes directory...');
          await mkdir('notes', { baseDir: BaseDirectory.AppData });
        }

        // Try to load groups file
        const groupsFileExists = await exists('notes/groups.json', { baseDir: BaseDirectory.AppData });
        if (groupsFileExists) {
          const data = await readTextFile('notes/groups.json', { baseDir: BaseDirectory.AppData });
          const loadedGroups = JSON.parse(data);
          setGroups(loadedGroups);
        } else {
          // Save default groups
          await writeTextFile('notes/groups.json', JSON.stringify(DEFAULT_GROUPS, null, 2), { baseDir: BaseDirectory.AppData });
        }
        setIsInitialLoad(false);
      } catch (error) {
        console.error('Failed to load groups:', error);
        setIsInitialLoad(false);
      }
    };
    loadGroups();
  }, []);

  // Save groups whenever they change (after initial load)
  useEffect(() => {
    if (isInitialLoad) return;
    
    const saveGroups = async () => {
      try {
        await writeTextFile('notes/groups.json', JSON.stringify(groups, null, 2), { baseDir: BaseDirectory.AppData });
      } catch (error) {
        console.error('Failed to save groups:', error);
      }
    };
    if (groups.length > 0) {
      saveGroups();
    }
  }, [groups, isInitialLoad]);

  const handleGroupSelect = (group) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setSelectedGroup(group);
      setView('notes');
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };

  const handleBackToGrid = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setView('grid');
      setSelectedGroup(null);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };

  const handleCreateGroup = () => {
    setIsCreatorOpen(true);
  };

  const handleSaveGroup = (groupData) => {
    const newGroup = {
      ...groupData,
      id: groupData.name.toLowerCase().replace(/\s+/g, '-'),
    };
    setGroups([...groups, newGroup]);
    setIsCreatorOpen(false);
  };

  const handleCloseCreator = () => {
    setIsCreatorOpen(false);
  };

  const handleDeleteGroup = (groupId) => {
    console.log('Attempting to delete group:', groupId);
    setConfirmDelete(groupId);
  };

  const handleConfirmDelete = () => {
    if (confirmDelete) {
      console.log('Confirmed deletion of:', confirmDelete);
      const updatedGroups = groups.filter(g => g.id !== confirmDelete);
      console.log('Updated groups:', updatedGroups);
      setGroups(updatedGroups);
      setConfirmDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setConfirmDelete(null);
  };

  return (
    <>
      <div className={`notes-page page-transition ${isTransitioning ? 'transitioning' : ''}`}>
        {view === 'grid' ? (
          <GroupGrid 
            groups={groups}
            onGroupSelect={handleGroupSelect}
            onCreateGroup={handleCreateGroup}
            onDeleteGroup={handleDeleteGroup}
          />
        ) : (
          <NotesView 
            group={selectedGroup}
            onBack={handleBackToGrid}
          />
        )}
      </div>

      {isCreatorOpen && (
        <GroupCreator
          onSave={handleSaveGroup}
          onClose={handleCloseCreator}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Are you sure you want to delete this group? All notes in this group will be deleted."
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      )}
    </>
  );
}

export default NotesPlugin;
