import React, { useEffect, useState, useRef } from 'react';
import styles from './SettingsModal.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsModal({ open, onClose }: Props) {
  const DEFAULT = '#229ed9';
  const DEFAULT_FONT_SIZE = 15;
  const [color, setColor] = useState<string>(DEFAULT);
  const [tempColor, setTempColor] = useState<string>(DEFAULT);
  const [showPopover, setShowPopover] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_FONT_SIZE);
  // HSV state for custom picker
  const [hsv, setHsv] = useState<{ h: number; s: number; v: number }>({ h: 200, s: 0.6, v: 0.86 });
  const svRef = useRef<HTMLDivElement | null>(null);
  const hueRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('chatMessageColor') : null;
      if (stored) {
        setColor(stored);
        setTempColor(stored);
      }
      else {
        setColor(DEFAULT);
        setTempColor(DEFAULT);
      }
      const storedFontSize = typeof window !== 'undefined' ? localStorage.getItem('chatFontSize') : null;
      if (storedFontSize) {
        setFontSize(parseInt(storedFontSize, 10));
      } else {
        setFontSize(DEFAULT_FONT_SIZE);
      }
    } catch (e) {}
  }, [open]);

  const applyColor = (c: string) => {
    try {
      localStorage.setItem('chatMessageColor', c);
    } catch (e) {}
    // Notify other components
    try {
      window.dispatchEvent(new CustomEvent('chat-color-changed', { detail: c }));
    } catch (e) {}
    setColor(c);
    setTempColor(c);
  };

  const applyFontSize = (size: number) => {
    try {
      localStorage.setItem('chatFontSize', size.toString());
    } catch (e) {}
    setFontSize(size);
    // Notify other components
    try {
      window.dispatchEvent(new CustomEvent('chat-font-size-changed', { detail: size }));
    } catch (e) {}
  };

  const resetColor = () => {
    applyColor(DEFAULT);
  };

  // keep a CSS variable on :root in sync so components/CSS can use var(--chat-accent)
  useEffect(() => {
    try {
      const initial = typeof window !== 'undefined' ? localStorage.getItem('chatMessageColor') : null;
      if (initial) {
        document.documentElement.style.setProperty('--chat-accent', initial);
        // light shadow tint
        document.documentElement.style.setProperty('--chat-accent-shadow', initial + '33');
      }
      const initialFontSize = typeof window !== 'undefined' ? localStorage.getItem('chatFontSize') : null;
      if (initialFontSize) {
        document.documentElement.style.setProperty('--chat-font-size', initialFontSize + 'px');
      }
    } catch (e) {}
  }, []);

  // update CSS var whenever color changes locally
  useEffect(() => {
    try {
      if (color) {
        document.documentElement.style.setProperty('--chat-accent', color);
        document.documentElement.style.setProperty('--chat-accent-shadow', color + '33');
      }
      if (fontSize) {
        document.documentElement.style.setProperty('--chat-font-size', fontSize + 'px');
      }
    } catch (e) {}
  }, [color, fontSize]);

  // sync hsv when tempColor changes (convert hex -> hsv)
  useEffect(() => {
    try {
      const rgb = hexToRgb(tempColor);
      if (rgb) {
        const _hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        setHsv(_hsv);
      }
    } catch (e) {}
  }, [tempColor]);

  // small helpers: hex <-> rgb <-> hsv
  function clamp(v: number, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }

  function hexToRgb(hex: string) {
    if (!hex) return null;
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
  }

  function rgbToHex(r: number, g: number, b: number) {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function rgbToHsv(r:number,g:number,b:number){
    r/=255; g/=255; b/=255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h=0, s=0, v=max;
    const d = max-min;
    s = max === 0 ? 0 : d/max;
    if (max === min) h = 0;
    else {
      switch(max){
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: h*360, s, v };
  }

  function hsvToRgb(h:number,s:number,v:number){
    h = (h % 360 + 360) % 360;
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function hsvToHex(h:number,s:number,v:number){
    const { r, g, b } = hsvToRgb(h,s,v);
    return rgbToHex(r,g,b);
  }

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={styles.modal}>
        <div className={styles.title}>Настройки</div>

        <div className={styles.section}>
          <div className={styles.label}>Цвет сообщений</div>

          <div className={styles.pickerRow}>
            <div className={styles.preview}>
              <div className={styles.previewBubble} style={{ background: tempColor }}>
                <button
                  type="button"
                  className={styles.editIcon}
                  aria-label="Открыть выбор цвета"
                  onClick={() => setShowPopover((s) => !s)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" fill="#fff" opacity="0.95"/>
                    <path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.28a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z" fill="#fff" opacity="0.95"/>
                  </svg>
                </button>
              </div>
              <div className={styles.previewMeta}>
                <div className={styles.previewTitle}>Пример сообщения</div>
                <div className={styles.previewSub}>Посмотрите, как будет выглядеть цвет в диалоге</div>
              </div>
            </div>

            <div className={styles.controls}>
              {/* color picker removed per request — only preview + buttons remain */}

              <div className={styles.colorActions}>
                <div className={styles.colorActionsTop}>
                </div>
                <div className={styles.colorActionsBottom}>
                  <button onClick={resetColor} className={`${styles.btn} ${styles.btnReset}`} title="Сбросить цвет">Сброс</button>
                </div>
              </div>
                {/* popover anchored to preview bubble */}
                {showPopover && (
                  <div className={styles.popover} role="dialog" aria-label="Выбор цвета">
                    <div className={styles.popoverInner}>
                      <div className={styles.popoverTitle}>Выбор цвета</div>
                      <div className={styles.popoverBody}>
                        <div className={styles.svPicker} ref={svRef}
                          onPointerDown={(e) => {
                            e.preventDefault();
                            const move = (ev: PointerEvent) => {
                              if (!svRef.current) return;
                              const rect = svRef.current.getBoundingClientRect();
                              const x = ev.clientX - rect.left;
                              const y = ev.clientY - rect.top;
                              const s = clamp(x / rect.width, 0, 1);
                              const v = clamp(1 - (y / rect.height), 0, 1);
                              setHsv(prev => {
                                const next = { ...prev, s, v };
                                setTempColor(hsvToHex(next.h, next.s, next.v));
                                return next;
                              });
                            };
                            const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                            window.addEventListener('pointermove', move);
                            window.addEventListener('pointerup', up);
                            // initial
                            const ev = e.nativeEvent as PointerEvent;
                            move(ev);
                          }}
                        >
                          <div className={styles.svGradient} style={{ background: `hsl(${Math.round(hsv.h)}, 100%, 50%)` }} />
                          <div className={styles.svWhite} />
                          <div className={styles.svBlack} />
                          <div className={styles.svHandle} style={{ left: `${Math.round(hsv.s * 100)}%`, top: `${Math.round((1 - hsv.v) * 100)}%` }} />
                        </div>

                        <div className={styles.hueRow} ref={hueRef} onPointerDown={(e) => {
                          e.preventDefault();
                          const moveH = (ev: PointerEvent) => {
                            if (!hueRef.current) return;
                            const rect = hueRef.current.getBoundingClientRect();
                            const x = clamp(ev.clientX - rect.left, 0, rect.width);
                            const h = (x / rect.width) * 360;
                            setHsv(prev => {
                              const next = { ...prev, h };
                              setTempColor(hsvToHex(next.h, next.s, next.v));
                              return next;
                            });
                          };
                          const upH = () => { window.removeEventListener('pointermove', moveH); window.removeEventListener('pointerup', upH); };
                          window.addEventListener('pointermove', moveH);
                          window.addEventListener('pointerup', upH);
                          moveH(e.nativeEvent as PointerEvent);
                        }}>
                          <div className={styles.hueGradient} />
                          <div className={styles.hueHandle} style={{ left: `${(hsv.h / 360) * 100}%` }} />
                        </div>

                        <div className={styles.popoverControls}>
                          {/* HEX input and presets removed per request — controls area kept minimal */}
                        </div>

                        <div className={styles.popoverActions}>
                          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { applyColor(tempColor); setShowPopover(false); }}>Готово</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.label}>Размер шрифта</div>
          <div className={styles.fontSizeControl}>
            <div className={styles.fontSizeSliderWrapper}>
              <input 
                type="range" 
                min="12" 
                max="20" 
                value={fontSize} 
                onChange={(e) => applyFontSize(parseInt(e.target.value, 10))}
                className={styles.fontSizeSlider}
              />
            </div>
            <div className={styles.fontSizeValue}>{fontSize}px</div>
            <button 
              onClick={() => applyFontSize(DEFAULT_FONT_SIZE)} 
              className={`${styles.btn} ${styles.btnReset}`}
              title="Сбросить размер"
            >
              Сброс
            </button>
          </div>
          <div className={styles.fontSizePreview} style={{ fontSize: `${fontSize}px` }}>
            Пример текста сообщения
          </div>
        </div>

        <div className={styles.modalFooter}>
          <button onClick={onClose} className={`${styles.btn} ${styles.btnPrimary}`}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
