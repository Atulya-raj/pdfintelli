"use client";

import { useState, useRef } from "react";
import { FileUp, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import Loader from "./Loader";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  onUploadSuccess,
}: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "done" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const resetStateAndClose = () => {
    setFile(null);
    setStatus("idle");
    setErrorMessage("");
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type !== "application/pdf" && !selected.name.endsWith(".pdf")) {
        setErrorMessage("Please select a valid PDF file.");
        return;
      }
      setErrorMessage("");
      setFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const selected = e.dataTransfer.files[0];
      if (selected.type !== "application/pdf" && !selected.name.endsWith(".pdf")) {
        setErrorMessage("Please drop a valid PDF file.");
        return;
      }
      setErrorMessage("");
      setFile(selected);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setStatus("uploading");
      setErrorMessage("");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/pdfs/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to upload PDF");
      }

      setStatus("done");
      setTimeout(() => {
        onUploadSuccess();
        resetStateAndClose();
      }, 800);
    } catch (err: any) {
      console.error("Upload error:", err);
      setStatus("error");
      setErrorMessage(err.message || "Failed to upload. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 transition-all">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h3 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white uppercase">
              Upload Document
            </h3>
            <p className="text-xs font-mono text-zinc-500 mt-0.5">
              Quickly process documents for summaries and search
            </p>
          </div>
          <button
            onClick={resetStateAndClose}
            disabled={status === "uploading"}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="my-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
              isDragging
                ? "border-zinc-900 bg-zinc-100/50 dark:border-[#d4ff3a] dark:bg-[#d4ff3a]/5"
                : "border-zinc-300 hover:border-zinc-500 bg-zinc-50/50 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-zinc-500"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white">
              {file ? <FileText className="h-6 w-6" /> : <FileUp className="h-6 w-6" />}
            </div>
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              {file ? file.name : "Click to select or drop PDF"}
            </p>
            <p className="mt-1 font-mono text-xs text-zinc-500">
              {file
                ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                : "Slides, research papers, legal documents up to 50MB"}
            </p>
          </div>

          {errorMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {status === "uploading" && (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-950 flex flex-col items-center justify-center gap-3">
              <Loader size="md" label="Processing document and preparing summaries..." />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 mt-2">
                <div className="h-full bg-zinc-900 dark:bg-[#d4ff3a] animate-pulse w-3/4 rounded-full transition-all" />
              </div>
            </div>
          )}

          {status === "done" && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600 dark:text-[#d4ff3a]">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Uploaded successfully! Preparing your document...</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button
            type="button"
            onClick={resetStateAndClose}
            disabled={status === "uploading"}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || status === "uploading" || status === "done"}
            className="rounded-xl bg-zinc-900 px-5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-[#d4ff3a] dark:text-zinc-950 dark:hover:bg-[#c2ef2b] disabled:opacity-50 shadow-sm transition-all flex items-center gap-2"
          >
            {status === "uploading" ? (
              <>
                <Loader size="xs" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Upload & Process</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
