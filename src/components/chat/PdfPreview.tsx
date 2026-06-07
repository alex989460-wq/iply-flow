import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { FileText, ExternalLink, X, Loader2 } from 'lucide-react';

// Initialize worker once
(pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfPreviewProps {
  url: string;
  fileName: string;
  sizeLabel?: string;
}

/**
 * WhatsApp-style PDF preview: renders the first page as a thumbnail inside the
 * chat bubble. Clicking opens a fullscreen viewer (iframe) for navigation.
 */
export default function PdfPreview({ url, fileName, sizeLabel }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: { destroy: () => void } | null = null;
    (async () => {
      try {
        setLoading(true);
        setError(false);
        // @ts-expect-error - getDocument exists at runtime
        const task = pdfjsLib.getDocument({ url, withCredentials: false });
        const doc = await task.promise;
        if (cancelled) { doc.destroy(); return; }
        pdfDoc = doc;
        setPageCount(doc.numPages);
        const page = await doc.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 280;
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(scaled.width);
        canvas.height = Math.floor(scaled.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error('[PdfPreview]', e);
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; if (pdfDoc) try { pdfDoc.destroy(); } catch { /* noop */ } };
  }, [url]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left group"
      >
        <div className="relative rounded-md overflow-hidden bg-black/30 border border-white/5">
          {loading && !error && (
            <div className="flex items-center justify-center h-[360px] w-[280px]">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center justify-center h-[180px] w-[280px] gap-2 text-xs text-muted-foreground p-3 text-center">
              <FileText className="w-8 h-8" />
              <span>Pré-visualização indisponível — toque para abrir.</span>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={(loading || error) ? 'hidden' : 'block max-w-[280px] h-auto bg-white'}
          />
          {!loading && !error && pageCount > 0 && (
            <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
              PDF • {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded bg-[#00a884]/15 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-[#00a884]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate" title={fileName}>{fileName}</div>
            <div className="text-[10px] text-[#aebac1] truncate">
              {[sizeLabel, 'PDF'].filter(Boolean).join(' • ')}
            </div>
          </div>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-between px-4 py-2 bg-black/60" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-white truncate flex-1">{fileName}</div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-white/80 hover:text-white p-2"
              title="Abrir em nova aba"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              type="button"
              className="text-white/80 hover:text-white p-2"
              onClick={() => setOpen(false)}
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <iframe
            src={url}
            title={fileName}
            className="flex-1 w-full bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
