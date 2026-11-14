import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import decoderJS from "three/addons/libs/draco/gltf/draco_wasm_wrapper.js?url";
import decoderWasm from "three/addons/libs/draco/gltf/draco_decoder.wasm?url";
import { headshot } from "./headshots.js";

const models = import.meta.glob("./assets/animal-patrol/*.glb", {
  eager: true,
  query: "?url",
  import: "default",
});
const decoder = new DRACOLoader().setDecoderPath({
  js: decoderJS,
  wasm: decoderWasm,
});
const loader = new GLTFLoader().setDRACOLoader(decoder);

export function patrolPortrait(name) {
  return headshot(name, true, () =>
    loader.loadAsync(
      models[`./assets/animal-patrol/${name.toLowerCase()}.glb`],
    ),
  );
}
