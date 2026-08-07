"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { motion, AnimatePresence } from "motion/react";

type FileEntry = { pathname: string; size: number; uploadedAt: string };
type UploadJob = { name: string; progress: number; status: "uploading" | "done" | "error"; error?: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CloudUploader() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [jobs, setJobs] = useState<Record<string, UploadJob>>({});
  const [dragOver, setDragOver] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/blob-list");
      const data = await res.json();
      if (data.error) {
        setLoadError(data.error);
        return;
      }
      setLoadError(null);
      setFiles(data.files ?? []);
    } catch {
      setLoadError("Couldn't reach the file list.");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      await Promise.all(
        Array.from(fileList).map(async (file) => {
          setJobs((prev) => ({ ...prev, [file.name]: { name: file.name, progress: 0, status: "uploading" } }));
          try {
            await upload(file.name, file, {
              access: "public",
              handleUploadUrl: "/api/blob-upload",
              onUploadProgress: ({ percentage }) => {
                setJobs((prev) => ({ ...prev, [file.name]: { name: file.name, progress: percentage, status: "uploading" } }));
              },
            });
            setJobs((prev) => ({ ...prev, [file.name]: { name: file.name, progress: 100, status: "done" } }));
            refresh();
          } catch (err) {
            setJobs((prev) => ({
              ...prev,
              [file.name]: {
                name: file.name,
                progress: 0,
                status: "error",
                error: err instanceof Error ? err.message : "Upload failed",
              },
            }));
          }
        })
      );
    },
    [refresh]
  );

  return (
    <div className="flex flex-col gap-6">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`material flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragOver ? "border-violet bg-violet/10" : "border-white/10"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-heading text-lg font-semibold text-ink">Drop files here</p>
        <p className="text-body mt-1 text-sm text-ink-dim">or click to browse — goes straight into your private cloud</p>
      </div>

      <AnimatePresence>
        {Object.values(jobs).length > 0 && (
          <div className="flex flex-col gap-2">
            {Object.values(jobs).map((job) => (
              <motion.div
                key={job.name}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="material-light flex items-center gap-3 rounded-xl px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{job.name}</p>
                  {job.status === "uploading" && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-violet"
                        animate={{ width: `${job.progress}%` }}
                        transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                      />
                    </div>
                  )}
                  {job.status === "error" && <p className="mt-0.5 text-xs text-magenta">{job.error}</p>}
                </div>
                <span className="text-caption text-xs text-ink-faint">
                  {job.status === "done" ? "done" : job.status === "error" ? "failed" : `${job.progress}%`}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      <div>
        <p className="text-caption text-xs uppercase tracking-widest text-ink-faint">in the cloud</p>
        {loadError && <p className="mt-2 text-sm text-ink-dim">{loadError}</p>}
        {!loadError && files.length === 0 && (
          <p className="mt-2 text-sm text-ink-faint">Nothing uploaded yet.</p>
        )}
        <ul className="mt-3 flex flex-col gap-1">
          {files.map((f) => (
            <li key={f.pathname} className="material-light flex items-center justify-between rounded-xl px-4 py-2.5">
              <span className="truncate text-sm text-ink-dim">{f.pathname}</span>
              <span className="text-caption shrink-0 text-xs text-ink-faint">{formatBytes(f.size)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-body text-xs text-ink-faint">
        Files land in a private Blob store, then get pulled onto Ruytha's PC by a local sync script — they aren't
        publicly reachable by URL.
      </p>
    </div>
  );
}
