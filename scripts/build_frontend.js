const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');
const distDir = path.join(publicDir, 'dist');

async function run() {
  fs.mkdirSync(distDir, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(publicDir, 'script.js')],
    outfile: path.join(distDir, 'script.min.js'),
    bundle: true,
    minify: true,
    sourcemap: false,
    target: ['es2018'],
    logLevel: 'info',
  });

  const css = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf8');
  const transformed = await esbuild.transform(css, { loader: 'css', minify: true, sourcemap: false });
  fs.writeFileSync(path.join(distDir, 'style.min.css'), transformed.code, 'utf8');

  console.log('Frontend build complete:', path.relative(root, distDir));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
