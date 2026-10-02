"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Image from "next/image";
import { api, ApiError } from "@/lib/api";
import { useAsync } from "@/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "./ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/icons";
import type { AdminLogo } from "@/types/api";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];

function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Supported formats: JPEG, PNG, WebP, GIF or SVG.";
  if (file.size > MAX_BYTES) return "Images must be smaller than 8 MB.";
  return null;
}

function readAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new ApiError("The file could not be read. Please retry.", { code: "READ_FAILED" }));
    reader.readAsDataURL(file);
  });
}

function LogoSkeleton() {
  return (
    <div className="card flex items-center gap-4 p-4" aria-hidden="true">
      <div className="size-16 rounded-xl bg-surface" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-40 rounded" />
        <div className="skeleton h-3 w-64 rounded" />
      </div>
    </div>
  );
}

/**
 * Logo library: drag-and-drop upload to storage (Cloudinary in production),
 * metadata editing, reordering, visibility control and safe deletion
 * (storage asset first, database record second).
 */
export function LogosManager() {
  const { data, loading, error, run, setData } = useAsync(() => api.admin.logos.list());

  const [panelOpen, setPanelOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [alt, setAlt] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminLogo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetRef = useRef<AdminLogo | null>(null);

  const logos = data?.logos ?? [];

  /* Release object URLs on unmount / replacement. */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      abortRef.current?.abort();
    };
  }, [previewUrl]);

  const selectFile = (selected: File | null | undefined) => {
    if (!selected) return;
    const problem = validateFile(selected);
    if (problem) {
      setFieldError(problem);
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFieldError(null);
    setUploadError(null);
    setFile(selected);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(selected);
    });
    if (!name.trim()) setName(selected.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  };

  const resetPanel = () => {
    setPanelOpen(false);
    setFile(null);
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setName("");
    setAlt("");
    setFieldError(null);
    setUploadError(null);
    setProgress(0);
  };

  const upload = async () => {
    if (!file) {
      setFieldError("Choose an image first.");
      return;
    }
    if (name.trim().length < 2) {
      setFieldError("Give this logo a name (2+ characters).");
      return;
    }
    if (uploading) return;

    setUploading(true);
    setUploadError(null);
    setProgress(0);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const dataUri = await readAsDataUri(file);
      await api.admin.logos.create(
        { name: name.trim(), alt: alt.trim() || name.trim(), image: dataUri },
        { onProgress: setProgress, signal: controller.signal },
      );
      resetPanel();
      await run({ silent: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "ABORTED") {
        setUploadError("Upload cancelled.");
      } else {
        setUploadError(cause instanceof ApiError ? cause.message : "Upload failed. Please retry.");
      }
    } finally {
      setUploading(false);
      abortRef.current = null;
    }
  };

  const cancelUpload = () => abortRef.current?.abort();

  /* --- Row actions -------------------------------------------------------- */

  const toggleVisibility = async (logo: AdminLogo) => {
    const nextVisible = !logo.isVisible;
    setData((current) =>
      current
        ? {
            ...current,
            logos: current.logos.map((row) => (row._id === logo._id ? { ...row, isVisible: nextVisible } : row)),
          }
        : current!,
    );
    setBusyId(logo._id);
    try {
      await api.admin.logos.setVisibility(logo._id, nextVisible);
      await run({ silent: true });
    } catch {
      // Roll back on failure.
      setData((current) =>
        current
          ? {
              ...current,
              logos: current.logos.map((row) => (row._id === logo._id ? { ...row, isVisible: logo.isVisible } : row)),
            }
          : current!,
      );
    } finally {
      setBusyId(null);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= logos.length) return;

    const ordered = [...logos];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(target, 0, moved);

    setData((current) => (current ? { ...current, logos: ordered } : current!));
    setBusyId(moved._id);
    try {
      await api.admin.logos.reorder(ordered.map((row) => row._id));
    } catch {
      await run({ silent: true });
    } finally {
      setBusyId(null);
    }
  };

  const pickReplacement = (logo: AdminLogo) => {
    replaceTargetRef.current = logo;
    replaceInputRef.current?.click();
  };

  const onReplaceSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    event.target.value = "";
    const target = replaceTargetRef.current;
    if (!selected || !target) return;

    const problem = validateFile(selected);
    if (problem) {
      setUploadError(problem);
      return;
    }

    setBusyId(target._id);
    setUploadError(null);
    try {
      const dataUri = await readAsDataUri(selected);
      await api.admin.logos.update(target._id, { image: dataUri });
      await run({ silent: true });
    } catch (cause) {
      setUploadError(cause instanceof ApiError ? cause.message : "Could not replace the image. Please retry.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setDeleting(true);
    try {
      await api.admin.logos.remove(target._id);
      setPendingDelete(null);
      await run({ silent: true });
    } catch (cause) {
      setUploadError(cause instanceof ApiError ? cause.message : "Could not delete this logo.");
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  /* --- Render ------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Logo library</h2>
          <Badge tone="neutral">{logos.length} assets</Badge>
          {data && (
            <Badge tone={data.driver === "cloudinary" ? "success" : "info"}>
              {data.driver === "cloudinary" ? "Cloudinary" : "Local storage (dev)"}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void run()} iconLeft={<RefreshIcon size={14} />}>
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => (panelOpen ? resetPanel() : setPanelOpen(true))}
            iconLeft={panelOpen ? <CloseIcon size={14} /> : <UploadIcon size={14} />}
          >
            {panelOpen ? "Close" : "Upload logo"}
          </Button>
        </div>
      </div>

      {uploadError && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger-soft px-4 py-3 text-sm text-danger">
          {uploadError}
        </p>
      )}

      {/* Uploader */}
      {panelOpen && (
        <section aria-label="Upload a logo" className="card space-y-5 p-5 sm:p-6">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            {previewUrl ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative flex h-24 items-center justify-center rounded-xl border border-line bg-surface-elevated p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob preview is temporary */}
                  <img src={previewUrl} alt="Selected logo preview" className="max-h-20 max-w-56 object-contain" />
                </div>
                <p className="max-w-xs truncate text-xs text-muted">
                  {file?.name} · {file ? (file.size / 1024).toFixed(0) : 0} KB
                </p>
              </div>
            ) : (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <UploadIcon size={22} />
                </span>
                <p className="text-sm font-medium text-foreground">Drag an image here, or browse</p>
                <p className="text-xs text-muted">JPEG, PNG, WebP, GIF or SVG · up to 8 MB</p>
              </>
            )}

            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="sr-only"
              aria-label="Choose logo image"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {previewUrl ? "Choose different image" : "Browse files"}
            </Button>
          </div>

          {fieldError && (
            <p className="error-text" role="alert">
              {fieldError}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="logo-name" className="label">
                Name
              </label>
              <input
                id="logo-name"
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Partner logo — Northwind"
                disabled={uploading}
              />
            </div>
            <div>
              <label htmlFor="logo-alt" className="label">
                Alt text <span className="font-normal">(optional)</span>
              </label>
              <input
                id="logo-alt"
                className="field"
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
                placeholder="Northwind logo"
                disabled={uploading}
              />
            </div>
          </div>

          {uploading && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
                className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken"
              >
                <div
                  className="h-full origin-left rounded-full bg-accent transition-transform duration-200"
                  style={{ transform: `scaleX(${progress / 100})` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={resetPanel} disabled={uploading}>
              Cancel
            </Button>
            {uploading ? (
              <Button variant="outline" size="sm" onClick={cancelUpload}>
                Stop upload
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void upload()}
                loading={uploading}
                iconLeft={<UploadIcon size={14} />}
              >
                {uploadError ? "Retry upload" : "Upload"}
              </Button>
            )}
          </div>
        </section>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <LogoSkeleton key={index} />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Logos could not be loaded"
          description={error.message}
          icon={<RefreshIcon size={22} />}
          action={
            <Button variant="outline" size="sm" onClick={() => void run()}>
              Try again
            </Button>
          }
        />
      ) : logos.length === 0 ? (
        <EmptyState
          title="No logos uploaded yet"
          description="Upload client, partner and product logos — they appear in the public marquee as soon as they're marked visible."
          icon={<UploadIcon size={22} />}
          action={
            <Button size="sm" onClick={() => setPanelOpen(true)}>
              Upload the first logo
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {logos.map((logo, index) => (
            <li key={logo._id} className="card flex flex-wrap items-center gap-4 p-4">
              <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-surface-elevated p-2">
                <Image src={logo.secureUrl} alt={logo.alt || logo.name} width={64} height={64} sizes="64px" className="max-h-14 max-w-full object-contain" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{logo.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{logo.alt || "No alt text"}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge tone={logo.isVisible ? "success" : "neutral"}>
                    {logo.isVisible ? "Visible on site" : "Hidden"}
                  </Badge>
                  <Badge tone="neutral">Order {logo.sortOrder}</Badge>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {busyId === logo._id && <Spinner label="Working" />}

                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Move ${logo.name} earlier`}
                  disabled={index === 0 || busyId === logo._id}
                  onClick={() => void move(index, -1)}
                >
                  <ChevronRightIcon size={15} className="rotate-[-90deg]" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Move ${logo.name} later`}
                  disabled={index === logos.length - 1 || busyId === logo._id}
                  onClick={() => void move(index, 1)}
                >
                  <ChevronRightIcon size={15} className="rotate-90" />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={logo.isVisible ? `Hide ${logo.name}` : `Show ${logo.name}`}
                  aria-pressed={logo.isVisible}
                  disabled={busyId === logo._id}
                  onClick={() => void toggleVisibility(logo)}
                >
                  {logo.isVisible ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  aria-label={`Replace image for ${logo.name}`}
                  disabled={busyId === logo._id}
                  onClick={() => pickReplacement(logo)}
                >
                  <RefreshIcon size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon text-danger hover:text-danger"
                  aria-label={`Delete ${logo.name}`}
                  disabled={busyId === logo._id}
                  onClick={() => setPendingDelete(logo)}
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        aria-label="Replace logo image"
        onChange={(event) => void onReplaceSelected(event)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this logo?"
        message={`“${pendingDelete?.name ?? ""}” will be removed from storage and from the database. This cannot be undone.`}
        confirmLabel="Delete logo"
        busy={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default LogosManager;
