const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "xml", "yaml", "yml", "toml", "ini", "log",
  "html", "htm", "css", "scss", "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "kt", "swift", "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "sql", "r", "lua", "pl", "vue", "svelte",
]);

export const TEXT_ACCEPT = [...TEXT_EXTENSIONS].map((e) => `.${e}`).join(",");
export const MAX_FILE_BYTES = 200_000;

export interface TextFile {
  name: string;
  content: string;
}

/** Reads the chosen files as text; anything not a text type, or too large, is refused with a reason. */
export async function readTextFiles(list: FileList | null): Promise<{ files: TextFile[]; refused: string[] }> {
  const files: TextFile[] = [];
  const refused: string[] = [];
  for (const file of Array.from(list ?? [])) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const textType = file.type.startsWith("text/") || file.type === "application/json";
    if (!TEXT_EXTENSIONS.has(ext) && !textType) {
      refused.push(`${file.name} isn't a text file`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      refused.push(`${file.name} is over 200 KB`);
      continue;
    }
    files.push({ name: file.name, content: await file.text() });
  }
  return { files, refused };
}
