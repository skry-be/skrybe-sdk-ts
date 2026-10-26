import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // ES2020 is what Node 18, current browsers, Deno, Bun and Workers all run.
  target: 'es2020',
  dts: true,
  sourcemap: true,
  clean: true,
})
