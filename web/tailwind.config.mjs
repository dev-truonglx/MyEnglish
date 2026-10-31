import base from "../tailwind.config.js";

// The desktop theme, scanning the shared components as well as the web shell
export default {
  ...base,
  content: ["./app/**/*.{ts,tsx}", "./shell/**/*.{ts,tsx}", "../src/**/*.{ts,tsx}"],
};
