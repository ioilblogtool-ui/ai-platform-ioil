import type { ArchitectureModel } from './architecture-types';

export type DraftBackup = {
  model: ArchitectureModel;
  revision: number;
  editedAt: number;
  tab: string;
};

// Mirrors the Phase 1 V12 block rules. Scan keys as well as values.
export const secretPatterns = [
  /AKIA[0-9A-Z]{16}/,
  /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[bp]-[A-Za-z0-9-]{10,}|sb_secret_[A-Za-z0-9_-]{10,})/,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const credentialField = /^(?:password|passwd|(?:access|refresh|auth)?[_-]?token|api[_-]?key|secret|private[_-]?key|authorization)$/i;

function hasCredentials(value: unknown): boolean {
  if (typeof value === 'string') return secretPatterns.some((pattern) => pattern.test(value));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) =>
    Boolean(item && credentialField.test(key)) ||
    secretPatterns.some((pattern) => pattern.test(key)) ||
    hasCredentials(item),
  );
}

export function writeDraftBackup(key: string, backup: DraftBackup) {
  if (hasCredentials(backup.model)) return null;
  const raw = JSON.stringify(backup);
  localStorage.setItem(key, raw);
  return raw;
}

export function readDraftBackup(key: string, revision: number, updatedAt: string) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const value = JSON.parse(raw) as DraftBackup | null;
  if (!value?.model || !Array.isArray(value.model.views) ||
      !Number.isInteger(value.revision) || !Number.isFinite(value.editedAt) ||
      typeof value.tab !== 'string' || hasCredentials(value.model)) return null;
  if (value.revision > revision || (value.revision === revision && value.editedAt <= Date.parse(updatedAt))) return null;
  return { raw, value };
}

export function removeDraftBackup(key: string, raw: string | null) {
  if (raw && localStorage.getItem(key) === raw) localStorage.removeItem(key);
}
