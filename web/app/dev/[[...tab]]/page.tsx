import { TAB_SLUGS } from "~/shell/tabRoutes";

export function generateStaticParams() {
  return [{ tab: [] }, ...Object.values(TAB_SLUGS).map((slug) => ({ tab: [slug] }))];
}

export default function DevTabPage() {
  return null;
}
