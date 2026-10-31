"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

const ClientShell = dynamic(() => import("~/shell/ClientShell"), { ssr: false });

export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <ClientShell basePath="/learn" />
      {children}
    </>
  );
}
