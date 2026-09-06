import React, { Component, type ErrorInfo, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "antd/dist/reset.css";
import "./styles.css";
import App from "./App";
import { tr } from "./i18n";

class PortalErrorBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: "" };

  static getDerivedStateFromError(error: unknown) {
    return { message: error instanceof Error ? error.message : tr("未知错误") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Portal render failed", error, info);
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <main className="fatal-error" role="alert">
        <div>
          <p>{tr("Harbor 结果分析")}</p>
          <h1>{tr("页面加载失败")}</h1>
          <p>{tr("请刷新页面重试；如果问题持续出现，请保留下方错误信息。")}</p>
          <pre>{this.state.message}</pre>
          <button type="button" onClick={() => window.location.reload()}>{tr("重新加载")}</button>
        </div>
      </main>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PortalErrorBoundary><App /></PortalErrorBoundary>
  </React.StrictMode>,
);
