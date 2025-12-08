import React from 'react';
import type { ScenarioMetadata } from '../../shared/schemas';

interface ScenarioDiagnosticsProps {
  metadata?: ScenarioMetadata | null;
}

const metadataRows: Array<{ label: string; key: keyof ScenarioMetadata }> = [
  { label: 'Author', key: 'author' },
  { label: 'Version', key: 'version' },
  { label: 'Date', key: 'date' },
  { label: 'Checksum', key: 'checksum' },
  { label: 'Size (bytes)', key: 'sizeBytes' },
  { label: 'Uploaded At', key: 'uploadedAt' },
  { label: 'Source', key: 'sourcePath' },
];

export const ScenarioDiagnostics: React.FC<ScenarioDiagnosticsProps> = ({
  metadata,
}) => {
  if (!metadata) {
    return (
      <div className="diagnostics-empty">
        No scenario metadata available. Load a scenario to inspect details.
      </div>
    );
  }

  return (
    <div className="diagnostics-grid">
      {metadataRows.map(({ label, key }) => {
        const value = metadata[key];
        if (value === undefined || value === null || value === '') return null;
        return (
          <div key={key} className="diagnostic-row">
            <div className="diagnostic-label">{label}</div>
            <div className="diagnostic-value">
              {key === 'sizeBytes' && typeof value === 'number'
                ? `${value.toLocaleString()} B`
                : typeof value === 'string'
                  ? value
                  : String(value)}
            </div>
          </div>
        );
      })}
      {metadata.parameters && (
        <div className="diagnostic-row full">
          <div className="diagnostic-label">Parameters</div>
          <div className="diagnostic-value parameter-grid">
            {Object.entries(metadata.parameters).map(([paramKey, paramValue]) => (
              <span key={paramKey} className="pill">
                {paramKey}: {String(paramValue)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
