/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: { soft: "0 10px 30px rgba(0,0,0,.35)" }
    }
  },
  plugins: []
};
