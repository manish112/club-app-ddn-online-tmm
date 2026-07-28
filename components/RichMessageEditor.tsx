'use client';
import { useRef } from 'react';

// Lightweight rich-text editor (bold/italic/underline + inline images) built on
// contentEditable. Images are inserted as base64 data URIs; the server turns
// them into embedded CID attachments on send.
export function RichMessageEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  function emit() {
    const el = ref.current;
    if (!el) return;
    // Keep images responsive in email clients.
    el.querySelectorAll('img').forEach((img) => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
    });
    onChange(el.innerHTML);
  }

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
      document.execCommand('insertImage', false, reader.result as string);
      emit();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
      <div
        ref={ref}
        contentEditable
        onInput={emit}
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: value }}
        className="min-h-[160px] max-h-[400px] overflow-y-auto px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none leading-relaxed [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-1"
      />
    </div>
  );
}
