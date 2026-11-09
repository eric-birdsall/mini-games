import * as T from "three";
import {
  loadCharacters,
  createCharacter,
  animateCharacter,
} from "./characters.js";
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color("#18202a");
const camera = new T.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 40);
camera.position.set(0, 1.5, -6.5);
camera.lookAt(0, 0.95, 0);
scene.add(new T.HemisphereLight("#d8e6ff", "#77705e", 2));
const key = new T.DirectionalLight("#fff1d8", 3);
key.position.set(-3, 5, -4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(key);
const rim = new T.DirectionalLight("#91baff", 2);
rim.position.set(3, 3, 2);
scene.add(rim);
const floor = new T.Mesh(
  new T.PlaneGeometry(30, 30),
  new T.MeshStandardMaterial({ color: "#303b46", roughness: 0.92 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
let actors = [],
  pose = "idle",
  turn = false;
document.querySelectorAll("[data-pose]").forEach(
  (b) =>
    (b.onclick = () => {
      pose = b.dataset.pose;
      document.querySelector("#status").textContent = pose.toUpperCase();
    }),
);
document.querySelector("#turn").onclick = () => (turn = !turn);
loadCharacters()
  .then((asset) => {
    actors = ["attacker", "defender"].map((team, i) => {
      const actor = createCharacter(asset, team);
      actor.position.x = i ? -1 : 1;
      scene.add(actor);
      return actor;
    });
    document.querySelector("#status").textContent = "READY";
  })
  .catch((e) => (document.querySelector("#status").textContent = e.message));
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
let previousTime = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - previousTime) / 1000);
  previousTime = now;
  for (const actor of actors) {
    actor.rotation.y = turn ? Math.PI : 0;
    animateCharacter(
      actor,
      {
        moveSpeed:
          pose === "run"
            ? 5.8
            : pose === "walk"
              ? 2.5
              : pose === "crawl"
                ? 0.65
                : 0,
        equipped: null,
        crouch: pose === "crouch",
        prone: pose === "crawl",
      },
      dt,
    );
  }
  renderer.render(scene, camera);
});
