import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0B1F3A",
        accent: "#2F6BFF",
        soft: "#F5F7FA",
        bgMain: "#F5F7FA",
        bgDark: "#0B1F3A",
        textPrimary: "#0B1220",
        textSecondary: "#64748B",
        borderLight: "#E5E7EB",
        success: "#10B981",
        warning: "#F59E0B",
        error: "#EF4444",
        disabled: "#9CA3AF"
      },
      borderRadius: {
        md: "8px",
        lg: "12px",
        xl: "12px"
      },
      boxShadow: {
        sm: "0 2px 6px rgba(0,0,0,0.04)"
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
