export function snapshot(options: {
  databaseUrl: string;
  documents: string;
  configFile: string;
  backupKeyFile: string;
  output: string;
  quiesced?: boolean;
}): Promise<{ snapshotId: string; documentObjects: number; encrypted: boolean }>;
export function restore(options: {
  adminUrl: string;
  ownerUrl: string;
  targetDatabase: string;
  documents: string;
  configFile: string;
  backupKeyFile: string;
  input: string;
  evidenceFile?: string;
}): Promise<{
  archiveSha256: string;
  restoreToMaintenanceMs: number;
  rowCountsAndChecksumsMatched: boolean;
  documentChecksumsMatched: boolean;
  fieldKeyFingerprintsMatched: boolean;
  reconciliationRequired: boolean;
}>;
