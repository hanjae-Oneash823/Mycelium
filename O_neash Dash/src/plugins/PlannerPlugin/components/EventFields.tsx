import React from 'react';
import DatePickerField from './DatePickerField';
import HoursInput from './HoursInput';

interface EventFieldsProps {
  eventDate: Date | null;
  setEventDate: (d: Date | null) => void;
  eventTime: string;
  setEventTime: (t: string) => void;
  durationHours: number;
  setDurationHours: (v: number) => void;
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="font-mono text-[10px] tracking-[2px] uppercase text-[rgba(255,255,255,0.35)] mb-1">
    {children}
  </p>
);

export default function EventFields({
  eventDate, setEventDate,
  eventTime, setEventTime,
  durationHours, setDurationHours,
}: EventFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>DATE</FieldLabel>
          <DatePickerField value={eventDate} onChange={setEventDate} placeholder="event date" />
        </div>
        <div>
          <FieldLabel>TIME</FieldLabel>
          <input
            type="time"
            value={eventTime}
            onChange={e => setEventTime(e.target.value)}
            className="flex h-9 w-full bg-transparent border border-[rgba(255,255,255,0.2)] text-white font-mono text-sm px-3 py-1 focus:outline-none focus:border-[#c084fc] focus-visible:ring-0"
            style={{ colorScheme: 'dark' }}
          />
        </div>
      </div>
      <HoursInput value={durationHours} onChange={setDurationHours} />
    </div>
  );
}
