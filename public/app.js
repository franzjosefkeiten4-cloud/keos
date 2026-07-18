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
        // show recap/meta if available
        const metaStore = loadObservationsMetaLocal(vorgang.id);
        const meta = metaStore && metaStore[obs.id] ? metaStore[obs.id] : null;
        if (meta) {
            if (meta.confirmed && meta.confirmedRecap) {
                const conf = document.createElement('p');
                conf.textContent = `Bestätigte Rekapitulation: ${meta.confirmedRecap}`;
                container.appendChild(conf);
            } else if (meta.recap) {
                const pre = document.createElement('p');
                pre.textContent = `Vorläufige Rekapitulation: ${meta.recap}`;
                container.appendChild(pre);
            }
        }
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

// --- Summary generation and local save (rule-based, no AI) ---
const summaryKeyFor = (vorgangId) => `keosVorgangSummary:${vorgangId}`;
const loadSummaryLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(summaryKeyFor(vorgangId));
        if (!raw) return null;
        return String(raw);
    } catch (e) {
        return null;
    }
};
const saveSummaryLocal = (vorgangId, text) => {
    try {
        localStorage.setItem(summaryKeyFor(vorgangId), String(text || ''));
    } catch (e) {
        console.error('Speichern der Zusammenfassung fehlgeschlagen', e);
    }
};

const renderSummary = (vorgang) => {
    const display = document.getElementById('summaryDisplay');
    const actions = document.getElementById('summaryActions');
    const editor = document.getElementById('summaryEditor');
    const textarea = document.getElementById('summaryTextarea');
    if (!display) return;

    const saved = loadSummaryLocal(vorgang.id);
    if (saved) {
        display.textContent = saved;
        if (actions) actions.style.display = 'block';
    } else {
        display.textContent = 'Keine Zusammenfassung vorhanden.';
        if (actions) actions.style.display = 'none';
    }
    if (editor) editor.style.display = 'none';
    if (textarea) textarea.value = '';

    // wire action buttons
    const adoptBtn = document.getElementById('summaryAdopt');
    const editBtn = document.getElementById('summaryEdit');
    const saveBtn = document.getElementById('summarySave');
    const cancelBtn = document.getElementById('summaryCancel');

    if (adoptBtn) {
        adoptBtn.onclick = () => {
            const current = display.textContent || '';
            if (current && current !== 'Keine Zusammenfassung vorhanden.') {
                saveSummaryLocal(vorgang.id, current);
                renderSummary(vorgang);
            }
        };
    }

    if (editBtn) {
        editBtn.onclick = () => {
            if (!editor || !textarea) return;
            textarea.value = display.textContent === 'Keine Zusammenfassung vorhanden.' ? '' : display.textContent;
            editor.style.display = 'block';
            if (actions) actions.style.display = 'none';
        };
    }

    if (saveBtn) {
        saveBtn.onclick = () => {
            if (!textarea) return;
            const txt = textarea.value.trim();
            if (!txt) return;
            saveSummaryLocal(vorgang.id, txt);
            renderSummary(vorgang);
        };
    }

    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (editor) editor.style.display = 'none';
            if (actions) actions.style.display = saved ? 'block' : 'none';
        };
    }
};

const generateSummaryFromAnswers = (answers) => {
    // simple rule-based concatenation from the five answers
    const a = answers.map(x => x ? x.trim() : '');
    const parts = [];
    if (a[0]) parts.push(`Beobachtung: ${a[0]}.`);
    if (a[1]) parts.push(`Wichtigkeit: ${a[1]}.`);
    if (a[2]) parts.push(`Auswirkung: ${a[2]}.`);
    if (a[3]) parts.push(`Sicher ist: ${a[3]}.`);
    if (a[4]) parts.push(`Vermutung: ${a[4]}.`);
    return parts.join(' ');
};

const showGeneratedSummary = (text, vorgang) => {
    const display = document.getElementById('summaryDisplay');
    const actions = document.getElementById('summaryActions');
    const editor = document.getElementById('summaryEditor');
    const textarea = document.getElementById('summaryTextarea');
    if (!display) return;
    display.textContent = text || '';
    if (actions) actions.style.display = text ? 'block' : 'none';
    if (editor) editor.style.display = 'none';

    // adopt button should save this generated text
    const adoptBtn = document.getElementById('summaryAdopt');
    if (adoptBtn) adoptBtn.onclick = () => {
        if (text) saveSummaryLocal(vorgang.id, text);
        renderSummary(vorgang);
    };

    const editBtn = document.getElementById('summaryEdit');
    if (editBtn) editBtn.onclick = () => {
        if (!editor || !textarea) return;
        textarea.value = text || '';
        editor.style.display = 'block';
        if (actions) actions.style.display = 'none';
    };

    const saveBtn = document.getElementById('summarySave');
    const cancelBtn = document.getElementById('summaryCancel');
    if (saveBtn) saveBtn.onclick = () => {
        if (!textarea) return;
        const txt = textarea.value.trim();
        if (!txt) return;
        saveSummaryLocal(vorgang.id, txt);
        renderSummary(vorgang);
    };
    if (cancelBtn) cancelBtn.onclick = () => {
        if (editor) editor.style.display = 'none';
        if (actions) actions.style.display = 'block';
    };
};

// Wrapper: call existing interview then generate summary from last observation
const enhancedStartObservationInterview = async () => {
    // call original interview flow
    await startObservationInterview();
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        const local = loadObservationsLocal(vorgang.id);
        if (!local || local.length === 0) return;
        const last = local[local.length - 1];
        const answers = [last.wasIstPassiert, last.warumWichtig, last.auswirkung, last.wasIstSicher, last.wasVermutestDu];
        const gen = generateSummaryFromAnswers(answers);
        showGeneratedSummary(gen, vorgang);
    } catch (e) {
        // ignore
    }
};

// rebind observation button to enhanced wrapper
if (obsBtn) obsBtn.onclick = enhancedStartObservationInterview;

// --- Recap confirmation / correction loop ---
const observationsMetaKeyFor = (vorgangId) => `keosVorgangObservationsMeta:${vorgangId}`;
const loadObservationsMetaLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(observationsMetaKeyFor(vorgangId));
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
};
const saveObservationsMetaLocal = (vorgangId, obj) => {
    try {
        localStorage.setItem(observationsMetaKeyFor(vorgangId), JSON.stringify(obj || {}));
    } catch (e) {
        console.error('Speichern der Beobachtungs-Meta fehlgeschlagen', e);
    }
};

const showRecapUI = (vorgang, recapText, obsId) => {
    const wrapper = document.getElementById('recapConfirmation');
    const recapEl = document.getElementById('recapText');
    const question = document.getElementById('recapQuestion');
    const yesBtn = document.getElementById('recapYes');
    const noBtn = document.getElementById('recapNo');
    const correctionDiv = document.getElementById('recapCorrection');
    const correctionInput = document.getElementById('recapCorrectionInput');
    const sendCorr = document.getElementById('recapSendCorrection');
    const cancelCorr = document.getElementById('recapCancelCorrection');
    if (!wrapper || !recapEl) return;
    wrapper.style.display = 'block';
    recapEl.textContent = recapText || '';
    question.textContent = 'Habe ich dich richtig verstanden, dass ...?';
    if (correctionDiv) correctionDiv.style.display = 'none';

    const meta = loadObservationsMetaLocal(vorgang.id);

    const cleanup = () => {
        wrapper.style.display = 'none';
        if (correctionDiv) correctionDiv.style.display = 'none';
        if (correctionInput) correctionInput.value = '';
        // remove handlers
        if (yesBtn) yesBtn.onclick = null;
        if (noBtn) noBtn.onclick = null;
        if (sendCorr) sendCorr.onclick = null;
        if (cancelCorr) cancelCorr.onclick = null;
    };

    if (yesBtn) yesBtn.onclick = () => {
        // mark confirmed recap for this obs (use current displayed recap)
        const currentRecap = recapEl.textContent || '';
        meta[obsId] = meta[obsId] || {};
        meta[obsId].recap = currentRecap;
        meta[obsId].confirmedRecap = currentRecap;
        meta[obsId].confirmed = true;
        saveObservationsMetaLocal(vorgang.id, meta);
        cleanup();
        // re-render Beobachtungen to show confirmation badge
        renderBeobachtungen(vorgang);
    };

    if (noBtn) noBtn.onclick = () => {
        if (correctionDiv) correctionDiv.style.display = 'block';
    };

    if (sendCorr) sendCorr.onclick = () => {
        const corr = correctionInput ? correctionInput.value.trim() : '';
        if (!corr) return;
        // create new recap from correction (do not overwrite original answers)
        const newRecap = corr;
        meta[obsId] = meta[obsId] || {};
        meta[obsId].recap = newRecap;
        meta[obsId].confirmed = false;
        saveObservationsMetaLocal(vorgang.id, meta);
        // replace recap text and ask again
        recapEl.textContent = newRecap;
        if (correctionDiv) correctionDiv.style.display = 'none';
        question.textContent = 'Habe ich dich jetzt richtig verstanden?';
        // next yes will confirm
    };

    if (cancelCorr) cancelCorr.onclick = () => {
        if (correctionDiv) correctionDiv.style.display = 'none';
    };
};

// New wrapper with confirmation loop
const enhancedStartObservationInterviewWithConfirmation = async () => {
    await startObservationInterview();
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        const local = loadObservationsLocal(vorgang.id);
        if (!local || local.length === 0) return;
        const last = local[local.length - 1];
        const answers = [last.wasIstPassiert, last.warumWichtig, last.auswirkung, last.wasIstSicher, last.wasVermutestDu];
        const gen = generateSummaryFromAnswers(answers);
        // show recap UI and let user confirm/correct
        showRecapUI(vorgang, gen, last.id);
        // also show generated summary as before
        showGeneratedSummary(gen, vorgang);
    } catch (e) {
        // ignore
    }
};

// rebind observation button to new enhanced wrapper with confirmation
if (obsBtn) obsBtn.onclick = enhancedStartObservationInterviewWithConfirmation;

// ensure summary rendered after initial load
window.addEventListener('load', async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        renderSummary(vorgang);
    } catch (e) {
        // ignore
    }
});

// --- Arbeitshypothese: rule-based generation from summary ---
const hypothesisKeyFor = (vorgangId) => `keosVorgangHypothesis:${vorgangId}`;
const loadHypothesisLocal = (vorgangId) => {
    try {
        const raw = localStorage.getItem(hypothesisKeyFor(vorgangId));
        if (!raw) return null;
        return String(raw);
    } catch (e) {
        return null;
    }
};
const saveHypothesisLocal = (vorgangId, text) => {
    try {
        localStorage.setItem(hypothesisKeyFor(vorgangId), String(text || ''));
    } catch (e) {
        console.error('Speichern der Arbeitshypothese fehlgeschlagen', e);
    }
};

const generateHypothesisFromSummary = (summary) => {
    if (!summary || !String(summary).trim()) return '';
    const s = String(summary).trim();
    // Ensure explicit phrasing and mark as prüfbare Annahme
    return `Auf Basis der bisher vorliegenden Informationen ergibt sich folgende Arbeitshypothese: (Prüfbare Annahme) ${s}`;
};

const renderHypothesis = async (vorgang) => {
    const display = document.getElementById('hypothesisDisplay');
    const actions = document.getElementById('hypothesisActions');
    const editor = document.getElementById('hypothesisEditor');
    const textarea = document.getElementById('hypothesisTextarea');
    if (!display) return;

    const saved = loadHypothesisLocal(vorgang.id);
    if (saved) {
        display.textContent = saved;
        if (actions) actions.style.display = 'block';
    } else {
        // if no saved hypothesis, but summary exists (either saved or generated in DOM), generate one
        const summaryEl = document.getElementById('summaryDisplay');
        const summaryText = summaryEl ? summaryEl.textContent : '';
        if (summaryText && summaryText !== 'Keine Zusammenfassung vorhanden.') {
            const gen = generateHypothesisFromSummary(summaryText);
            display.textContent = gen;
            if (actions) actions.style.display = 'block';
        } else {
            display.textContent = 'Keine Arbeitshypothese vorhanden.';
            if (actions) actions.style.display = 'none';
        }
    }
    if (editor) editor.style.display = 'none';
    if (textarea) textarea.value = '';

    // wire buttons
    const adoptBtn = document.getElementById('hypothesisAdopt');
    const editBtn = document.getElementById('hypothesisEdit');
    const saveBtn = document.getElementById('hypothesisSave');
    const cancelBtn = document.getElementById('hypothesisCancel');

    if (adoptBtn) adoptBtn.onclick = () => {
        const cur = display.textContent || '';
        if (cur && cur !== 'Keine Arbeitshypothese vorhanden.') {
            saveHypothesisLocal(vorgang.id, cur);
            renderHypothesis(vorgang);
        }
    };

    if (editBtn) editBtn.onclick = () => {
        if (!editor || !textarea) return;
        textarea.value = display.textContent === 'Keine Arbeitshypothese vorhanden.' ? '' : display.textContent;
        editor.style.display = 'block';
        if (actions) actions.style.display = 'none';
    };

    if (saveBtn) saveBtn.onclick = () => {
        if (!textarea) return;
        const txt = textarea.value.trim();
        if (!txt) return;
        saveHypothesisLocal(vorgang.id, txt);
        renderHypothesis(vorgang);
    };

    if (cancelBtn) cancelBtn.onclick = () => {
        if (editor) editor.style.display = 'none';
        if (actions) actions.style.display = saved ? 'block' : 'none';
    };
};

// Observe summary changes in DOM to update hypothesis (covers generated summaries)
const summaryEl = document.getElementById('summaryDisplay');
if (summaryEl) {
    const mo = new MutationObserver(async () => {
        try {
            const response = await fetch("../data/vorgaenge/VG-0001.json");
            if (!response.ok) return;
            const vorgang = await response.json();
            await renderHypothesis(vorgang);
        } catch (e) {
            // ignore
        }
    });
    mo.observe(summaryEl, { childList: true, characterData: true, subtree: true });
}

// ensure hypothesis rendered after initial load
window.addEventListener('load', async () => {
    try {
        const response = await fetch("../data/vorgaenge/VG-0001.json");
        if (!response.ok) return;
        const vorgang = await response.json();
        await renderHypothesis(vorgang);
    } catch (e) {
        // ignore
    }
});

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
