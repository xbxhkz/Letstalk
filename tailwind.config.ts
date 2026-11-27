import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: "#fe2c55", cyan: "#25f4ee" } },
      keyframes: {
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        floatHeart: {
          "0%": { transform: "translate(-50%,-50%) scale(0.3) rotate(var(--r))", opacity: "0" },
          "15%": { transform: "translate(-50%,-50%) scale(1.25) rotate(var(--r))", opacity: "1" },
          "30%": { transform: "translate(-50%,-50%) scale(1) rotate(var(--r))", opacity: "1" },
          "100%": { transform: "translate(-50%,-180%) scale(1.4) rotate(var(--r))", opacity: "0" },
        },
        popIn: {
          "0%": { transform: "translate(-50%,-50%) scale(0.6)", opacity: "0" },
          "20%": { transform: "translate(-50%,-50%) scale(1)", opacity: "1" },
          "80%": { opacity: "1" },
          "100%": { transform: "translate(-50%,-50%) scale(1.1)", opacity: "0" },
        },
        slideUp: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "translateY(0)" } },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        likePop: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.35)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        marquee: "marquee 8s linear infinite",
        "spin-slow": "spin 4s linear infinite",
        floatHeart: "floatHeart 0.9s ease-out forwards",
        popIn: "popIn 0.7s ease-out forwards",
        slideUp: "slideUp 0.28s cubic-bezier(0.2,0.8,0.2,1)",
        fadeIn: "fadeIn 0.2s ease-out",
        likePop: "likePop 0.35s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
