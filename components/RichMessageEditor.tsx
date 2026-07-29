'use client';
import { useRef, useEffect, useState } from 'react';

// Lightweight rich-text editor (bold/italic/underline + inline images) built on
// contentEditable. Images can be resized by clicking them. Images are inserted
// as base64 data URIs; the server turns them into embedded CID attachments.
export function RichMessageEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const selectedImg = useRef<HTMLImageElement | null>(null);
  const savedRange = useRef<Range | null>(null);
  const [selWidth, setSelWidth] = useState<number | null>(null); // % width of selected image, null = none

  // Continuously remember the caret position inside the editor so we can restore
  // it after the file picker steals focus, and insert the image right there.
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && ref.current && ref.current.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  // Serialize WITHOUT the transient selection outline/class so it never leaks
  // into the sent email, and images stay responsive.
  function readClean(el: HTMLElement): string {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img').forEach((img) => {
      img.classList.remove('sel-img');
      if (!img.getAttribute('class')) img.removeAttribute('class');
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    });
    return clone.innerHTML;
  }

  function emit() {
    if (ref.current) onChange(readClean(ref.current));
  }

  // Only rewrite the DOM when the cleaned content genuinely differs (e.g. cleared
  // after send). Comparing the CLEANED html means typing/selecting never triggers
  // a rewrite — which is what would otherwise reset the caret or drop the image.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (readClean(el) !== value) {
      el.innerHTML = value;
      selectedImg.current = null;
      setSelWidth(null);
    }
  }, [value]);

  function exec(cmd: string) {
    document.execCommand(cmd, false);
    ref.current?.focus();
    emit();
  }

  function insertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2 MB.'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => {
      ref.current?.focus();
      // Restore the caret to where it was before the file dialog stole focus.
      const sel = window.getSelection();
      if (savedRange.current && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange.current);
      }
      document.execCommand('insertImage', false, reader.result as string);
      emit();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function selectImage(img: HTMLImageElement | null) {
    if (selectedImg.current) selectedImg.current.classList.remove('sel-img');
    selectedImg.current = img;
    if (img) {
      img.classList.add('sel-img');
      const w = img.style.width;
      setSelWidth(w.endsWith('%') ? parseInt(w) : 100);
    } else {
      setSelWidth(null);
    }
  }

  function onEditorClick(e: React.MouseEvent) {
    const t = e.target as HTMLElement;
    selectImage(t.tagName === 'IMG' ? (t as HTMLImageElement) : null);
  }

  function resizeImg(pct: number) {
    const img = selectedImg.current;
    if (!img) return;
    img.style.width = `${pct}%`;
    img.style.height = 'auto';
    setSelWidth(pct);
    emit();
  }

  const btn = 'w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-maroon-400 hover:text-maroon-700 dark:hover:text-maroon-400 active:scale-95 transition-all text-sm flex items-center justify-center';

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
      <div className="flex items-center gap-1 p-1.5 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} className={`${btn} font-bold`} title="Bold">B</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} className={`${btn} italic`} title="Italic">I</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')} className={`${btn} underline`} title="Underline">U</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className={btn} title="Bullet list">•</button>
        <span className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <label className={`${btn} cursor-pointer`} title="Insert image">
          🖼️
          <input type="file" accept="image/*" onChange={insertImage} className="hidden" />
        </label>
      </div>

      {selWidth !== null && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-100 dark:border-slate-700 bg-maroon-50/60 dark:bg-maroon-950/20 flex-wrap">
          <span className="text-[11px] font-semibold text-maroon-700 dark:text-maroon-400">Image size</span>
          <input type="range" min={10} max={100} value={selWidth} onChange={(e) => resizeImg(Number(e.target.value))} className="flex-1 min-w-[100px] accent-maroon-600" />
          <span className="text-[11px] text-slate-500 w-9 text-right">{selWidth}%</span>
          {[25, 50, 75, 100].map((p) => (
            <button key={p} type="button" onClick={() => resizeImg(p)}
              className="text-[11px] font-semibold px-2 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-maroon-400">
              {p}%
            </button>
          ))}
        </div>
      )}

      <div
        ref={ref}
        contentEditable
        onInput={emit}
        onClick={onEditorClick}
        suppressContentEditableWarning
        className="min-h-[160px] max-h-[400px] overflow-y-auto px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-1 [&_img]:cursor-pointer [&_img.sel-img]:[outline:2px_solid_#9d1530] [&_img.sel-img]:[outline-offset:2px]"
      />
    </div>
  );
}
