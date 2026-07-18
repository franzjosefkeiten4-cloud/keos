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

    const renderList = (id, items) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = '';
        if (!Array.isArray(items) || items.length === 0) {
            el.textContent = 'Keine Einträge vorhanden.';
            return;
        }
        items.forEach(item => {
            const p = document.createElement('p');
            if (item === null || item === undefined) {
                p.textContent = '';
            } else if (typeof item === 'string' || typeof item === 'number') {
                p.textContent = String(item);
            } else if (typeof item === 'object') {
                p.textContent = item.text || item.titel || item.name || JSON.stringify(item);
            } else {
                p.textContent = String(item);
            }
            el.appendChild(p);
        });
    };

    // localStorage key for this vorgang
    const localKey = `keosVorgangEvents:${vorgang.id}`;

    const loadLocal = () => {
        try {
            const raw = localStorage.getItem(localKey);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            return [];
        }
    };

    const saveLocal = (arr) => {
        try {
            localStorage.setItem(localKey, JSON.stringify(arr || []));
        } catch (e) {
            console.error('Speichern im localStorage fehlgeschlagen', e);
        }
    };

    // Merge original Ereignisse with local ones (original first)
    const combinedEreignisse = (vorgang.ereignisse || []).concat(loadLocal());
    renderList('vorgang-ereignisse', combinedEreignisse);
    renderList('vorgang-entscheidungen', vorgang.entscheidungen);
    renderList('vorgang-aktionen', vorgang.aktionen);
    renderList('vorgang-erfahrungen', vorgang.erfahrungen);

    // Setup add-event UI (only for Ereignisse)
    const input = document.getElementById('vorgang-ereignis-input');
    const button = document.getElementById('addEreignisButton');
    if (input && button) {
        const addHandler = () => {
            const raw = input.value || '';
            const text = raw.trim();
            if (!text) return;

            const newEvent = {
                id: `ER-${Date.now()}`,
                text: text,
                erstelltAm: new Date().toISOString(),
                quelle: 'manuell'
            };

            const local = loadLocal();
            local.push(newEvent);
            saveLocal(local);

            // Re-render Ereignisse: original + local
            const merged = (vorgang.ereignisse || []).concat(local);
            renderList('vorgang-ereignisse', merged);

            input.value = '';
            input.focus();
        };

        // Replace any existing handlers
        button.onclick = addHandler;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addHandler();
            }
        };
    }
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

async function createDecisionFromEvent() {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;

        const vorgang = await response.json();

        // load local events (if any)
        const localKey = `keosVorgangEvents:${vorgang.id}`;
        let local = [];
        try {
            const raw = localStorage.getItem(localKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) local = parsed;
            }
        } catch (e) {
            local = [];
        }

        const combined = (vorgang.ereignisse || []).concat(local);
        if (!combined || combined.length === 0) return; // nothing to do

        if (!Array.isArray(vorgang.entscheidungen)) vorgang.entscheidungen = [];

        const neueEntscheidung = {
            titel: "Liegesituation prüfen",
            quelle: "Ereignis",
            status: "offen"
        };

        vorgang.entscheidungen.push(neueEntscheidung);

        // re-render in-memory vorgang
        renderVorgang(vorgang);
    } catch (e) {
        console.error('Fehler beim Erzeugen der Entscheidung:', e);
    }
}

const createDecisionBtn = document.getElementById('createDecisionFromEvent');
if (createDecisionBtn) createDecisionBtn.onclick = createDecisionFromEvent;

// Beobachtungen: Interview und Anzeige (keine bestehenden Funktionen ändern)
const observationsKeyFor = (vorgangId) => `keosVorgangObservations:${vorgangId}`;

const loadObservationsLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(observationsKeyFor(vorgangId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

const saveObservationsLocal = (vorgangId, arr) => {
    try {
        localStorage.setItem(observationsKeyFor(vorgangId), JSON.stringify(arr || []));
    } catch (e) {
        console.error('Speichern der Beobachtungen fehlgeschlagen', e);
    }
};

const renderBeobachtungen = (vorgang) => {
    const el = document.getElementById('vorgang-beobachtungen');
    if (!el) return;
    const originals = Array.isArray(vorgang.beobachtungen) ? vorgang.beobachtungen : [];
    const local = loadObservationsLocal(vorgang.id);
    const merged = originals.concat(local);
    el.innerHTML = '';
    if (!Array.isArray(merged) || merged.length === 0) {
        el.textContent = 'Keine Einträge vorhanden.';
        return;
    }
    merged.forEach(obs => {
        const container = document.createElement('div');
        container.className = 'beobachtung-item';
        const h = document.createElement('p');
        h.textContent = `ID: ${obs.id}`;
        container.appendChild(h);
        const q1 = document.createElement('p');
        q1.textContent = `1) Was ist passiert? ${obs.wasIstPassiert || ''}`;
        container.appendChild(q1);
        const q2 = document.createElement('p');
        q2.textContent = `2) Warum ist das wichtig? ${obs.warumWichtig || ''}`;
        container.appendChild(q2);
        const q3 = document.createElement('p');
        q3.textContent = `3) Welche Auswirkung hat das? ${obs.auswirkung || ''}`;
        container.appendChild(q3);
        const q4 = document.createElement('p');
        q4.textContent = `4) Was ist sicher? ${obs.wasIstSicher || ''}`;
        container.appendChild(q4);
        const q5 = document.createElement('p');
        q5.textContent = `5) Was vermutest du? ${obs.wasVermutestDu || ''}`;
        container.appendChild(q5);
        el.appendChild(container);
    });
};

const startObservationInterview = async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();

        const questions = [
            'Was ist passiert?',
            'Warum ist das wichtig?',
            'Welche Auswirkung hat das?',
            'Was ist sicher?',
            'Was vermutest du?'
        ];

        const answers = [];
        for (let i = 0; i < questions.length; i++) {
            const ans = window.prompt(questions[i], '');
            if (ans === null) return; // abort if cancelled
            answers.push(ans.trim());
        }

        const anyNonEmpty = answers.some(a => a && a.length > 0);
        if (!anyNonEmpty) return;

        const obs = {
            id: `BE-${Date.now()}`,
            wasIstPassiert: answers[0],
            warumWichtig: answers[1],
            auswirkung: answers[2],
            wasIstSicher: answers[3],
            wasVermutestDu: answers[4],
            erstelltAm: new Date().toISOString(),
            quelle: 'manuell'
        };

        const local = loadObservationsLocal(vorgang.id);
        local.push(obs);
        saveObservationsLocal(vorgang.id, local);

        renderBeobachtungen(vorgang);
    } catch (e) {
        console.error('Beobachtungs-Interview fehlgeschlagen', e);
    }
};

const obsBtn = document.getElementById('startObservationInterview');
if (obsBtn) obsBtn.onclick = startObservationInterview;

window.addEventListener('load', async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        renderBeobachtungen(vorgang);
    } catch (e) {
        // ignore
    }
});
