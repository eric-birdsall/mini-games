import * as THREE from "three";

const songs = Object.entries(
  import.meta.glob("./assets/audio/shuffleboard/*.mp3", {
    eager: true,
    import: "default",
    query: "?url",
  }),
).map(([path, url]) => ({
  title: path
    .split("/")
    .at(-1)
    .replace(/\.mp3$/, "")
    .replaceAll("_", " "),
  url,
}));

export function createRecordPlayers(rooms) {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disk = new THREE.CylinderGeometry(1, 1, 1, 40);
  const material = (color, roughness = 0.65) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const veneer = material("#8d5036");
  const dark = material("#252023");
  const brass = material("#cea264", 0.34);
  const vinyl = material("#211f2b", 0.24);
  const grooves = material("#55505a", 0.4);
  const label = material("#e9b36f");
  const lamp = new THREE.MeshBasicMaterial({ color: "#ffd490" });

  function part(parent, geometry, mat, x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }

  const positions = {
    study: [6.55, -2.07, "#623721"],
    cabin: [7.15, 2.06, "#926341"],
    sunroom: [6.5, -2.08, "#5f7461"],
  };
  return Object.fromEntries(
    Object.entries(positions).map(([room, [x, z, color]]) => {
      const player = new THREE.Group();
      player.position.set(x, 0, z);
      player.rotation.y = z < 0 ? -1.21 : -1.93;
      rooms[room].add(player);
      const cabinet = material(color);
      for (const side of [-1, 1]) {
        for (const front of [-1, 1]) {
          part(
            player,
            box,
            cabinet,
            side * 0.43,
            0.4,
            front * 0.31,
            0.105,
            0.8,
            0.105,
          );
        }
      }
      part(player, box, cabinet, 0, 0.61, 0, 0.99, 0.22, 0.73);
      part(player, box, cabinet, 0, 0.85, 0, 1.11, 0.14, 0.83);
      part(player, box, dark, 0, 0.63, 0.37, 0.73, 0.12, 0.015);
      part(player, box, brass, 0, 0.64, 0.39, 0.22, 0.027, 0.034);
      part(player, box, veneer, 0, 0.98, 0, 0.98, 0.15, 0.76);
      part(player, box, dark, 0, 1.058, 0, 0.89, 0.035, 0.68);

      const lid = part(player, box, veneer, 0, 1.39, -0.43, 0.99, 0.69, 0.046);
      lid.rotation.x = -0.19;
      const lining = part(
        player,
        box,
        dark,
        0,
        1.39,
        -0.399,
        0.84,
        0.54,
        0.012,
      );
      lining.rotation.x = lid.rotation.x;
      const badge = part(
        player,
        box,
        brass,
        0,
        1.45,
        -0.383,
        0.39,
        0.08,
        0.015,
      );
      badge.rotation.x = lid.rotation.x;

      const record = new THREE.Group();
      record.position.set(-0.085, 1.1, 0.015);
      player.add(record);
      part(record, disk, vinyl, 0, 0, 0, 0.303, 0.021, 0.303);
      for (const radius of [0.18, 0.213, 0.247, 0.28]) {
        const ring = new THREE.RingGeometry(radius - 0.002, radius, 48);
        const groove = part(record, ring, grooves, 0, 0.011, 0, 1, 1, 1);
        groove.rotation.x = -Math.PI / 2;
      }
      part(record, disk, label, 0, 0.015, 0, 0.103, 0.012, 0.103);
      part(record, box, brass, 0.047, 0.022, 0, 0.068, 0.004, 0.021);
      part(record, disk, brass, 0, 0.032, 0, 0.015, 0.044, 0.015);

      part(player, disk, brass, 0.337, 1.105, -0.237, 0.059, 0.09, 0.059);
      const arm = part(
        player,
        box,
        brass,
        0.215,
        1.158,
        -0.091,
        0.027,
        0.023,
        0.39,
      );
      arm.rotation.y = -0.59;
      part(player, box, dark, 0.11, 1.141, 0.064, 0.065, 0.035, 0.074);
      part(player, disk, lamp, 0.356, 1.084, 0.271, 0.024, 0.023, 0.024);
      return [room, { player, record }];
    }),
  );
}

export function setupRecordControls(page) {
  const trigger = page.querySelector("[data-record-player]");
  const panel = page.querySelector("[data-record-panel]");
  const list = panel.querySelector("[data-record-songs]");
  const status = panel.querySelector("[data-record-status]");
  const stop = panel.querySelector("[data-record-stop]");
  const audio = panel.querySelector("audio");
  audio.volume = 0.5;
  let selected;
  let request = 0;
  let disposed = false;

  function refresh() {
    for (const [index, button] of Array.from(list.children).entries()) {
      button.setAttribute("aria-pressed", String(index === selected));
    }
    stop.disabled = selected === undefined;
  }

  function close(resumePlay = false) {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    const action = page.querySelector("[data-action]:not([hidden])");
    (resumePlay ? action || page : trigger.hidden ? page : trigger).focus({
      preventScroll: true,
    });
  }

  function open() {
    if (!panel.hidden) return;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    (
      list.children[selected ?? 0] || panel.querySelector("[data-record-close]")
    ).focus({ preventScroll: true });
  }

  function stopAudio() {
    request++;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    selected = undefined;
    refresh();
  }

  songs.forEach(({ title, url }, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = title;
    button.onclick = async () => {
      const current = ++request;
      selected = index;
      refresh();
      status.textContent = `Loading ${title}…`;
      audio.src = url;
      try {
        await audio.play();
        if (current !== request || disposed) return;
        status.textContent = `Playing ${title}`;
        if (!panel.hidden) close(true);
      } catch {
        if (current !== request || disposed) return;
        selected = undefined;
        refresh();
        status.textContent = `Could not play ${title}. Choose a record to try again.`;
      }
    };
    list.append(button);
  });

  audio.onended = () => {
    status.textContent = `${songs[selected]?.title ?? "Record"} finished.`;
    selected = undefined;
    refresh();
  };
  stop.onclick = () => {
    stopAudio();
    status.textContent = "Playback stopped.";
  };
  trigger.onclick = open;
  panel.querySelector("[data-record-close]").onclick = () => close();
  status.textContent = songs.length
    ? "Choose a record."
    : "No records available.";
  refresh();

  return {
    get open() {
      return !panel.hidden;
    },
    get rotation() {
      return audio.currentTime * Math.PI * 1.11;
    },
    show: open,
    close,
    position(point) {
      trigger.hidden = !point;
      if (point) {
        trigger.style.left = `${point.x * 100}%`;
        trigger.style.top = `${point.y * 100}%`;
      }
    },
    dispose() {
      disposed = true;
      stopAudio();
    },
  };
}
