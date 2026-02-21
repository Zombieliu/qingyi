"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { PASSKEY_STORAGE_KEY } from "./passkey-wallet";
import { useMantouBalance } from "@/lib/atoms/mantou-atom";

export { useMantouBalance } from "@/lib/atoms/mantou-atom";

export function MantouProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname.startsWith("/admin");
  const { refresh } = useMantouBalance();

  useEffect(() => {
    if (isAdminRoute) return;
    refresh();
    const handlePasskey = () => {
      refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PASSKEY_STORAGE_KEY) {
        refresh();
      }
    };
    window.addEventListener("passkey-updated", handlePasskey);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("passkey-updated", handlePasskey);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, isAdminRoute]);

  return <>{children}</>;
}
