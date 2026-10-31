"use client";
import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

const ClientShell = dynamic(() => import("~/shell/ClientShell"), { ssr: false });

/** Development only: the app without an account, deck from the local file, tab URLs under /dev */
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <>
      <ClientShell devOffline basePath="/dev" />
      {children}
    </>
  );
}
