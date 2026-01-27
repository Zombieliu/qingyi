import { Users, ShieldCheck, Radio, Sparkles, Download } from "lucide-react";

export function Hero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-white/5 to-white/0 p-8 shadow-2xl ring-1 ring-cyan-500/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.18),transparent_25%),radial-gradient(circle_at_80%_0%,rgba(139,92,246,0.22),transparent_24%)]" />
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center">
        <div className="flex-1 space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-cyan-100 ring-1 ring-white/20">
            <Sparkles className="h-4 w-4" />
            专注《三角洲行动》陪玩 / 组队
          </div>
          <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
            找到可靠队友、实时语音、战术指挥<br className="hidden sm:block" />
            全部在一个 PWA 里
          </h1>
          <p className="max-w-2xl text-lg text-cyan-50/80">
            Delta Link 帮你在 PC 与移动端快速匹配高质量陪玩、战术教练，提供一键开黑、房间语音、约战排期与战绩快照。
          </p>
          <div className="flex flex-wrap gap-3">
            <button className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-base font-semibold text-slate-900 shadow-lg shadow-cyan-500/30 transition hover:-translate-y-[1px] hover:bg-cyan-400">
              立即开黑
              <Radio className="h-4 w-4" />
            </button>
            <button className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-base font-semibold text-white transition hover:-translate-y-[1px] hover:border-white/40">
              下载到桌面
              <Download className="h-4 w-4" />
            </button>
          </div>
          <div className="flex gap-6 text-sm text-cyan-50/70">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>实时分段匹配</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              <span>陪玩实名认证</span>
            </div>
          </div>
        </div>
        <div className="flex-1">
          <div className="glass relative aspect-[4/5] overflow-hidden rounded-2xl p-5 shadow-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-purple-500/10" />
            <div className="relative flex h-full flex-col justify-between rounded-xl border border-white/10 bg-black/40 p-4">
              <div className="space-y-3 text-white">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/70">Delta Ops</span>
                  <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-100">
                    在线 1,247 人
                  </span>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-cyan-500 to-purple-500" />
                    <div>
                      <div className="text-sm text-white/60">三角洲行动</div>
                      <div className="text-lg font-semibold text-white">战术陪玩房间</div>
                      <div className="text-xs text-cyan-100/80">SR 1700 · 语音中 · 6/8</div>
                    </div>
                    <button className="ml-auto rounded-full bg-cyan-500/90 px-3 py-1 text-xs font-semibold text-slate-950">
                      加入
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-white/70">
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white/60">匹配速度</div>
                    <div className="text-2xl font-semibold text-white">0:35s</div>
                    <div className="text-[11px] text-cyan-100/80">较昨日 +12%</div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="text-white/60">陪玩好评</div>
                    <div className="text-2xl font-semibold text-white">98.4%</div>
                    <div className="text-[11px] text-cyan-100/80">近 200 场</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/80">
                <div>
                  <div className="text-white/60">下一场约战</div>
                  <div className="text-sm font-semibold text-white">今晚 21:00 · 8 人房</div>
                </div>
                <button className="rounded-full border border-cyan-400/70 px-3 py-1 text-[11px] font-semibold text-cyan-100">
                  设提醒
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
