import { loadTodayData } from "./data.js";

export async function renderDecision() {
    const today = await loadTodayData();
    const decisionCard = document.getElementById("decisionCard");

    decisionCard.innerHTML = `
        <div class="card" style="margin-bottom:20px;border:3px solid #7B8332;">
            <h3>${today.decision.title}</h3>
            <p>${today.decision.reason}</p>
        </div>
    `;
}
