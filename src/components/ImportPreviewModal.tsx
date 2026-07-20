import { AlertTriangle, Check, Download, X } from "lucide-react";
import type { InspectedThemePackage } from "../../electron/shared/types";

interface Props {
  inspection: InspectedThemePackage;
  onClose(): void;
  onImport(): void;
  onInstallAsCopy(): void;
}

export function ImportPreviewModal({ inspection, onClose, onImport, onInstallAsCopy }: Props) {
  const { summary, warnings, canImport, sha256, signatureStatus } = inspection;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>导入主题预览</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="import-preview">
            <img src={summary.previewUrl} alt={summary.name} draggable={false} />
            <div className="import-meta">
              <div className="import-name">{summary.name}</div>
              <div className="import-tagline">{summary.tagline}</div>
              <div className="import-badges">
                <span className="badge badge-layout">{summary.layout}</span>
                {summary.version && <span className="badge badge-version">v{summary.version}</span>}
                {signatureStatus === "verified" && (
                  <span className="badge badge-custom">
                    <Check size={10} /> 已验证
                  </span>
                )}
                {signatureStatus === "missing" && <span className="badge badge-warning">未签名</span>}
                {signatureStatus === "invalid" && <span className="badge badge-warning">签名无效</span>}
              </div>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="note-block" style={{ marginTop: 16 }}>
              <AlertTriangle size={16} />
              <div>
                <strong>校验警告</strong>
                <ul className="warning-list">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="kv-row" style={{ marginTop: 12 }}>
            <span className="kv-key">SHA-256</span>
            <span className="kv-value mono" style={{ fontSize: 10 }}>{sha256}</span>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn" onClick={onInstallAsCopy} disabled={!canImport}>
            安装为副本
          </button>
          <button className="btn btn-primary" onClick={onImport} disabled={!canImport}>
            <Download size={14} />
            导入并应用
          </button>
        </div>
      </div>
    </div>
  );
}
