import { useState, useEffect, useCallback } from 'react';
import { getAllProjects, getAllArcs } from '../ProjectsPlugin/lib/projectsDb';
import type { Project, Arc } from '../ProjectsPlugin/lib/projectsDb';
import {
  loadAcademicSubjectIds,
  addAcademicSubject,
  removeAcademicSubject,
  loadNodesForProjects,
  loadCompletionHistories,
} from './lib/academicDb';
import type { AcademicNode, CompletionPoint } from './lib/academicDb';
import usePluginStore from '@/store/usePluginStore';
import DashboardView from './views/DashboardView';
import MultiCanvasView from './views/MultiCanvasView';
import './AcademicPlugin.css';

const VT = "'VT323', 'HBIOS-SYS', monospace";
const ACC = '#f59e0b';

export default function AcademicPlugin() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [subjectIds, setSubjectIds] = useState<string[]>([]);
  const [nodeMap, setNodeMap] = useState<Map<string, AcademicNode[]>>(new Map());
  const [historyMap, setHistoryMap] = useState<Map<string, CompletionPoint[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [multiCanvasOpen, setMultiCanvasOpen] = useState(false);
  const activePlugin = usePluginStore(s => s.activePlugin);

  const load = useCallback(async () => {
    const [projs, arcsData, ids] = await Promise.all([
      getAllProjects(),
      getAllArcs(),
      loadAcademicSubjectIds(),
    ]);
    const [nm, hm] = await Promise.all([
      loadNodesForProjects(ids),
      loadCompletionHistories(ids),
    ]);
    setProjects(projs);
    setArcs(arcsData);
    setSubjectIds(ids);
    setNodeMap(nm);
    setHistoryMap(hm);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (activePlugin === 'academic') load();
  }, [activePlugin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = () => { load(); };
    window.addEventListener('planner:node-changed', handler);
    return () => window.removeEventListener('planner:node-changed', handler);
  }, [load]);

  const handleAddSubject = async (projectId: string) => {
    await addAcademicSubject(projectId);
    const newIds = [...subjectIds, projectId];
    const [nm, hm] = await Promise.all([
      loadNodesForProjects(newIds),
      loadCompletionHistories(newIds),
    ]);
    setSubjectIds(newIds);
    setNodeMap(nm);
    setHistoryMap(hm);
  };

  const handleRemoveSubject = async (projectId: string) => {
    await removeAcademicSubject(projectId);
    const newIds = subjectIds.filter(id => id !== projectId);
    const [nm, hm] = await Promise.all([
      loadNodesForProjects(newIds),
      loadCompletionHistories(newIds),
    ]);
    setSubjectIds(newIds);
    setNodeMap(nm);
    setHistoryMap(hm);
  };

  if (loading) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#000', fontFamily: VT, color: 'rgba(255,255,255,0.2)',
        fontSize: '1rem', letterSpacing: 2,
      }}>
        loading...
      </div>
    );
  }

  const subjects = projects.filter(p => subjectIds.includes(p.id));

  return (
    <div className="academic-plugin" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '60px 160px 0', background: '#000', flexShrink: 0 }}>
        <div style={{ fontFamily: VT, fontSize: '2rem', letterSpacing: 5, color: ACC, textTransform: 'uppercase', lineHeight: 1, marginBottom: 20 }}>
          academic planner
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {multiCanvasOpen ? (
          <MultiCanvasView
            subjects={subjects}
            arcs={arcs}
            nodeMap={nodeMap}
            onBack={() => setMultiCanvasOpen(false)}
            onRefresh={load}
          />
        ) : (
          <DashboardView
            subjects={subjects}
            arcs={arcs}
            allProjects={projects}
            subjectIds={subjectIds}
            nodeMap={nodeMap}
            historyMap={historyMap}
            onAddSubject={handleAddSubject}
            onRemoveSubject={handleRemoveSubject}
            onRefresh={load}
            onViewAllCanvases={() => setMultiCanvasOpen(true)}
          />
        )}
      </div>
    </div>
  );
}
