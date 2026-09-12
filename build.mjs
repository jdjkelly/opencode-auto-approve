import { build } from "esbuild"
import { readFile } from "node:fs/promises"
import { transformAsync } from "@babel/core"
import typescript from "@babel/preset-typescript"
import solid from "babel-preset-solid"

// Package installs live under node_modules, where the host does not compile
// TSX with its local-plugin transform. Ship Solid universal output instead.
// Host UI modules must stay external to share its reactive/runtime contexts.
await build({
  entryPoints: ["tui.tsx"],
  outfile: "dist/tui.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  external: ["solid-js", "solid-js/*", "@opentui/*", "@opencode/plugin/*"],
  plugins: [
    {
      name: "solid-universal",
      setup(builder) {
        builder.onLoad({ filter: /\.tsx$/ }, async ({ path }) => {
          const result = await transformAsync(await readFile(path, "utf8"), {
            filename: path,
            configFile: false,
            babelrc: false,
            presets: [
              [solid, { moduleName: "@opentui/solid", generate: "universal" }],
              typescript,
            ],
          })
          return { contents: result.code, loader: "js" }
        })
      },
    },
  ],
})
