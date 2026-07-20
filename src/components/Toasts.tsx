import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useApp } from "../store";

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div className={`toast ${toast.kind}`} key={toast.id}>
          {toast.kind === "ok" && <CircleCheck size={15} />}
          {toast.kind === "err" && <TriangleAlert size={15} />}
          {toast.kind === "info" && <Info size={15} />}
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
