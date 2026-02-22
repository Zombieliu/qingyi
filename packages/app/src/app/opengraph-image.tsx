import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "情谊电竞 - 三角洲行动陪玩平台";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: "#22d3ee",
          marginBottom: 16,
        }}
      >
        情谊电竞
      </div>
      <div
        style={{
          fontSize: 36,
          color: "#e2e8f0",
          marginBottom: 32,
        }}
      >
        三角洲行动 · 陪玩调度平台
      </div>
      <div
        style={{
          display: "flex",
          gap: 32,
          color: "#94a3b8",
          fontSize: 24,
        }}
      >
        <span>🎮 极速撮合</span>
        <span>🔒 押金保障</span>
        <span>📊 全程可追踪</span>
      </div>
    </div>,
    { ...size }
  );
}
