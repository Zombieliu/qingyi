import { Clock3, Headphones, Map, Shield, Smartphone, Trophy } from "lucide-react";
import { t } from "@/lib/i18n/i18n-client";

const features = [
  {
    title: t("components.features.i080"),
    desc: t("components.features.i081"),
    icon: Clock3,
  },
  {
    title: t("components.features.i082"),
    desc: t("components.features.i083"),
    icon: Headphones,
  },
  {
    title: t("components.features.i084"),
    desc: t("components.features.i085"),
    icon: Map,
  },
  {
    title: t("components.features.i086"),
    desc: t("components.features.i087"),
    icon: Shield,
  },
  {
    title: t("components.features.i088"),
    desc: t("components.features.i089"),
    icon: Smartphone,
  },
  {
    title: t("components.features.i090"),
    desc: t("components.features.i091"),
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
