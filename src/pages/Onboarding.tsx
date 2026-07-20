import { CircleCheck, Palette, RefreshCw, ShieldAlert, Wand2 } from "lucide-react";
import { useApp } from "../store";

/** First-run flow: detect Codex, explain the one-time restart, consent. */
export function Onboarding() {
  const state = useApp((s) => s.state);
  const finish = useApp((s) => s.finishOnboarding);

  const installed = state?.codexDesktop.installed ?? false;

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-hero">
          <span className="brand-mark">
            <Palette size={20} />
          </span>
          <div>
            <div className="onboarding-title">Codex Themes</div>
            <div className="onboarding-sub">给 Codex 桌面端换上你喜欢的样子</div>
          </div>
        </div>

        <div className="ob-step">
          <div className="ob-step-icon">
            {installed ? <CircleCheck size={17} /> : <RefreshCw size={17} />}
          </div>
          <div>
            <div className="ob-step-title">
              {installed ? "已检测到 Codex 桌面端" : "未检测到 Codex 桌面端"}
            </div>
            <div className="ob-step-body">
              {installed ? (
                <>
                  <span className="mono">{state?.codexDesktop.bundlePath}</span>
                  {state?.codexDesktop.version ? ` · v${state.codexDesktop.version}` : ""}
                </>
              ) : (
                "请先安装 OpenAI Codex 桌面版(ChatGPT.app)后再继续。"
              )}
            </div>
          </div>
        </div>

        <div className="ob-step">
          <div className="ob-step-icon">
            <Wand2 size={17} />
          </div>
          <div>
            <div className="ob-step-title">首次应用主题需要重启一次 Codex</div>
            <div className="ob-step-body">
              主题通过本机调试端口注入纯视觉装饰层,不修改 Codex
              安装包。首次应用时会请求你授权重启;之后 Codex 刷新、新开窗口都会自动保持主题。
            </div>
          </div>
        </div>

        <div className="ob-step">
          <div className="ob-step-icon">
            <ShieldAlert size={17} />
          </div>
          <div>
            <div className="ob-step-title">随时一键还原</div>
            <div className="ob-step-body">
              调试端口仅监听 127.0.0.1,装饰层不拦截任何原生交互;「还原官方外观」会移除
              全部注入内容,并恢复你的 Codex 外观设置备份。
            </div>
          </div>
        </div>

        <div className="onboarding-actions">
          <button className="btn btn-primary" disabled={!installed} onClick={() => void finish()}>
            开始使用
          </button>
        </div>
      </div>
    </div>
  );
}
