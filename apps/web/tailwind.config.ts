import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#132238",
        lagoon: "#08776f",
        gold: "#c9972b",
        mist: "#eef6f5"
      }
    }
  },
  plugins: []
};

export default config;
