import "./dashboard.js";

function renderVorgang(vorgang) {
    const container = document.getElementById('loadedVorgang');
    if (!container) return;

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value !== undefined && value !== null ? String(value) : '';
    };

    setText('vorgang-titel', vorgang.titel);
    setText('vorgang-status', vorgang.status);
    setText('vorgang-prioritaet', vorgang.prioritaet);
    setText('vorgang-kontext', vorgang.kontext);
    setText('vorgang-verantwortlich', vorgang.verantwortlich);
}

async function loadVorgang() {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");

        if (!response.ok) {
            console.error("Vorgang konnte nicht geladen werden:", response.status, response.statusText);
            return;
        }

        const vorgang = await response.json();
        console.log("Vorgang geladen:", vorgang);
        renderVorgang(vorgang);
    } catch (error) {
        console.error("Vorgang konnte nicht geladen werden:", error);
    }
}

loadVorgang();
