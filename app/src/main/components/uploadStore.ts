import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

const MAX_UPLOADS = 8;

export interface UploadedScenarioRecord {
  id: string;
  originalName: string;
  buffer: Buffer;
  type: string;
  size: number;
  checksum: string;
  createdAt: number;
  saveToFile: boolean;
  absolutePath: string;
  virtualPath: string;
}

export const uploadedScenarios = new Map<string, UploadedScenarioRecord>();

const normalizeUploadPath = (filePath: string): string => {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
};

const pruneUploadMemory = () => {
  if (uploadedScenarios.size <= MAX_UPLOADS) return;
  const sorted = Array.from(uploadedScenarios.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  const overflow = sorted.slice(0, sorted.length - MAX_UPLOADS);
  for (const [key] of overflow) {
    uploadedScenarios.delete(key);
  }
};

export const registerScenarioUpload = (
  name: string,
  buffer: Buffer,
  type: string,
  saveToFile: boolean,
): UploadedScenarioRecord => {
  const timestamp = Date.now();
  const safeName = name.replace(/[^\w.-]/g, '_');
  const id = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const relativePath = path.join('uploads', `${id}-${safeName}`);
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const checksum = createHash('sha256').update(buffer).digest('hex');
  const record: UploadedScenarioRecord = {
    id,
    originalName: name,
    buffer,
    type,
    size: buffer.byteLength,
    checksum,
    createdAt: timestamp,
    saveToFile,
    absolutePath,
    virtualPath: relativePath,
  };

  uploadedScenarios.set(absolutePath, record);
  pruneUploadMemory();
  return record;
};

export const persistScenarioUpload = async (
  record: UploadedScenarioRecord,
): Promise<void> => {
  await fs.mkdir(path.dirname(record.absolutePath), { recursive: true });
  await fs.writeFile(record.absolutePath, record.buffer);
};

export const getUploadedScenario = (
  filePath: string,
): UploadedScenarioRecord | undefined => {
  return uploadedScenarios.get(normalizeUploadPath(filePath));
};

export const getUploadedScenarioMetadata = (filePath: string) => {
  const record = getUploadedScenario(filePath);
  if (!record) return undefined;
  return {
    checksum: record.checksum,
    sizeBytes: record.size,
    uploadedAt: new Date(record.createdAt).toISOString(),
    sourceName: record.originalName,
    sourcePath: record.virtualPath,
  };
};
