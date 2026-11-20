import { FileText } from "lucide-react";

export function Attachments({ files }: { files: { name: string; size: number }[] }) {
  if (files.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={i} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
          <FileText className="size-3.5" aria-hidden />
          {f.name}
          <span className="text-muted-foreground">{formatSize(f.size)}</span>
        </li>
      ))}
    </ul>
  );
}

export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} KB`;
}
