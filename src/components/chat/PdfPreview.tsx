import { useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

interface PdfPreviewProps {
  url: string;
  fileName: string;
  sizeLabel?: string;
}

export default function PdfPreview({ url, fileName, sizeLabel }: PdfPreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full text-left group"
      >
        <div className="relative flex h-[180px] w-[280px] flex-col items-center justify-center overflow-hidden rounded-md border border-white/5 bg-[#111b21]">
          <div className="absolute inset-x-0 top-0 h-10 bg-[#202c33]" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-md bg-[#f15c5c] text-white shadow-lg">
            <FileText className="h-8 w-8" />
          </div>
          <div className="relative mt-3 max-w-[230px] truncate text-xs font-medium text-[#e9edef]">{fileName}</div>
          <div className="relative mt-1 text-[10px] text-[#aebac1]">PDF</div>
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
          className="fixed inset-0 z-[100] flex flex-col bg-[#0b141a]"
          onClick={() => setOpen(false)}
        >
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#202c33] border-b border-[#0b1115]" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm text-[#e9edef] truncate flex-1">{fileName}</div>
            <a
              href={url}
              download={fileName}
              className="text-[#aebac1] hover:text-[#e9edef] p-2"
              title="Baixar PDF"
            >
              <Download className="w-4 h-4" />
            </a>
            <a href={url} target="_blank" rel="noreferrer" className="text-[#aebac1] hover:text-[#e9edef] p-2" title="Abrir PDF">
              <ExternalLink className="w-4 h-4" />
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
          <div className="flex flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex w-full max-w-sm flex-col items-center rounded-lg bg-[#202c33] p-6 text-center shadow-2xl">
              <div className="flex h-20 w-20 items-center justify-center rounded-md bg-[#f15c5c] text-white">
                <FileText className="h-10 w-10" />
              </div>
              <div className="mt-4 max-w-full truncate text-sm font-semibold text-[#e9edef]">{fileName}</div>
              <div className="mt-1 text-xs text-[#aebac1]">{[sizeLabel, 'PDF'].filter(Boolean).join(' • ')}</div>
              <div className="mt-5 flex w-full gap-2">
                <a href={url} download={fileName} className="flex-1 rounded-md bg-[#00a884] px-3 py-2 text-sm font-medium text-white hover:bg-[#06cf9c]">
                  Baixar
                </a>
                <a href={url} target="_blank" rel="noreferrer" className="flex-1 rounded-md bg-[#2a3942] px-3 py-2 text-sm font-medium text-[#e9edef] hover:bg-[#374248]">
                  Abrir
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
