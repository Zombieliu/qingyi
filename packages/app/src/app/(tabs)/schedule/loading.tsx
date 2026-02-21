export default function ScheduleLoading() {
  return (
    <div className="dl-main" style={{ padding: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* 标签栏骨架 */}
        <div style={{ display: "flex", gap: 8 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 72,
                height: 32,
                borderRadius: 16,
                background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
                backgroundSize: "200% 100%",
                animation: "skeleton-shimmer 1.5s ease-in-out infinite",
              }}
              aria-hidden="true"
            />
          ))}
        </div>
        {/* 订单卡片骨架 */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            style={{
              width: "100%",
              height: 120,
              borderRadius: 12,
              background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
              backgroundSize: "200% 100%",
              animation: "skeleton-shimmer 1.5s ease-in-out infinite",
            }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
