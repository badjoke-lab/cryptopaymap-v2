import type { SubmissionKind } from "@/lib/submissions";

import type { DraftBundle, StoredFile, SubmissionDraft, SubmissionDraftFiles } from "./types";

const DRAFT_PREFIX = "submit-draft";

const buildKey = (kind: SubmissionKind) => `${DRAFT_PREFIX}:${kind}`;

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const serializeFiles = async (files: File[]): Promise<StoredFile[]> => {
  const stored: StoredFile[] = [];
  for (const file of files) {
    stored.push({
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: file.lastModified,
      dataUrl: await readFileAsDataUrl(file),
    });
  }
  return stored;
};

export const hydrateFiles = async (stored: StoredFile[]): Promise<File[]> => {
  const files: File[] = [];
  for (const entry of stored) {
    const response = await fetch(entry.dataUrl);
    const blob = await response.blob();
    files.push(new File([blob], entry.name, { type: entry.type || blob.type, lastModified: entry.lastModified }));
  }
  return files;
};

export const loadDraftBundle = (kind: SubmissionKind): DraftBundle | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(buildKey(kind));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraftBundle;
  } catch (error) {
    console.warn("Failed to parse draft bundle", error);
    return null;
  }
};

export const saveDraftBundle = (kind: SubmissionKind, payload: SubmissionDraft, files: SubmissionDraftFiles) => {
  if (typeof window === "undefined") return;
  const bundle: DraftBundle = {
    kind,
    payload,
    files,
    updatedAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(buildKey(kind), JSON.stringify(bundle));
};

export const clearDraftBundle = (kind: SubmissionKind) => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(buildKey(kind));
};
