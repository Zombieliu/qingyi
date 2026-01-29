import { Clock3, Headphones, Map, Shield, Smartphone, Trophy } from "lucide-react";

const features = [
  {
    title: "快速排队",
    desc: "根据段位/位置智能匹配陪玩与队友，平均 40 秒入队。",
    icon: Clock3,
  },
  {
    title: "语音就绪",
    desc: "内置低延迟语音，免切换 Discord / YY。",
    icon: Headphones,
  },
  {
    title: "战术白板",
    desc: "战场小地图标注与战术预设，适配三角洲行动地图池。",
    icon: Map,
  },
  {
    title: "安全陪玩",
    desc: "全量陪玩实名认证 + 违规拦截，保证体验。",
    icon: Shield,
  },
  {
    title: "跨端一致",
    desc: "PWA 一键添加到桌面，PC/移动端界面一致。",
    icon: Smartphone,
  },
  {
    title: "战绩同步",
    desc: "上传对局截图，自动识别战绩并生成战报。",
    icon: Trophy,
  },
];

export function Features() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      {features.map(({ title, desc, icon: Icon }) => (
        <div
          key={title}
          className="glass group rounded-2xl p-5 transition hover:-translate-y-[1px] hover:border-white/20"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-white/10 p-2 text-cyan-200 ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <p className="mt-1 text-sm text-cyan-50/75">{desc}</p>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
