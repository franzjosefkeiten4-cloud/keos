const tasks = [
    {
        id: "t1",
        title: "Offene Reklamation prüfen",
        reason: "MR-002 · Reklamation vor Umsatz.",
        priority: 100
    },
    {
        id: "t2",
        title: "Zugesagte Unterlagen versenden",
        reason: "MR-001 · Versprechen zuerst.",
        priority: 95
    },
    {
        id: "t3",
        title: "Kaufbereiten Kunden zurückrufen",
        reason: "MR-003 · Kaufbereite Kunden vor kalten Leads.",
        priority: 90
    },
    {
        id: "t4",
        title: "Nachbetreuung nach sechs Wochen",
        reason: "MR-004 · Zufriedenheit vor neuer Reichweite.",
        priority: 70
    }
];

const completed = new Set(
    JSON.parse(localStorage.getItem("keosCompletedTasks") || "[]")
);
const taskList = document.querySelector("#taskList");
const taskCount = document.querySelector("#taskCount");

export function renderTasks() {
    taskList.innerHTML = "";

    [...tasks]
        .sort((a, b) => b.priority - a.priority)
        .forEach((task, index) => {
            const article = document.createElement("article");
            article.className = `task${completed.has(task.id) ? " done" : ""}`;
            article.innerHTML = `
                <div class="priority">${index + 1}</div>
                <div>
                    <p class="task-title">${task.title}</p>
                    <p class="task-reason">${task.reason}</p>
                </div>
                <button data-task-id="${task.id}">
                    ${completed.has(task.id) ? "Wieder öffnen" : "Erledigt"}
                </button>
            `;
            taskList.appendChild(article);
        });

    taskCount.textContent = `${tasks.length} Aufgaben`;
}

taskList.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-task-id]");

    if (!b) {
        return;
    }

    if (completed.has(b.dataset.taskId)) {
        completed.delete(b.dataset.taskId);
    } else {
        completed.add(b.dataset.taskId);
    }

    localStorage.setItem("keosCompletedTasks", JSON.stringify([...completed]));
    renderTasks();
});

document.querySelector("#refreshButton").addEventListener("click", renderTasks);
