import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Minus, Plus, X } from 'lucide-react';

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
  const viewerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState(false);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);

  const renderPdfPage = useCallback(async (targetCanvas: HTMLCanvasElement, pageNumber: number, targetWidth: number) => {
    const task = (pdfjsLib as unknown as { getDocument: (o: { url: string; withCredentials?: boolean }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } }>; destroy: () => void }> } }).getDocument({ url, withCredentials: false });
    const doc = await task.promise;
    try {
      setPageCount(doc.numPages);
      const safePage = Math.min(Math.max(pageNumber, 1), doc.numPages || 1);
      const pdfPage = await doc.getPage(safePage);
      const viewport = pdfPage.getViewport({ scale: 1 });
      const scale = Math.max(0.2, targetWidth / viewport.width);
      const scaled = pdfPage.getViewport({ scale });
      const ctx = targetCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas indisponível');
      targetCanvas.width = Math.floor(scaled.width);
      targetCanvas.height = Math.floor(scaled.height);
      ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
      await pdfPage.render({ canvasContext: ctx, viewport: scaled }).promise;
    } finally {
      doc.destroy();
    }
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: { destroy: () => void } | null = null;
    (async () => {
      try {
        setLoading(true);
        setError(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        await renderPdfPage(canvas, 1, 280);
        if (!cancelled) setLoading(false);
      } catch (e) {
        console.error('[PdfPreview]', e);
        if (!cancelled) { setError(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; if (pdfDoc) try { pdfDoc.destroy(); } catch { /* noop */ } };
  }, [renderPdfPage]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const canvas = viewerCanvasRef.current;
    if (!canvas) return;
    setViewerLoading(true);
    setViewerError(false);
    const width = Math.min(window.innerWidth - 32, 920) * zoom;
    renderPdfPage(canvas, page, width)
      .then(() => { if (!cancelled) setViewerLoading(false); })
      .catch((e) => {
        console.error('[PdfPreview viewer]', e);
        if (!cancelled) { setViewerError(true); setViewerLoading(false); }
      });
    return () => { cancelled = true; };
  }, [open, page, zoom, renderPdfPage]);

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
          className="fixed inset-0 z-[100] bg-[#0b141a] flex flex-col"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#202c33] border-b border-[#0b1115]" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-[#e9edef] truncate flex-1">{fileName}</div>
            <button type="button" className="p-2 text-[#aebac1] hover:text-[#e9edef]" onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.15).toFixed(2))))} title="Diminuir zoom">
              <Minus className="w-4 h-4" />
            </button>
            <button type="button" className="p-2 text-[#aebac1] hover:text-[#e9edef]" onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.15).toFixed(2))))} title="Aumentar zoom">
              <Plus className="w-4 h-4" />
            </button>
            <a
              href={url}
              download={fileName}
              className="text-[#aebac1] hover:text-[#e9edef] p-2"
              title="Baixar PDF"
            >
              <Download className="w-4 h-4" />
            </a>
            <button
              type="button"
              className="text-[#aebac1] hover:text-[#e9edef] p-2"
              onClick={() => setOpen(false)}
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-3">
              {viewerLoading && <Loader2 className="w-6 h-6 animate-spin text-[#aebac1]" />}
              {viewerError ? (
                <div className="max-w-sm rounded-md bg-[#202c33] p-4 text-center text-sm text-[#e9edef]">
                  Não consegui pré-visualizar este PDF no painel. Use o botão de download acima.
                </div>
              ) : (
                <canvas ref={viewerCanvasRef} className={viewerLoading ? 'hidden' : 'block max-w-none rounded-sm bg-white shadow-2xl'} />
              )}
            </div>
          </div>
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 bg-[#202c33] px-3 py-2 border-t border-[#0b1115]" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="p-2 text-[#aebac1] hover:text-[#e9edef] disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-xs text-[#e9edef]">Página {page} de {pageCount}</span>
              <button type="button" className="p-2 text-[#aebac1] hover:text-[#e9edef] disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
