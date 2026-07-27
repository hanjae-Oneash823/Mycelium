import { useState } from 'react';
import {
  MAIN_FONT_OPTIONS, KOREAN_FONT_OPTIONS, SCALE_MIN, SCALE_MAX,
  getMainFont, getKoreanFont, setMainFont, setKoreanFont,
  getMainScale, getKoreanScale, setMainScale, setKoreanScale,
  type MainFont, type KoreanFont,
} from '../../../lib/fontSettings';

const FONT   = "var(--font-main), var(--font-kr), monospace";
const ACCENT = '#00c4a7';

function FontRow<T extends string>({
  label, options, selected, onSelect,
}: {
  label: string;
  options: { value: T; label: string; family: string }[];
  selected: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{
        fontFamily: FONT, fontSize: '0.68rem', letterSpacing: '2px',
        color: 'rgba(255,255,255,0.18)', marginBottom: '0.9rem',
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        {options.map(opt => {
          const active = opt.value === selected;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              style={{
                background: active ? 'rgba(0,196,167,0.1)' : 'none',
                border: `1px solid ${active ? ACCENT : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 2,
                padding: '0.6rem 1rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'border-color 0.15s ease, background 0.15s ease',
              }}
            >
              <div style={{
                fontFamily: opt.family + ', monospace',
                fontSize: '1.3rem', lineHeight: 1,
                color: active ? '#fff' : 'rgba(255,255,255,0.7)',
                marginBottom: '0.3rem',
              }}>
                {opt.label}
              </div>
              <div style={{
                fontFamily: FONT, fontSize: '0.62rem', letterSpacing: '1px',
                color: active ? ACCENT : 'rgba(255,255,255,0.22)',
              }}>
                {active ? 'ACTIVE' : 'SELECT'}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SizeScaleRow({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (percent: number) => void;
}) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{
        fontFamily: FONT, fontSize: '0.68rem', letterSpacing: '2px',
        color: 'rgba(255,255,255,0.18)', marginBottom: '0.9rem',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span>{label}</span>
        <span style={{ color: value === 100 ? 'rgba(255,255,255,0.18)' : ACCENT }}>{value}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <input
          type="range"
          className="font-scale-slider"
          min={SCALE_MIN}
          max={SCALE_MAX}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <button
          onClick={() => onChange(100)}
          disabled={value === 100}
          style={{
            all: 'unset', cursor: value === 100 ? 'default' : 'pointer',
            fontFamily: FONT, fontSize: '0.62rem', letterSpacing: '1px',
            color: value === 100 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.4)',
          }}
        >
          RESET
        </button>
      </div>
    </div>
  );
}

export function Appearance() {
  const [mainFont, setMainFontState]     = useState<MainFont>(getMainFont);
  const [koreanFont, setKoreanFontState] = useState<KoreanFont>(getKoreanFont);
  const [mainScale, setMainScaleState]   = useState<number>(getMainScale);
  const [koreanScale, setKoreanScaleState] = useState<number>(getKoreanScale);

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .font-scale-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 3px;
          background: rgba(0,196,167,0.25);
          outline: none;
          cursor: pointer;
        }
        .font-scale-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #00c4a7;
          border: 2px solid rgba(255,255,255,0.6);
          cursor: pointer;
        }
        .font-scale-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #00c4a7;
          border: 2px solid rgba(255,255,255,0.6);
          cursor: pointer;
        }
      `}</style>
      <FontRow
        label="MAIN FONT"
        options={MAIN_FONT_OPTIONS}
        selected={mainFont}
        onSelect={value => { setMainFont(value); setMainFontState(value); }}
      />
      <SizeScaleRow
        label="MAIN FONT SIZE"
        value={mainScale}
        onChange={value => { setMainScale(value); setMainScaleState(value); }}
      />
      <FontRow
        label="KOREAN FALLBACK"
        options={KOREAN_FONT_OPTIONS}
        selected={koreanFont}
        onSelect={value => { setKoreanFont(value); setKoreanFontState(value); }}
      />
      <SizeScaleRow
        label="KOREAN FALLBACK SIZE"
        value={koreanScale}
        onChange={value => { setKoreanScale(value); setKoreanScaleState(value); }}
      />

      <div style={{
        fontFamily: FONT, fontSize: '0.68rem', letterSpacing: '2px',
        color: 'rgba(255,255,255,0.18)', marginBottom: '0.9rem',
      }}>
        PREVIEW
      </div>
      <div style={{
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2,
        padding: '1rem 1.2rem', fontFamily: FONT,
      }}>
        <div style={{ fontSize: '1.4rem', color: 'rgba(255,255,255,0.85)', marginBottom: '0.4rem' }}>
          The quick brown fox jumps 0123
        </div>
        <div style={{ fontSize: '1.4rem', color: 'rgba(255,255,255,0.85)' }}>
          다람쥐 헌 쳇바퀴에 타고파 — 한글 미리보기
        </div>
      </div>
    </div>
  );
}
