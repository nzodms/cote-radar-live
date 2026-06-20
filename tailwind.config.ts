import type { Config } from "tailwindcss";

/**
 * SupplierPilot design system.
 * Premium light SaaS: off-white / soft blue atmosphere, liquid-glass panels,
 * layered depth, refined shadows. Colors are driven by CSS variables declared
 * in app/globals.css so the system stays themeable.
 */
const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1440px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        // Semantic status palette (badges, dots, alerts)
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          soft: "hsl(var(--danger-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
        },
      },
      borderRadius: {
        "4xl": "2rem",
        "3xl": "1.5rem",
        "2xl": "calc(var(--radius) + 4px)",
        xl: "var(--radius)",
        lg: "calc(var(--radius) - 2px)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "0.875rem", letterSpacing: "0.01em" }],
      },
      boxShadow: {
        // Layered, soft, premium elevations
        xs: "0 1px 2px -1px rgba(16,24,40,0.08)",
        sm: "0 1px 3px rgba(16,24,40,0.06), 0 1px 2px -1px rgba(16,24,40,0.04)",
        card: "0 1px 0 0 rgba(255,255,255,0.7) inset, 0 1px 2px rgba(16,24,40,0.04), 0 10px 24px -14px rgba(16,24,40,0.18)",
        elevated:
          "0 1px 0 0 rgba(255,255,255,0.8) inset, 0 2px 4px rgba(16,24,40,0.04), 0 18px 40px -20px rgba(16,24,40,0.28)",
        glass:
          "0 1px 0 0 rgba(255,255,255,0.6) inset, 0 8px 32px -12px rgba(30,58,138,0.18)",
        glow: "0 0 0 1px rgba(37,99,235,0.18), 0 12px 32px -12px rgba(37,99,235,0.35)",
        "glow-soft": "0 0 0 1px rgba(37,99,235,0.10), 0 8px 24px -16px rgba(37,99,235,0.30)",
        focus: "0 0 0 4px hsl(var(--ring) / 0.16)",
      },
      backgroundImage: {
        "app-radial":
          "radial-gradient(1200px 600px at 12% -10%, hsl(var(--glow-1) / 0.55), transparent 55%), radial-gradient(900px 500px at 100% 0%, hsl(var(--glow-2) / 0.40), transparent 50%), radial-gradient(700px 700px at 50% 120%, hsl(var(--glow-3) / 0.30), transparent 55%)",
        "glass-sheen":
          "linear-gradient(180deg, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.25) 40%, rgba(255,255,255,0.08) 100%)",
        "primary-gradient":
          "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary-deep)) 100%)",
        "shimmer":
          "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.85)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.8)", opacity: "0.6" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "fade-up": "fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.3s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-dot": "pulse-dot 1.8s ease-in-out infinite",
        "pulse-ring": "pulse-ring 1.8s ease-out infinite",
        shimmer: "shimmer 1.8s infinite",
      },
      transitionTimingFunction: {
        premium: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
