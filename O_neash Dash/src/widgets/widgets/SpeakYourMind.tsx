import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import { Smile } from 'pixelarticons/react/Smile';
import { createNote } from '../../plugins/NotesPlugin/lib/notesDb';
import type { WidgetProps } from '../types';

const ACC  = '#f5c842';
const FONT = "'VT323', monospace";

// ── Animated placeholder (exact copy from MemoPool) ───────────────────────────

const PLACEHOLDER_CHARS = "speak your mind".split('');
const STAGGER           = 0.045;
const CHAR_DUR          = 0.22;
const STAGGER_TOTAL     = PLACEHOLDER_CHARS.length * STAGGER + CHAR_DUR + 0.05;

function AnimatedPlaceholder({ visible }: { visible: boolean }) {
  const [waving, setWaving] = useState(false);

  useEffect(() => {
    if (!visible) { setWaving(false); return; }
    const t = setTimeout(() => setWaving(true), STAGGER_TOTAL * 1000);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex', pointerEvents: 'none',
            fontFamily: FONT, fontSize: '1rem', letterSpacing: 1,
          }}
        >
          {PLACEHOLDER_CHARS.map((ch, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={waving ? {
                y:       [0, -3, 0],
                opacity: ch === ' ' ? 0 : [0.5, 0.8, 0.5],
              } : {
                opacity: ch === ' ' ? 0 : 0.65,
                y: 0,
              }}
              transition={waving ? {
                y:       { duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09, repeatDelay: 2 },
                opacity: { duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09, repeatDelay: 2 },
              } : {
                delay: i * STAGGER, duration: CHAR_DUR, ease: 'easeOut',
              }}
              style={{ display: 'inline-block', color: 'rgba(255,255,255,0.65)' }}
            >
              {ch === ' ' ? '\u00a0' : ch}
            </motion.span>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Bare input (reusable, no widget chrome) ───────────────────────────────────

export function SpeakYourMindInput() {
  const [input,    setInput]    = useState('');
  const [focused,  setFocused]  = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [launchItem, setLaunchItem] = useState<{ text: string; x: number; y: number } | null>(null);
  const boxRef    = useRef<HTMLDivElement>(null);
  const squishCtrl = useAnimationControls();

  async function handleSubmit() {
    const text = input.trim();
    if (!text) return;
    const rect = boxRef.current?.getBoundingClientRect();
    const lx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const ly = rect ? rect.top  + rect.height / 2 : window.innerHeight / 2;
    squishCtrl.start({
      scaleY: [1, 0.78, 1.07, 1],
      scaleX: [1, 1.05, 0.97, 1],
      transition: { duration: 0.42, times: [0, 0.28, 0.65, 1], ease: 'easeOut' },
    });
    setLaunchItem({ text, x: lx, y: ly });
    setInput('');
    await createNote({
      note_type:     'memo',
      title:         null,
      content_plain: text,
      content_json:  null,
      arc_id:        null,
      project_id:    null,
    });
  }

  return (
    <div style={{ width: '100%', fontFamily: FONT }}>
      {launchItem && createPortal(
        <motion.div
          initial={{ opacity: 1, scale: 1, y: 0 }}
          animate={{ opacity: 0, scale: 0.55, y: -260 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => setLaunchItem(null)}
          style={{
            position: 'fixed', left: launchItem.x, top: launchItem.y,
            translateX: '-50%', translateY: '-50%',
            fontFamily: FONT, fontSize: '1.2rem', letterSpacing: 1,
            color: ACC, textShadow: `0 0 22px ${ACC}99`,
            pointerEvents: 'none', zIndex: 9999, whiteSpace: 'nowrap',
          }}
        >
          {launchItem.text}
        </motion.div>,
        document.body
      )}

      <motion.div ref={boxRef} animate={squishCtrl} style={{ width: '100%' }}>
        <motion.div
          animate={{
            borderColor:     focused ? 'rgba(0,196,167,0.55)' : 'rgba(255,255,255,0.2)',
            backgroundColor: focused ? 'rgba(0,12,10,0.96)'   : 'rgba(0,0,0,0.92)',
          }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: 'flex', alignItems: 'stretch', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden', width: '100%' }}
        >
          <AnimatePresence>
            <motion.div
              key={pulseKey}
              initial={{ opacity: 1 }} animate={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              style={{ position: 'absolute', inset: -1, border: '2px solid rgba(0,196,167,1)', boxShadow: '0 0 18px rgba(0,196,167,0.55), inset 0 0 12px rgba(0,196,167,0.15)', pointerEvents: 'none', zIndex: 10 }}
            />
          </AnimatePresence>

          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <AnimatedPlaceholder visible={!focused && !input} />
            <input
              value={input}
              onChange={e => { setInput(e.target.value); setPulseKey(k => k + 1); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder=""
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: 'rgba(255,255,255,0.72)', fontFamily: FONT,
                fontSize: '1rem', padding: '5px 10px', letterSpacing: 1, outline: 'none', width: '100%',
              }}
            />
          </div>

          <button
            onClick={handleSubmit}
            style={{
              background: 'none', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.14)',
              color: 'rgba(255,255,255,0.4)', padding: '0 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'flex', alignItems: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              </svg>
            </motion.div>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Widget ─────────────────────────────────────────────────────────────────────

export function SpeakYourMind({ }: WidgetProps) {
  const [input,    setInput]    = useState('');
  const [focused,  setFocused]  = useState(false);
  const [pulseKey, setPulseKey] = useState(0);
  const [launchItem, setLaunchItem] = useState<{ text: string; x: number; y: number } | null>(null);
  const boxRef    = useRef<HTMLDivElement>(null);
  const squishCtrl = useAnimationControls();

  async function handleSubmit() {
    const text = input.trim();
    if (!text) return;

    const rect = boxRef.current?.getBoundingClientRect();
    const lx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const ly = rect ? rect.top  + rect.height / 2 : window.innerHeight / 2;

    squishCtrl.start({
      scaleY: [1, 0.78, 1.07, 1],
      scaleX: [1, 1.05, 0.97, 1],
      transition: { duration: 0.42, times: [0, 0.28, 0.65, 1], ease: 'easeOut' },
    });
    setLaunchItem({ text, x: lx, y: ly });
    setInput('');

    await createNote({
      note_type:     'memo',
      title:         null,
      content_plain: text,
      content_json:  null,
      arc_id:        null,
      project_id:    null,
    });
  }

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: FONT,
      padding: '32px 18px 0',
      boxSizing: 'border-box',
      gap: 10,
    }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 8, left: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Smile width={18} height={18} style={{ color: ACC }} />
        <span style={{ fontSize: '1.05rem', letterSpacing: '2px', color: ACC, lineHeight: 1 }}>
          SPEAK-YOUR-MIND
        </span>
      </div>

      {/* Launch ghost */}
      {launchItem && createPortal(
        <motion.div
          initial={{ opacity: 1, scale: 1, y: 0 }}
          animate={{ opacity: 0, scale: 0.55, y: -260 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => setLaunchItem(null)}
          style={{
            position: 'fixed',
            left: launchItem.x, top: launchItem.y,
            translateX: '-50%', translateY: '-50%',
            fontFamily: FONT, fontSize: '1.2rem', letterSpacing: 1,
            color: ACC,
            textShadow: `0 0 22px ${ACC}99`,
            pointerEvents: 'none', zIndex: 9999,
            whiteSpace: 'nowrap',
          }}
        >
          {launchItem.text}
        </motion.div>,
        document.body
      )}

      {/* Input box */}
      <motion.div ref={boxRef} animate={squishCtrl} style={{ width: focused ? '90%' : '80%', transition: 'width 0.3s cubic-bezier(0.22, 1, 0.36, 1)' }}>
        <motion.div
          animate={{
            borderColor:     focused ? 'rgba(0,196,167,0.55)' : 'rgba(255,255,255,0.2)',
            backgroundColor: focused ? 'rgba(0,12,10,0.96)' : 'rgba(0,0,0,0.92)',
          }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          style={{
            display: 'flex', alignItems: 'stretch',
            border: '1px solid rgba(255,255,255,0.2)',
            overflow: 'hidden', width: '100%',
          }}
        >
          {/* Keystroke pulse */}
          <AnimatePresence>
            <motion.div
              key={pulseKey}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut' }}
              style={{
                position: 'absolute', inset: -1,
                border: '2px solid rgba(0,196,167,1)',
                boxShadow: '0 0 18px rgba(0,196,167,0.55), inset 0 0 12px rgba(0,196,167,0.15)',
                pointerEvents: 'none', zIndex: 10,
              }}
            />
          </AnimatePresence>

          {/* Input + animated placeholder */}
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <AnimatedPlaceholder visible={!focused && !input} />
            <input
              value={input}
              onChange={e => { setInput(e.target.value); setPulseKey(k => k + 1); }}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder=""
              style={{
                flex: 1, background: 'transparent', border: 'none',
                color: 'rgba(255,255,255,0.72)', fontFamily: FONT,
                fontSize: '1rem', padding: '5px 10px', letterSpacing: 1, outline: 'none',
                width: '100%',
              }}
            />
          </div>

          {/* Bouncing arrow button */}
          <button
            onClick={handleSubmit}
            style={{
              background: 'none', border: 'none',
              borderLeft: '1px solid rgba(255,255,255,0.14)',
              color: 'rgba(255,255,255,0.4)',
              padding: '0 14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
          >
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ display: 'flex', alignItems: 'center' }}
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 13V3M3 8l5-5 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
              </svg>
            </motion.div>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}
