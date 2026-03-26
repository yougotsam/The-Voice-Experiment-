const fs = require("fs");
const path = require("path");

const publicDir = path.join(__dirname, "..", "public");
const vadDist = path.join(__dirname, "..", "node_modules", "@ricky0123", "vad-web", "dist");
const onnxDist = path.join(__dirname, "..", "node_modules", "onnxruntime-web", "dist");

const files = [
  { src: path.join(vadDist, "silero_vad_legacy.onnx"), dest: path.join(publicDir, "silero_vad_legacy.onnx") },
  { src: path.join(vadDist, "silero_vad_v5.onnx"), dest: path.join(publicDir, "silero_vad_v5.onnx") },
  { src: path.join(vadDist, "vad.worklet.bundle.min.js"), dest: path.join(publicDir, "vad.worklet.bundle.min.js") },
];

if (fs.existsSync(onnxDist)) {
  for (const f of fs.readdirSync(onnxDist)) {
    if (f.endsWith(".wasm")) {
      files.push({ src: path.join(onnxDist, f), dest: path.join(publicDir, f) });
    }
  }
}

let copied = 0;
for (const { src, dest } of files) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copied++;
  }
}
console.log(`Copied ${copied} VAD/ONNX files to public/`);
