import { renderDecision } from "./decision.js";
import { renderTasks } from "./tasks.js";

const greetingElement = document.querySelector("header.topbar h1");
const todayMessageElement = document.querySelector("header.topbar div > p:last-of-type");

if (greetingElement) {
    greetingElement.textContent = "Guten Morgen Franz-Josef 👋";
}

if (todayMessageElement) {
    todayMessageElement.textContent =
        "Heute triffst du Entscheidungen, die Menschen besser schlafen, wohnen und arbeiten lassen.";
}

renderDecision();
renderTasks();

const feedbackForm = document.querySelector("#feedbackForm");

if (feedbackForm) {
    feedbackForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const input = document.querySelector("#feedbackInput");
        const msg = document.querySelector("#feedbackMessage");
        const value = input.value.trim();

        if (!value) {
            msg.textContent = "Bitte zuerst eine Rückmeldung eingeben.";
            return;
        }

        const feedback = JSON.parse(localStorage.getItem("keosFeedback") || "[]");
        feedback.push({
            text: value,
            createdAt: new Date().toISOString()
        });

        localStorage.setItem("keosFeedback", JSON.stringify(feedback));
        input.value = "";
        msg.textContent = "Rückmeldung lokal gespeichert.";
    });
}
