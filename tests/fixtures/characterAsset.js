import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export async function assetWithoutTextures(url) {
  // Exercise the actual shipped mesh, skin and animation in Node. Only the
  // browser image decoding is omitted from this headless regression check.
  const bytes = await readFile(new URL(url));
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
  for (const mat of json.materials) {
    delete mat.normalTexture;
    delete mat.pbrMetallicRoughness.baseColorTexture;
  }
  delete json.images;
  delete json.textures;
  const text = Buffer.from(JSON.stringify(json));
  const chunk = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20);
  text.copy(chunk);
  const bin = bytes.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length + bin.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([header, chunk, bin]);
  return new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length),
    "",
  );
}
