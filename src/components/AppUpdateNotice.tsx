import {
  ArrowDownToLine,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../store";

function formatBytes(value: number | null): string {
  if (!value || value < 1) return "0 MB";
  return `${(value / 1024 / 1024).toFixed(value >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}

function ReleaseNotes({ value }: { value: string | null }) {
  if (!value) {
    return <p className="update-notes-empty">此版本暂未提供更新说明。</p>;
  }

  return (
    <div className="update-release-notes">
      {value.split("\n").map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div className="update-note-space" key={index} />;
        if (trimmed.startsWith("### ")) {
          return <h5 key={index}>{trimmed.slice(4)}</h5>;
        }
        if (trimmed.startsWith("## ")) {
          return <h4 key={index}>{trimmed.slice(3)}</h4>;
        }
        if (trimmed.startsWith("# ")) {
          return <h3 key={index}>{trimmed.slice(2)}</h3>;
        }
        if (/^[-*]\s/.test(trimmed)) {
          return <p className="update-note-item" key={index}>{trimmed.slice(2)}</p>;
        }
        return <p key={index}>{trimmed}</p>;
      })}
    </div>
  );
}

export function AppUpdateNotice() {
  const update = useApp((state) => state.appUpdate);
  const download = useApp((state) => state.downloadAppUpdate);
  const install = useApp((state) => state.installAppUpdate);
  const openRelease = useApp((state) => state.openAppUpdateRelease);
  const openDownload = useApp((state) => state.openAppUpdateDownload);
  const [open, setOpen] = useState(false);

  if (
    !update?.availableVersion ||
    !["available", "downloading", "downloaded", "error"].includes(update.status)
  ) {
    return null;
  }

  const progress = Math.round(update.progressPercent ?? 0);
  const downloaded = update.status === "downloaded";
  const downloading = update.status === "downloading";
  const failed = update.status === "error";
  const noticeTitle = downloaded
    ? `v${update.availableVersion} 可安装`
    : downloading
      ? `正在下载 v${update.availableVersion}`
      : `发现新版本 v${update.availableVersion}`;
  const noticeDetail = downloaded
    ? "点击查看并重启安装"
    : downloading
      ? `${progress}% · ${formatBytes(update.transferredBytes)} / ${formatBytes(update.totalBytes)}`
      : failed
        ? "自动更新失败，可重试"
        : "点击查看更新日志";

  return (
    <>
      <button
        className={`app-update-notice is-${update.status}`}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${noticeTitle}，${noticeDetail}`}
        title={`${noticeTitle} · ${noticeDetail}`}
      >
        <span className="app-update-notice__icon" aria-hidden="true">
          {downloading ? <Loader2 className="spin" size={15} /> : downloaded ? <CheckCircle2 size={15} /> : <Rocket size={15} />}
        </span>
        <span className="app-update-notice__copy">
          <strong>{noticeTitle}</strong>
          <small>{noticeDetail}</small>
        </span>
        <span className="app-update-notice__dot" aria-hidden="true" />
        {downloading && (
          <span className="app-update-notice__progress" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div className="modal-backdrop update-modal-backdrop" onMouseDown={() => setOpen(false)}>
            <section
              className="modal-card update-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-update-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="modal-header update-modal__header">
                <div>
                  <span className="update-modal__eyebrow">
                    v{update.currentVersion} → v{update.availableVersion}
                  </span>
                  <h3 id="app-update-title">
                    {update.releaseName ?? `Codex Themes v${update.availableVersion}`}
                  </h3>
                </div>
                <button
                  className="btn btn-icon btn-ghost"
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="关闭更新窗口"
                >
                  <X size={15} />
                </button>
              </header>

              <div className="modal-body update-modal__body">
                <div className="update-modal__summary">
                  <span className={`update-status-badge is-${update.status}`}>
                    {downloaded
                      ? "已下载，等待安装"
                      : downloading
                        ? `正在下载 ${progress}%`
                        : failed
                          ? "自动更新遇到问题"
                          : "新版本可用"}
                  </span>
                  {update.releaseDate && (
                    <time dateTime={update.releaseDate}>
                      {new Date(update.releaseDate).toLocaleDateString("zh-CN")}
                    </time>
                  )}
                </div>

                {downloading && (
                  <div className="update-download-progress" aria-live="polite">
                    <div>
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <p>
                      {formatBytes(update.transferredBytes)} / {formatBytes(update.totalBytes)}
                      {update.bytesPerSecond
                        ? ` · ${formatBytes(update.bytesPerSecond)}/s`
                        : ""}
                    </p>
                  </div>
                )}

                {failed && update.error && (
                  <div className="update-error-message">{update.error}</div>
                )}

                <div className="update-notes-heading">更新日志</div>
                <ReleaseNotes value={update.releaseNotes} />
              </div>

              <footer className="modal-footer update-modal__footer">
                <button className="btn btn-ghost" type="button" onClick={() => void openRelease()}>
                  <ExternalLink size={13} />
                  GitHub Release
                </button>
                <span className="update-modal__footer-spacer" />
                <button className="btn" type="button" onClick={() => setOpen(false)}>
                  稍后
                </button>
                {failed && (
                  <button className="btn" type="button" onClick={() => void openDownload()}>
                    <ArrowDownToLine size={13} />
                    直接下载 DMG
                  </button>
                )}
                {downloaded ? (
                  <button className="btn btn-primary" type="button" onClick={() => void install()}>
                    <RefreshCw size={13} />
                    重启并安装
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={downloading}
                    onClick={() => void download()}
                  >
                    {downloading ? <Loader2 className="spin" size={13} /> : <ArrowDownToLine size={13} />}
                    {downloading ? `下载中 ${progress}%` : failed ? "重试自动更新" : "下载更新"}
                  </button>
                )}
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
