/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#080F1D", 900: "#080F1D", 850: "#0C1526", 800: "#111D2F", 750: "#16243A", 700: "#1C2A40", 600: "#22324B", 500: "#2A3A55", 400: "#3A4D6B" },
        pos: "#54E6C1",
        neg: "#FF8290",
        sky: { DEFAULT: "#9CC8FF", deep: "#16294A" },
        mute: { DEFAULT: "#8A9BB5", strong: "#C9D4E5" },
      },
      fontFamily: { sans: ["Manrope", "system-ui", "-apple-system", "Segoe UI", "sans-serif"] },
      boxShadow: { card: "0 1px 0 rgba(255,255,255,0.02) inset, 0 8px 24px -16px rgba(0,0,0,0.6)" },
    },
  },
  plugins: [],
};
