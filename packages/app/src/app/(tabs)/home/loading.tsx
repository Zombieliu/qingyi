import styles from "./home.module.css";

function Skeleton({ width, height }: { width: string; height: string }) {
  return (
    <div
      className={styles["lc-skeleton"]}
      style={{ width, height, borderRadius: 8 }}
      aria-hidden="true"
    />
  );
}

export default function HomeLoading() {
  return (
    <div className="dl-main" style={{ padding: "0 16px" }}>
      {/* 搜索栏骨架 */}
      <Skeleton width="100%" height="40px" />

      {/* 快捷操作骨架 */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} width="100%" height="72px" />
        ))}
      </div>

      {/* 陪练列表骨架 */}
      <div style={{ marginTop: 24 }}>
        <Skeleton width="120px" height="20px" />
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="80px" />
          ))}
        </div>
      </div>

      {/* 公告骨架 */}
      <div style={{ marginTop: 24 }}>
        <Skeleton width="80px" height="20px" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} width="100%" height="44px" />
          ))}
        </div>
      </div>
    </div>
  );
}
