import { pauseBar } from "./pauseActions.js";

export const resultTrophy = `<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4m10-4h3a3 3 0 0 1-3 4"/></svg>`;

export function gameResults(root, game, restart, home, extra = "") {
  const screen = document.createElement("section");
  screen.className = "game-results";
  screen.hidden = true;
  screen.setAttribute("aria-label", `${game} results`);
  screen.innerHTML = `
    ${pauseBar(game)}
    <div class="result-card">
      <div class="eyebrow">${game} · Final</div>
      <span class="result-icon">${resultTrophy}</span>
      <h2></h2>
      <p></p>
      <div class="result-stats"></div>
      <button type="button" class="primary">PLAY AGAIN <span aria-hidden="true">→</span></button>
      ${extra}
      <button type="button" class="text-button" data-result-home>BACK TO THE MENU ↗</button>
    </div>`;
  root.append(screen);
  const query = (selector) => screen.querySelector(selector);
  const play = query(".primary");
  play.onclick = query("[data-pause-restart]").onclick = restart;
  query("[data-result-home]").onclick = query("[data-pause-home]").onclick =
    home;

  return {
    show(title, detail, scores) {
      query("h2").textContent = title;
      query("p").textContent = detail;
      query(".result-stats").replaceChildren(
        ...scores.map(([value, label]) => {
          const stat = document.createElement("div");
          const score = document.createElement("strong");
          const caption = document.createElement("small");
          score.textContent = value;
          caption.textContent = label;
          stat.append(score, caption);
          return stat;
        }),
      );
      for (const child of root.children) child.inert = child !== screen;
      screen.hidden = false;
      play.focus({ preventScroll: true });
    },
    hide() {
      if (screen.hidden) return;
      screen.hidden = true;
      for (const child of root.children) child.inert = false;
    },
  };
}
