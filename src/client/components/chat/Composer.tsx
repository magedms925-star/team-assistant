import { ArrowUp, FileText, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import { readTextFiles, TEXT_ACCEPT, type TextFile } from "./textFiles";

/** The message box: text, text-file attachments, send. Enter sends, Shift+Enter adds a line. */
export function Composer({
  onSend,
  placeholder = "Write a message",
  autoFocus = false,
}: {
  onSend: (content: string, attachments: TextFile[]) => Promise<boolean>;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<TextFile[]>([]);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function send() {
    if (!text.trim() || pending) return;
    setPending(true);
    try {
      if (await onSend(text.trim(), files)) {
        setText("");
        setFiles([]);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-3 shadow-xs">
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              data-testid="attachment-chip"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs"
            >
              <FileText className="size-3.5" aria-hidden />
              {f.name}
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Textarea
        data-testid="composer-input"
        aria-label="Message"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder}
        disabled={pending}
        className="max-h-60 min-h-16 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <input
          ref={input}
          data-testid="attach-input"
          type="file"
          multiple
          accept={TEXT_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={async (e) => {
            const { files: read, refused } = await readTextFiles(e.target.files);
            if (refused.length) toast.error(refused.join(". "));
            setFiles((current) => [...current, ...read].slice(0, 5));
            e.target.value = "";
          }}
        />
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <Paperclip data-icon="inline-start" />
          Attach
        </Button>
        <Button
          type="button"
          size="icon-sm"
          data-testid="send-button"
          aria-label="Send"
          pending={pending}
          disabled={!text.trim()}
          onClick={() => void send()}
        >
          {pending ? null : <ArrowUp />}
        </Button>
      </div>
    </div>
  );
}
