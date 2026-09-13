import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    react(),
    dts({ include: ["src"], rollupTypes: true }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "CoonMeetingSdk",
      fileName: (format) => format === "es" ? "coon-meeting-sdk.js" : "coon-meeting-sdk.cjs",
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      // react/react-dom are peer deps - the integrator's own app supplies them, and bundling a
      // second copy is how you get "Invalid hook call" from two React instances on one page.
      external: ["react", "react-dom", "react/jsx-runtime"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
        },
      },
    },
    sourcemap: true,
  },
});
