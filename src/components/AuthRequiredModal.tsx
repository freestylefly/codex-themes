import { LogIn, ShieldCheck, X } from "lucide-react";
import { useApp } from "../store";

export function AuthRequiredModal() {
  const open = useApp((state) => state.authPromptOpen);
  const close = useApp((state) => state.dismissAuthPrompt);
  const setPage = useApp((state) => state.setPage);

  if (!open) return null;

  const continueToLogin = () => {
    close();
    setPage("account");
  };

  return (
    <div
      className="modal-backdrop auth-required-backdrop"
      role="presentation"
      onMouseDown={close}
    >
      <section
        className="modal-card auth-required-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-required-title"
        aria-describedby="auth-required-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div className="auth-required-modal__heading">
            <span className="auth-required-modal__icon" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <div>
              <span>账号权益</span>
              <h3 id="auth-required-title">登录后继续</h3>
            </div>
          </div>
          <button
            className="btn btn-icon btn-ghost"
            type="button"
            onClick={close}
            aria-label="关闭登录提示"
          >
            <X size={15} />
          </button>
        </header>

        <div className="modal-body auth-required-modal__body">
          <p id="auth-required-description">
            登录账号后即可解锁主题、购买积分，并在不同设备间同步已获得的主题权益。
          </p>
          <div className="auth-required-modal__note">
            登录会在浏览器中安全完成，授权成功后自动返回客户端。
          </div>
        </div>

        <footer className="modal-footer">
          <button className="btn" type="button" onClick={close}>
            稍后
          </button>
          <button className="btn btn-primary" type="button" onClick={continueToLogin}>
            <LogIn size={14} />
            去登录
          </button>
        </footer>
      </section>
    </div>
  );
}
