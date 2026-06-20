import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fond noir / bleu nuit premium
        night: {
          950: "#05070f",
          900: "#080b16",
          850: "#0b1020",
          800: "#0e1426",
          700: "#131b32",
          600: "#1a2440",
          500: "#243152",
        },
        border: {
          subtle: "#1c2740",
          DEFAULT: "#243152",
          strong: "#33436b",
        },
        // Signaux
        signal: {
          strong: "#10b981",
          medium: "#f59e0b",
          weak: "#64748b",
          none: "#475569",
        },
        risk: {
          low: "#22c55e",
          medium: "#f59e0b",
          high: "#ef4444",
        },
        accent: {
          DEFAULT: "#3b82f6",
          bright: "#60a5fa",
          deep: "#1d4ed8",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(59,130,246,0.25), 0 8px 30px -10px rgba(59,130,246,0.35)",
      },
      keyframes: {
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "pulse-live": "pulse-live 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
