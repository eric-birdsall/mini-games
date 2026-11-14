import * as T from "three";

const colors = {
  poke: 0xef625b,
  great: 0x65aaff,
  ultra: 0xf5c94b,
  master: 0xc38bff,
};

export function createPatrolBall() {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(40, 40, false);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1.25, 1.25, 1.25, -1.25, 0.1, 10);
  camera.position.z = 4;
  scene.add(new T.HemisphereLight(0xffffff, 0x8697a9, 1.6));
  const key = new T.DirectionalLight(0xfff4df, 2.5);
  key.position.set(-2, 3, 4);
  scene.add(key);

  const ball = new T.Group();
  scene.add(ball);
  const shell = new T.MeshStandardMaterial({ roughness: 0.29 });
  const ivory = new T.MeshStandardMaterial({
    color: 0xfff3cf,
    roughness: 0.35,
  });
  const trim = new T.MeshStandardMaterial({ color: 0x172326, roughness: 0.5 });
  const button = new T.MeshStandardMaterial({
    color: 0xeafaff,
    roughness: 0.25,
  });
  const band = 0.075;

  ball.add(
    new T.Mesh(
      new T.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2 - band),
      shell,
    ),
    new T.Mesh(
      new T.SphereGeometry(
        1,
        32,
        16,
        0,
        Math.PI * 2,
        Math.PI / 2 + band,
        Math.PI / 2 - band,
      ),
      ivory,
    ),
    new T.Mesh(new T.SphereGeometry(0.985, 32, 16), trim),
  );

  for (const [radius, depth, z, material] of [
    [0.25, 0.14, 0.99, trim],
    [0.155, 0.05, 1.075, button],
  ]) {
    const clasp = new T.Mesh(
      new T.CylinderGeometry(radius, radius, depth, 24),
      material,
    );
    clasp.rotation.x = Math.PI / 2;
    clasp.position.z = z;
    ball.add(clasp);
  }

  function render(kind, pitch, yaw) {
    shell.color.setHex(colors[kind]);
    ball.rotation.set(pitch, yaw, 0);
    renderer.render(scene, camera);
  }

  return {
    draw(host, kind, pitch, yaw) {
      if (renderer.domElement.parentNode !== host)
        host.append(renderer.domElement);
      render(kind, pitch, yaw);
    },
    preview(kind) {
      const canvas = document.createElement("canvas");
      canvas.width = renderer.domElement.width;
      canvas.height = renderer.domElement.height;
      render(kind, 0.24, -0.28);
      canvas.getContext("2d").drawImage(renderer.domElement, 0, 0);
      return canvas;
    },
    dispose() {
      ball.children.forEach((mesh) => mesh.geometry.dispose());
      for (const material of [shell, ivory, trim, button]) material.dispose();
      renderer.dispose();
    },
  };
}
