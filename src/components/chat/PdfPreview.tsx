import { Download, ExternalLink, FileText } from 'lucide-react';

interface PdfPreviewProps {
  url: string;
  fileName: string;
  sizeLabel?: string;
}

export default function PdfPreview({ url, fileName, sizeLabel }: PdfPreviewProps) {
  return (
    <div className="w-[280px] max-w-full overflow-hidden rounded-md bg-[#202c33] text-[#e9edef] shadow-sm">
      <a href={url} target="_blank" rel="noreferrer" className="block hover:opacity-95" title="Abrir PDF">
        <div className="relative flex h-[156px] flex-col items-center justify-center overflow-hidden bg-[#111b21]">
          <div className="absolute inset-x-0 top-0 h-8 bg-[#26343c]" />
          <div className="relative mb-2 flex h-16 w-14 items-center justify-center rounded-sm bg-[#f15c5c] text-white shadow-lg">
            <FileText className="h-8 w-8" />
            <span className="absolute bottom-1 text-[9px] font-bold">PDF</span>
          </div>
          <div className="relative max-w-[220px] truncate px-2 text-center text-xs font-medium">{fileName}</div>
        </div>
      </a>
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-[#00a884]/15">
          <FileText className="h-4 w-4 text-[#00a884]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={fileName}>{fileName}</div>
          <div className="truncate text-[10px] text-[#aebac1]">{[sizeLabel, 'PDF'].filter(Boolean).join(' • ')}</div>
        </div>
        <a href={url} download={fileName} className="p-1.5 text-[#aebac1] hover:text-[#e9edef]" title="Baixar PDF">
          <Download className="h-4 w-4" />
        </a>
        <a href={url} target="_blank" rel="noreferrer" className="p-1.5 text-[#aebac1] hover:text-[#e9edef]" title="Abrir PDF">
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}
