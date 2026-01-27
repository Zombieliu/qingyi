import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import PasskeyLoginButton from "./components/passkey-login-button";

export default function RootPage() {
  return (
    <div className="login-shell">
      <div className="login-header">
        <div className="login-icon">
          <Image src="/icon-192.png" alt="情谊电竞" width={76} height={76} priority />
        </div>
        <div className="login-title">情谊电竞</div>
        <div className="login-sub">游戏不仅仅是游戏，陪玩可以走进生活，也能改变生活</div>
      </div>

      <div className="login-passkey">
        <ShieldCheck size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
        没账号？用 Passkey 一键注册/登录
      </div>
      <PasskeyLoginButton />
      <div style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}>
        <Link href="/home" style={{ textDecoration: "underline" }}>
          已完成验证？进入主页
        </Link>
      </div>
    </div>
  );
}
