import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          boylan: "#0E4A7E",
          tasty: "#E5614F",
          ink: "#0B1220",
          muted: "#6B7280",
          bg: "#F7F8FB",
          border: "#E5E7EB"
        }
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;
