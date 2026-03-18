import React from 'react';
import QuickFields, { QuickFieldsProps } from './QuickFields';
import { usePlannerStore } from '../store/usePlannerStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ProjectFieldsProps extends QuickFieldsProps {
  arcId: string | null;
  setArcId: (id: string | null) => void;
  projectId: string | null;
  setProjectId: (id: string | null) => void;
}

// Cast shadcn components that lack proper generic types due to untyped forwardRef
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedSelectTrigger = SelectTrigger as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedSelectContent = SelectContent as React.FC<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedSelectItem = SelectItem as React.FC<any>;

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[10px] tracking-[2px] uppercase text-[rgba(255,255,255,0.35)] mb-1">
    {children}
  </p>
);

export default function ProjectFields({
  dueAt, setDueAt,
  plannedAt, setPlannedAt,
  effortHours, setEffortHours,
  arcId, setArcId,
  projectId, setProjectId,
}: ProjectFieldsProps) {
  const { arcs, projects } = usePlannerStore();
  const filteredProjects = projects.filter(p => p.arc_id === arcId);

  return (
    <div className="flex flex-col gap-3">
      <QuickFields
        dueAt={dueAt} setDueAt={setDueAt}
        plannedAt={plannedAt} setPlannedAt={setPlannedAt}
        effortHours={effortHours} setEffortHours={setEffortHours}
      />

      <div className="border-l-2 border-[rgba(0,196,167,0.35)] pl-3 flex flex-col gap-3">
        <div>
          <FieldLabel>ARC</FieldLabel>
          <Select
            value={arcId ?? ''}
            onValueChange={(v: string) => {
              setArcId(v || null);
              setProjectId(null);
            }}
          >
            <TypedSelectTrigger className="rounded-none bg-transparent border-[rgba(255,255,255,0.09)] font-mono text-sm text-[rgba(255,255,255,0.62)] focus:ring-0 h-9">
              <SelectValue placeholder="select an arc" />
            </TypedSelectTrigger>
            <TypedSelectContent className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
              {arcs.filter(a => !a.is_archived).map(arc => (
                <TypedSelectItem key={arc.id} value={arc.id} className="font-mono text-sm">
                  {arc.name}
                </TypedSelectItem>
              ))}
            </TypedSelectContent>
          </Select>
        </div>

        <div>
          <FieldLabel>PROJECT</FieldLabel>
          <Select
            value={projectId ?? ''}
            onValueChange={(v: string) => setProjectId(v || null)}
            disabled={!arcId}
          >
            <TypedSelectTrigger className="rounded-none bg-transparent border-[rgba(255,255,255,0.09)] font-mono text-sm text-[rgba(255,255,255,0.62)] focus:ring-0 h-9 disabled:opacity-40">
              <SelectValue placeholder={arcId ? 'select a project' : 'select an arc first'} />
            </TypedSelectTrigger>
            <TypedSelectContent className="bg-black border-[rgba(255,255,255,0.09)] rounded-none">
              {filteredProjects.filter(p => !p.is_archived).map(proj => (
                <TypedSelectItem key={proj.id} value={proj.id} className="font-mono text-sm">
                  {proj.name}
                </TypedSelectItem>
              ))}
            </TypedSelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
