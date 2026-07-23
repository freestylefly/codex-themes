import { Coins, CreditCard, ExternalLink, Play } from "lucide-react";
import { useApp } from "../store";

/** Requires a second, explicit click before a website deep link applies a theme. */
export function OpenThemeModal() {
  const pendingId = useApp((state) => state.pendingWebThemeId);
  const themes = useApp((state) => state.themes);
  const catalog = useApp((state) => state.catalog);
  const entitlements = useApp((state) => state.entitlements);
  const confirm = useApp((state) => state.confirmWebTheme);
  const unlockTheme = useApp((state) => state.unlockTheme);
  const purchaseTheme = useApp((state) => state.purchaseTheme);
  const cancel = useApp((state) => state.cancelWebTheme);

  if (!pendingId) return null;
  const theme = themes.find((candidate) => candidate.id === pendingId);
  if (!theme) return null;
  const product = catalog.find((candidate) => candidate.id === pendingId);
  const isOwned = entitlements.some(
    (entitlement) => entitlement.themeId === pendingId && entitlement.status === "active",
  );
  const requiresPurchase = (Boolean(theme.catalogOnly) || Boolean(product)) && !isOwned;
  const priceText = product?.priceCents ? `¥${(product.priceCents / 100).toFixed(2)}` : null;

  return (
    <div className="modal-backdrop" onClick={cancel}>
      <div
        className="modal web-theme-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="web-theme-title"
        onClick={(event) => event.stopPropagation()}
      >
        <img className="web-theme-modal-preview" src={theme.previewUrl} alt="" />
        <div className="modal-title" id="web-theme-title">
          <ExternalLink size={17} />
          从官网打开主题
        </div>
        <div className="modal-body">
          {requiresPurchase
            ? `「${theme.name}」需要先解锁。${product?.pricePoints ? `可使用 ${product.pricePoints} 积分` : "可免费解锁"}${priceText ? `，也可通过支付宝支付 ${priceText}` : ""}。`
            : `是否将「${theme.name}」应用到 Codex？应用前仍会检查 Codex 的运行状态，如需重启会再次征求你的确认。`}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={cancel}>
            暂不使用
          </button>
          {requiresPurchase ? (
            <>
              <button className="btn btn-primary" onClick={() => {
                cancel();
                void unlockTheme(pendingId);
              }}>
                <Coins size={13} />
                {product?.pricePoints ? `${product.pricePoints} 积分解锁` : "免费解锁"}
              </button>
              {product && product.priceCents > 0 && (
                <button className="btn btn-secondary" onClick={() => {
                  cancel();
                  void purchaseTheme(pendingId);
                }}>
                  <CreditCard size={13} />支付宝 {priceText}
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => void confirm()}>
              <Play size={13} />应用该主题
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
