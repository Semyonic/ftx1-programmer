import { MemoryRow } from "../store/memory";
import { LeafState } from "../store/settings";

export interface BackupFile {
  version: 1;
  generatedAt: string;
  firmwareVersion: string | null;
  radioId: string | null;
  memory: Array<{
    key: string;
    id: MemoryRow["id"];
    frame: MemoryRow["frame"];
    tag: string;
  }>;
  settings: Array<{
    p1: number;
    p2: number;
    p3: number;
    raw: string | null;
  }>;
}

export function buildBackup(args: {
  firmwareVersion: string | null;
  radioId: string | null;
  memory: MemoryRow[];
  settings: LeafState[];
}): BackupFile {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    firmwareVersion: args.firmwareVersion,
    radioId: args.radioId,
    memory: args.memory.map((r) => ({ key: r.key, id: r.id, frame: r.frame, tag: r.tag })),
    settings: args.settings.map((v) => ({ p1: v.p1, p2: v.p2, p3: v.p3, raw: v.raw })),
  };
}

export function downloadFile(name: string, content: string, mime = "application/json"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
