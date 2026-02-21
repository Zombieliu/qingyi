import { Mic2, Users, ShieldCheck } from "lucide-react";

interface LobbyCardProps {
  title: string;
  level: string;
  mode: string;
  slots: string;
  voice: boolean;
  verified?: boolean;
}

export function LobbyCard({ title, level, mode, slots, voice, verified }: LobbyCardProps) {
  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4 text-white">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-purple-500 text-lg font-semibold">
        {title.slice(0, 2)}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-sm text-white/80">
          <span className="font-semibold text-white">{title}</span>
          {verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-[2px] text-[11px] font-semibold text-emerald-200 ring-1 ring-emerald-400/40">
              <ShieldCheck className="h-3 w-3" /> 认证
            </span>
          )}
        </div>
        <div className="text-xs text-cyan-100/80">
          {level} · {mode}
        </div>
        <div className="flex items-center gap-3 text-xs text-white/70">
          <div className="flex items-center gap-1">
            <Users className="h-4 w-4" /> {slots}
          </div>
          {voice && (
            <div className="flex items-center gap-1">
              <Mic2 className="h-4 w-4" /> 语音中
            </div>
          )}
        </div>
      </div>
      <button className="rounded-full bg-cyan-500/90 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:-translate-y-[1px]">
        加入
      </button>
    </div>
  );
}
