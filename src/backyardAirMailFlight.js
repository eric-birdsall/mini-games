export const picnicTable = { x: 0, z: 26, y: 2.4, w: 12, d: 21 };

export const targets = [
  {
    id: "basket",
    name: "Picnic basket",
    x: 0,
    z: 25,
    y: picnicTable.y + 0.36,
    w: 2.6,
    d: 2.8,
    points: 300,
  },
  {
    id: "pie",
    name: "Blueberry pie",
    x: 4.5,
    z: 35,
    y: picnicTable.y + 0.29,
    w: 2,
    d: 2,
    round: true,
    points: 600,
  },
  {
    id: "plate",
    name: "Paper plate",
    x: -3.4,
    z: 16,
    y: picnicTable.y + 0.12,
    w: 3.35,
    d: 3.35,
    round: true,
    points: 100,
  },
];

const ground = { y: 0 };

export function nextTargetLayout(previous, random = Math.random) {
  // One target per depth band leaves room for the basket lid and score labels.
  const bands = [16, 26.5, 37];
  for (let i = bands.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [bands[i], bands[j]] = [bands[j], bands[i]];
  }
  return previous.map((target, i) => ({
    ...target,
    x: (target.x > 0 ? -1 : 1) * (2.5 + random() * 4),
    z: bands[i] + random() - 0.5,
  }));
}

export const trackLength = 35;
export const rideHeight = 0.31;

export function trackPoint(distance) {
  if (distance < 12) {
    const t = distance / 12;
    return { x: -2, y: 0.75 + 8 * (1 - t) ** 2, z: distance - 26 };
  }
  if (distance < 28) {
    const t = (distance - 12) / 16;
    const angle = t * Math.PI * 2;
    return {
      x: -2 + 2 * t * t * (3 - 2 * t),
      y: 0.75 + 2.55 * (1 - Math.cos(angle)),
      z: -14 + 2.55 * Math.sin(angle),
    };
  }
  const t = (distance - 28) / 7;
  return { x: 0, y: 0.75 + 6.1 * t ** 2, z: -14 + 14 * t };
}

export function newFlight(layout = targets) {
  return {
    ...trackPoint(0),
    distance: 0,
    landingSurfaces: [...layout, picnicTable, ground],
    vx: 0,
    vz: 9,
    vy: 3.6,
    phase: "track",
    deploy: 0,
    surface: null,
    points: 0,
  };
}

export function releaseGlider(car) {
  if (car.phase !== "air" || car.deploy === 0) return;
  Object.assign(car, { phase: "drop", deploy: 0, vx: 0, vy: 0, vz: 0 });
}

export function stepFlight(car, dt, steer, pitch) {
  if (car.phase === "track") {
    car.distance = Math.min(
      trackLength,
      car.distance + (4 + car.distance * 0.35) * dt,
    );
    Object.assign(car, trackPoint(car.distance));
    if (car.distance === trackLength) {
      car.y += rideHeight;
      car.phase = "air";
    }
    return;
  }
  if (car.phase !== "air" && car.phase !== "drop") return;

  const { x, y, z } = car;
  if (car.phase === "drop") {
    car.vy -= 9.8 * dt;
  } else {
    const response = 1 - Math.exp(-3.5 * dt);
    car.deploy = Math.min(1, car.deploy + dt / 0.45);
    car.vx += (steer * 5.5 - car.vx) * response;
    // Nose down builds speed at the cost of altitude. Flare to shorten the run.
    car.vz += (7.5 + pitch * (pitch < 0 ? 5 : 4) - car.vz) * response;
    car.vy += (-1.45 - pitch * 0.15 - car.vy) * response;
  }
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.z += car.vz * dt;

  for (const target of car.landingSurfaces) {
    const height = target.y + rideHeight;
    if (y < height || car.y > height || car.vy >= 0) continue;
    const t = (y - height) / (y - car.y);
    const contactX = x + (car.x - x) * t;
    const contactZ = z + (car.z - z) * t;
    const dx = (contactX - target.x) / target.w;
    const dz = (contactZ - target.z) / target.d;
    if (
      target.w &&
      (target.round
        ? dx ** 2 + dz ** 2 > 1
        : Math.max(Math.abs(dx), Math.abs(dz)) > 1)
    )
      continue;

    Object.assign(car, {
      x: contactX,
      y: height,
      z: contactZ,
      phase: "done",
      deploy: 0,
      points: target.points ?? 0,
      surface: target.w ? target : null,
    });
    return;
  }
}
