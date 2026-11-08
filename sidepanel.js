
// ==========================================
// SKIMS DRAFTING ASSISTANT + CUSTOMER CASES
// ==========================================

const ticket = document.getElementById("ticket");
const resolution = document.getElementById("resolution");
const mode = document.getElementById("mode");
const modeHint = document.getElementById("modeHint");
const output = document.getElementById("output");
const status = document.getElementById("status");

const generate = document.getElementById("generate");
const fixGrammar = document.getElementById("fixGrammar");
const copy = document.getElementById("copy");
const refinementTools = document.getElementById("refinementTools");

const underbustInput = document.getElementById("underbust");
const overbustInput = document.getElementById("overbust");
const calculateSize = document.getElementById("calculateSize");
const sizeResult = document.getElementById("sizeResult");

const caseNameInput = document.getElementById("caseName");
const createCaseButton = document.getElementById("createCase");
const caseSearch = document.getElementById("caseSearch");
const caseSort = document.getElementById("caseSort");
const caseList = document.getElementById("caseList");
const caseCount = document.getElementById("caseCount");
const caseSaveStatus = document.getElementById("caseSaveStatus");
const activeCasePanel = document.getElementById("activeCasePanel");
const activeCaseName = document.getElementById("activeCaseName");
const activeCaseIdDisplay = document.getElementById("activeCaseId");
const caseStatus = document.getElementById("caseStatus");
const archiveCaseButton = document.getElementById("archiveCase");
const deleteCaseButton = document.getElementById("deleteCase");

const API_URL = "https://skims-drafting-assistant.onrender.com";
const STORAGE_KEY = "skimsCustomerCases";
const ACTIVE_CASE_KEY = "skimsActiveCustomerCase";
const SORT_ORDER_KEY = "skimsCaseSortOrder";
const MAX_ACTIVE_CASES = 5;

const DEFAULT_SORT_ORDER = "recent";

const VALID_SORT_ORDERS = [
  "recent",
  "oldest",
  "alphabetical"
];

let currentSortOrder = DEFAULT_SORT_ORDER;

let sizingGuidance = "";
let lastDraftContext = null;

let customerCases = [];
let activeCaseId = null;
let saveTimer = null;
let isLoadingCase = false;
let isBusy = false;

// ==========================================
// RESPONSE FORMAT SETTINGS
// ==========================================

const modeSettings = {
  email: {
    label: "email",
    hint: "Professional email with a greeting, clear resolution, and natural ending.",
    outputLabel: "Generated email"
  },

  live_chat: {
    label: "live chat reply",
    hint: "Friendly, natural, conversational response for an active chat.",
    outputLabel: "Generated live chat reply"
  },

  sms: {
    label: "SMS",
    hint: "Concise, friendly text message with a clear resolution.",
    outputLabel: "Generated SMS"
  }
};

function updateModePresentation() {
  const selected = modeSettings[mode.value] || modeSettings.email;

  generate.textContent = `Generate ${selected.label}`;
  modeHint.textContent = selected.hint;

  const outputLabel = document.querySelector('label[for="output"]');

  if (outputLabel) {
    outputLabel.textContent = selected.outputLabel;
  }

  copy.textContent =
    mode.value === "sms"
      ? "Copy SMS"
      : mode.value === "live_chat"
        ? "Copy chat reply"
        : "Copy email";
}

// ==========================================
// BUSY STATE / CUSTOMER PROTECTION
// ==========================================

function setBusyState(busy) {
  isBusy = busy;

  // Prevent an earlier autosave from running during an AI request.
  if (busy) {
    clearTimeout(saveTimer);
  }

  ticket.disabled = busy;
  resolution.disabled = busy;
  mode.disabled = busy;

  underbustInput.disabled = busy;
  overbustInput.disabled = busy;
  calculateSize.disabled = busy;

  caseNameInput.disabled = busy;
  createCaseButton.disabled = busy;
  caseSearch.disabled = busy;

  if (caseSort) {
    caseSort.disabled = busy;
  }

  caseStatus.disabled = busy;
  archiveCaseButton.disabled = busy;
  deleteCaseButton.disabled = busy;

  generate.disabled = busy || !getActiveCase();
  fixGrammar.disabled = busy || !output.value.trim();
  copy.disabled = busy || !output.value.trim();

  refinementTools.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });

  renderCaseList();
}

// ==========================================
// CUSTOMER CASE STORAGE
// ==========================================

function getActiveCase() {
  return customerCases.find(item => item.id === activeCaseId) || null;
}

function getActiveCaseCount() {
  return customerCases.filter(item => !item.archived).length;
}

function createCaseId() {
  const date = new Date();

  const datePart = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");

  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `SK-${datePart}-${randomPart}`;
}

function createEmptyCase(name, initialTicket = "") {
  const now = new Date().toISOString();

  return {
    id: createCaseId(),
    name,
    status: "in_progress",
    archived: false,

    mode: "email",
    ticket: initialTicket,
    resolution: "",
    output: "",

    sizingGuidance: "",
    underbust: "",
    overbust: "",
    sizeResult: "",

    history: [],

    createdAt: now,
    updatedAt: now
  };
}

async function saveCasesToStorage() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: customerCases,
      [ACTIVE_CASE_KEY]: activeCaseId
    });

    if (activeCaseId) {
      caseSaveStatus.textContent = "All changes saved";
    }

    return true;

  } catch (error) {
    console.error("Case storage error:", error);

    caseSaveStatus.textContent = "Save failed";

    status.textContent =
      "Unable to save customer cases. Check Chrome storage permissions.";

    return false;
  }
}

function scheduleCaseSave() {
  if (isLoadingCase || isBusy || !activeCaseId) return;

  caseSaveStatus.textContent = "Saving...";

  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    saveCurrentCase();
  }, 400);
}

async function saveCurrentCase() {
  if (isLoadingCase || !activeCaseId) return;

  clearTimeout(saveTimer);

  const currentCase = getActiveCase();

  if (!currentCase) return;

  currentCase.mode = mode.value;
  currentCase.ticket = ticket.value;
  currentCase.resolution = resolution.value;
  currentCase.output = output.value;

  currentCase.sizingGuidance = sizingGuidance;
  currentCase.underbust = underbustInput.value;
  currentCase.overbust = overbustInput.value;

  currentCase.sizeResult = sizeResult.innerHTML;

  currentCase.updatedAt = new Date().toISOString();

  const saved = await saveCasesToStorage();

  if (saved) {
    renderCaseList();
  }
}

function addHistoryEntry(text, type, caseId = activeCaseId) {
  const targetCase = customerCases.find(item => item.id === caseId);

  if (!targetCase || !text.trim()) return;

  if (!Array.isArray(targetCase.history)) {
    targetCase.history = [];
  }

  targetCase.history.push({
    type,
    text,
    createdAt: new Date().toISOString()
  });

  if (targetCase.history.length > 30) {
    targetCase.history = targetCase.history.slice(-30);
  }
}

// ==========================================
// CASE SORTING
// ==========================================

// Safely read the original creation date.
// Older saved cases without createdAt use updatedAt as a fallback.
function getCaseCreationTime(item) {
  const dateValue = item.createdAt || item.updatedAt;

  const timestamp = dateValue
    ? new Date(dateValue).getTime()
    : 0;

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortCustomerCases(cases) {
  return [...cases].sort((a, b) => {
    if (currentSortOrder === "alphabetical") {
      const nameA = String(a.name || "").trim();
      const nameB = String(b.name || "").trim();

      return nameA.localeCompare(nameB, undefined, {
        sensitivity: "base",
        numeric: true
      });
    }

    const dateA = getCaseCreationTime(a);
    const dateB = getCaseCreationTime(b);

    if (currentSortOrder === "oldest") {
      return dateA - dateB;
    }

    // Default: newest cases first.
    return dateB - dateA;
  });
}

async function saveSortPreference() {
  if (!caseSort) return;

  try {
    await chrome.storage.local.set({
      [SORT_ORDER_KEY]: currentSortOrder
    });
  } catch (error) {
    console.warn("Could not save sorting preference:", error);
  }
}

function initializeSortPreference(savedPreference) {
  currentSortOrder = VALID_SORT_ORDERS.includes(savedPreference)
    ? savedPreference
    : DEFAULT_SORT_ORDER;

  if (caseSort) {
    caseSort.value = currentSortOrder;
  }
}

// ==========================================
// CASE LIST DISPLAY
// ==========================================

function renderCaseList() {
  caseList.replaceChildren();

  const searchTerm = caseSearch.value.trim().toLowerCase();

  const matchingCases = customerCases.filter(item => {
    return (
      String(item.name || "").toLowerCase().includes(searchTerm) ||
      String(item.id || "").toLowerCase().includes(searchTerm)
    );
  });

  const filteredCases = sortCustomerCases(matchingCases);

  caseCount.textContent =
    `${getActiveCaseCount()} / ${MAX_ACTIVE_CASES} active`;

  if (filteredCases.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-cases";

    const heading = document.createElement("strong");

    heading.textContent = searchTerm
      ? "No matching cases"
      : "No customer cases yet";

    const description = document.createElement("p");

    description.textContent = searchTerm
      ? "Try another customer name or case ID."
      : "Create a case to start organizing your customer conversations.";

    empty.append(heading, description);
    caseList.appendChild(empty);

    return;
  }

  filteredCases.forEach(item => {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "case-item";
    button.disabled = isBusy;

    if (item.id === activeCaseId) {
      button.classList.add("active");
    }

    const name = document.createElement("strong");

    name.className = "case-item-name";
    name.textContent = item.name || "Unnamed customer";

    const details = document.createElement("span");

    details.className = "case-item-details";
    details.textContent =
      `${String(item.mode || "email").replace("_", " ")} · ${item.id}`;

    const badge = document.createElement("span");

    badge.className = "case-item-status";

    if (item.archived) {
      badge.textContent = "Archived";
      badge.classList.add("archived");
    } else {
      badge.textContent = String(item.status || "in_progress").replace("_", " ");
      badge.classList.add(item.status || "in_progress");
    }

    button.append(name, details, badge);

    button.addEventListener("click", () => {
      if (!isBusy) {
        switchCase(item.id);
      }
    });

    caseList.appendChild(button);
  });
}

// ==========================================
// LOAD A CUSTOMER CASE
// ==========================================

function loadCaseIntoInterface(item) {
  isLoadingCase = true;

  activeCaseId = item.id;

  ticket.value = item.ticket || "";
  resolution.value = item.resolution || "";
  output.value = item.output || "";

  mode.value = item.mode || "email";

  sizingGuidance = item.sizingGuidance || "";

  underbustInput.value = item.underbust || "";
  overbustInput.value = item.overbust || "";

  sizeResult.innerHTML = item.sizeResult || "";

  updateModePresentation();

  copy.disabled = !output.value.trim();
  fixGrammar.disabled = !output.value.trim();

  refinementTools.hidden = !output.value.trim();

  lastDraftContext = output.value.trim()
    ? {
        customerContext: ticket.value.trim(),
        confirmedResolution: resolution.value.trim(),
        mode: mode.value
      }
    : null;

  activeCasePanel.hidden = false;

  activeCaseName.textContent = item.name;
  activeCaseIdDisplay.textContent = item.id;

  caseStatus.value = item.status || "in_progress";

  archiveCaseButton.textContent = item.archived
    ? "Unarchive Case"
    : "Archive Case";

  caseSaveStatus.textContent = "Case loaded";

  generate.disabled = false;
  mode.disabled = false;

  isLoadingCase = false;

  renderCaseList();

  chrome.storage.local.set({
    [ACTIVE_CASE_KEY]: item.id
  }).catch(error => {
    console.warn("Could not save active case selection:", error);
  });
}

async function switchCase(id) {
  if (isBusy) return;

  const targetCase = customerCases.find(item => item.id === id);

  if (!targetCase) return;

  if (targetCase.archived) {
    if (getActiveCaseCount() >= MAX_ACTIVE_CASES) {
      status.textContent =
        "You already have five active cases. Archive another case before reopening this one.";

      return;
    }

    targetCase.archived = false;
  }

  if (activeCaseId === id) {
    loadCaseIntoInterface(targetCase);
    await saveCasesToStorage();
    return;
  }

  await saveCurrentCase();

  loadCaseIntoInterface(targetCase);

  await saveCasesToStorage();

  status.textContent = `Switched to ${targetCase.name}.`;
}

// ==========================================
// CREATE A CUSTOMER CASE
// ==========================================

async function createCustomerCase(name, initialTicket = "") {
  if (isBusy) return false;

  if (getActiveCaseCount() >= MAX_ACTIVE_CASES) {
    status.textContent =
      "You have reached the five active case limit. Archive a case before creating another.";

    return false;
  }

  await saveCurrentCase();

  const newCase = createEmptyCase(name, initialTicket);

  customerCases.push(newCase);

  const saved = await saveCasesToStorage();

  if (!saved) {
    customerCases = customerCases.filter(item => item.id !== newCase.id);
    return false;
  }

  caseNameInput.value = "";

  loadCaseIntoInterface(newCase);

  status.textContent =
    `New customer case created for ${newCase.name}.`;

  return true;
}

createCaseButton.addEventListener("click", async () => {
  if (isBusy) return;

  const name = caseNameInput.value.trim();

  if (!name) {
    status.textContent = "Enter a customer name or case label first.";
    caseNameInput.focus();
    return;
  }

  await createCustomerCase(name);
});

caseNameInput.addEventListener("keydown", event => {
  if (event.key === "Enter" && !isBusy) {
    createCaseButton.click();
  }
});

// ==========================================
// SEARCH CUSTOMER CASES
// ==========================================

caseSearch.addEventListener("input", renderCaseList);

// ==========================================
// SORT CUSTOMER CASES
// ==========================================

if (caseSort) {
  caseSort.addEventListener("change", async () => {
    const selectedSort = caseSort.value;

    if (!VALID_SORT_ORDERS.includes(selectedSort)) {
      caseSort.value = currentSortOrder;
      return;
    }

    currentSortOrder = selectedSort;

    renderCaseList();

    await saveSortPreference();
  });
}

// ==========================================
// CASE STATUS
// ==========================================

caseStatus.addEventListener("change", async () => {
  if (isBusy) return;

  const currentCase = getActiveCase();

  if (!currentCase) return;

  currentCase.status = caseStatus.value;

  await saveCurrentCase();

  status.textContent =
    `${currentCase.name}'s case status updated.`;
});

// ==========================================
// ARCHIVE / UNARCHIVE CASE
// ==========================================

archiveCaseButton.addEventListener("click", async () => {
  if (isBusy) return;

  const currentCase = getActiveCase();

  if (!currentCase) return;

  if (currentCase.archived) {
    if (getActiveCaseCount() >= MAX_ACTIVE_CASES) {
      status.textContent =
        "You have reached the five active case limit.";

      return;
    }

    currentCase.archived = false;

    await saveCurrentCase();

    archiveCaseButton.textContent = "Archive Case";

    status.textContent =
      `${currentCase.name}'s case has been reopened.`;

    return;
  }

  const confirmed = confirm(
    `Archive the case for ${currentCase.name}? You can reopen it later.`
  );

  if (!confirmed) return;

  await saveCurrentCase();

  currentCase.archived = true;

  clearCaseInterface();

  await saveCasesToStorage();

  renderCaseList();

  status.textContent =
    `${currentCase.name}'s case has been archived.`;

  await restoreSelectedTicketText();
});

// ==========================================
// DELETE CASE
// ==========================================

deleteCaseButton.addEventListener("click", async () => {
  if (isBusy) return;

  const currentCase = getActiveCase();

  if (!currentCase) return;

  const confirmed = confirm(
    `Permanently delete the case for ${currentCase.name}? This also deletes its saved conversation history.`
  );

  if (!confirmed) return;

  customerCases = customerCases.filter(
    item => item.id !== currentCase.id
  );

  clearCaseInterface();

  await saveCasesToStorage();

  renderCaseList();

  status.textContent = "Customer case deleted.";
});

// ==========================================
// CLEAR ACTIVE CASE INTERFACE
// ==========================================

function clearCaseInterface() {
  isLoadingCase = true;

  activeCaseId = null;

  ticket.value = "";
  resolution.value = "";
  output.value = "";

  mode.value = "email";

  underbustInput.value = "";
  overbustInput.value = "";
  sizeResult.innerHTML = "";

  sizingGuidance = "";
  lastDraftContext = null;

  updateModePresentation();

  activeCasePanel.hidden = true;

  caseSaveStatus.textContent = "No active case";

  copy.disabled = true;
  fixGrammar.disabled = true;

  refinementTools.hidden = true;

  generate.disabled = false;
  mode.disabled = false;

  isLoadingCase = false;
}

// ==========================================
// AUTOMATIC CASE SAVING
// ==========================================

[
  ticket,
  resolution,
  mode,
  underbustInput,
  overbustInput
].forEach(element => {
  element.addEventListener("input", scheduleCaseSave);
  element.addEventListener("change", scheduleCaseSave);
});

// ==========================================
// RESTORE SELECTED KUSTOMER TEXT
// ALWAYS CREATE A NEW CASE
// ==========================================

async function restoreSelectedTicketText() {
  try {
    const saved = await chrome.storage.session.get("selectedTicketText");

    const selectedText = saved.selectedTicketText;

    if (
      typeof selectedText !== "string" ||
      !selectedText.trim()
    ) {
      return;
    }

    if (getActiveCaseCount() >= MAX_ACTIVE_CASES) {
      status.textContent =
        "Selected Kustomer text is waiting. You have five active cases; archive one before opening a new customer case.";

      caseSaveStatus.textContent = "New case needed";

      return;
    }

    const created = await createCustomerCase(
      "New customer",
      selectedText.slice(0, 12000)
    );

    if (created) {
      await chrome.storage.session.remove("selectedTicketText");

      status.textContent =
        "A new customer case was created with the selected Kustomer message. Rename the case when ready.";
    }

  } catch (error) {
    console.warn("Could not restore selected ticket text:", error);

    status.textContent =
      "Could not import the selected Kustomer text. Your existing customer cases were not changed.";
  }
}

// ==========================================
// INITIALIZE CASE MANAGER
// ==========================================

async function initializeCaseManager() {
  try {
    const saved = await chrome.storage.local.get([
      STORAGE_KEY,
      ACTIVE_CASE_KEY,
      SORT_ORDER_KEY
    ]);

    customerCases = Array.isArray(saved[STORAGE_KEY])
      ? saved[STORAGE_KEY]
      : [];

    // Restore the previously selected sorting preference.
    initializeSortPreference(saved[SORT_ORDER_KEY]);

    const previouslyActiveCase = customerCases.find(
      item =>
        item.id === saved[ACTIVE_CASE_KEY] &&
        !item.archived
    );

    // Preserve the original fallback behavior:
    // open the most recently updated active case.
    const mostRecentCase = customerCases
      .filter(item => !item.archived)
      .sort((a, b) => {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      })[0];

    renderCaseList();

    if (previouslyActiveCase) {
      loadCaseIntoInterface(previouslyActiveCase);
    } else if (mostRecentCase) {
      loadCaseIntoInterface(mostRecentCase);
    } else {
      clearCaseInterface();
    }

    await restoreSelectedTicketText();

  } catch (error) {
    console.error("Could not initialize customer cases:", error);

    status.textContent =
      "Unable to load saved customer cases. Please check extension storage.";
  }
}

// ==========================================
// CHANGE RESPONSE FORMAT
// ==========================================

mode.addEventListener("change", () => {
  if (isBusy) return;

  updateModePresentation();

  output.value = "";

  copy.disabled = true;
  fixGrammar.disabled = true;

  refinementTools.hidden = true;

  lastDraftContext = null;

  scheduleCaseSave();

  status.textContent =
    "Response format changed. Generate a new draft when ready.";
});

// ==========================================
// GENERATE RESPONSE
// ==========================================

generate.addEventListener("click", async () => {
  if (isBusy) return;

  const currentCase = getActiveCase();

  if (!currentCase) {
    status.textContent =
      "Create or select a customer case before generating a response.";

    return;
  }

  if (currentCase.archived) {
    status.textContent =
      "Reopen this archived case before generating a response.";

    return;
  }

  const caseId = currentCase.id;

  const customerContext = ticket.value.trim();
  const confirmedResolution = resolution.value.trim();
  const responseMode = mode.value;
  const currentSizingGuidance = sizingGuidance;

  if (!customerContext) {
    status.textContent =
      "Add a customer concern or select message text in Kustomer first.";

    return;
  }

  lastDraftContext = {
    customerContext,
    confirmedResolution,
    mode: responseMode
  };

  setBusyState(true);

  output.value = "";
  refinementTools.hidden = true;

  status.textContent =
    `Drafting ${currentCase.name}'s ${modeSettings[responseMode].label}...`;

  try {
    const response = await fetch(`${API_URL}/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        customerContext,
        confirmedResolution,
        sizingGuidance: currentSizingGuidance,
        mode: responseMode
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "The drafting service returned an error."
      );
    }

    const generatedText = data.email || data.response || "";

    output.value = generatedText;

    if (generatedText.trim()) {
      addHistoryEntry(generatedText, "generated", caseId);
    }

    copy.disabled = !generatedText.trim();
    fixGrammar.disabled = !generatedText.trim();
    refinementTools.hidden = !generatedText.trim();

    status.textContent = generatedText.trim()
      ? "Draft ready. Review all facts before using it."
      : "The AI returned an empty response. Please try again.";

    await saveCurrentCase();

  } catch (error) {
    status.textContent =
      `${error.message} Make sure the drafting service is running.`;

  } finally {
    setBusyState(false);
  }
});

// ==========================================
// FIX GRAMMAR
// ==========================================

fixGrammar.addEventListener("click", async () => {
  if (isBusy) return;

  const currentCase = getActiveCase();

  if (!currentCase) return;

  const caseId = currentCase.id;
  const textToFix = output.value.trim();
  const responseMode = mode.value;

  if (!textToFix) {
    status.textContent =
      "Generate a response first before using Fix Grammar.";

    return;
  }

  setBusyState(true);

  status.textContent = "Polishing your response...";

  try {
    const response = await fetch(`${API_URL}/fix-grammar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: textToFix,
        mode: responseMode
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to correct the response."
      );
    }

    const correctedText =
      data.email || data.response || data.text || "";

    output.value = correctedText;

    if (correctedText.trim()) {
      addHistoryEntry(correctedText, "grammar_corrected", caseId);
    }

    status.textContent = correctedText.trim()
      ? "Grammar corrected. Review the response before using it."
      : "The AI returned an empty response. Please try again.";

    await saveCurrentCase();

  } catch (error) {
    status.textContent =
      `${error.message} Make sure the drafting service is running.`;

  } finally {
    setBusyState(false);
  }
});

// ==========================================
// INTERNAL BRA-SIZING CALCULATOR
// ==========================================

calculateSize.addEventListener("click", () => {
  if (isBusy) return;

  const underbust = Number(underbustInput.value);
  const overbust = Number(overbustInput.value);

  if (
    !underbustInput.value ||
    !overbustInput.value ||
    !Number.isFinite(underbust) ||
    !Number.isFinite(overbust)
  ) {
    sizeResult.textContent =
      "Enter both underbust and overbust measurements.";

    sizingGuidance = "";

    scheduleCaseSave();

    return;
  }

  if (
    underbust <= 0 ||
    overbust <= 0 ||
    overbust < underbust
  ) {
    sizeResult.textContent =
      "Please check the measurements. Overbust should be greater than or equal to underbust.";

    sizingGuidance = "";

    scheduleCaseSave();

    return;
  }

  const roundedUnderbust = Math.round(underbust);

  if (Math.abs(underbust - roundedUnderbust) > 0.01) {
    sizeResult.textContent =
      "The supplied internal formula uses a whole-number underbust. Please confirm the measurement or use the official SKIMS size guide for this measurement.";

    sizingGuidance =
      "Underbust is not a whole number; do not force the internal formula. Cross-check the exact current SKIMS size guide.";

    scheduleCaseSave();

    return;
  }

  const band =
    roundedUnderbust +
    (roundedUnderbust % 2 === 0 ? 2 : 3);

  const cupDifference =
    Math.round((overbust - underbust) * 10) / 10;

  const cupMap = {
    1: "A",
    2: "B",
    3: "C",
    4: "D",
    5: "DD/E",
    6: "DDD/F",
    7: "DDDD/G",
    8: "DDDDD/H"
  };

  const cupKey = Math.round(cupDifference);

  const cup =
    Math.abs(cupDifference - cupKey) < 0.01
      ? cupMap[cupKey]
      : null;

  if (!cup) {
    sizeResult.textContent =
      `Internal calculation: ${band} band; cup difference ${cupDifference.toFixed(1)} in does not map cleanly to the supplied cup chart. Cross-check the official SKIMS size guide.`;

    sizingGuidance =
      `Agent-entered measurements: underbust ${underbust} in, overbust ${overbust} in. Internal formula band calculation: ${band}. Cup difference: ${cupDifference} in, which does not map cleanly to the supplied cup chart. Do not state a definitive size; cross-check the current official product-specific SKIMS chart.`;

    scheduleCaseSave();

    return;
  }

  const calculated = `${band}${cup}`;

  sizeResult.innerHTML =
    `<strong>Internal formula result: ${calculated}</strong><span>Cross-check the current SKIMS product-specific size guide before advising the customer.</span>`;

  sizingGuidance =
    `Agent-entered measurements: underbust ${underbust} in; overbust ${overbust} in. Internal team formula result: ${calculated} (band ${band}; cup difference ${cupDifference} in = ${cup}). This is an internal calculation only. Verify against the current official SKIMS size chart for the exact bra style before presenting it as the recommended customer size. If there is a discrepancy, explain uncertainty and do not guarantee fit.`;

  status.textContent =
    `Sizing calculation ${calculated} added to the next draft context.`;

  scheduleCaseSave();
});

// ==========================================
// OPTIONAL RESPONSE REFINEMENTS
// ==========================================

refinementTools.addEventListener("click", async event => {
  if (isBusy) return;

  const button = event.target.closest("button[data-refinement]");

  if (!button || !lastDraftContext || !output.value.trim()) {
    return;
  }

  const currentCase = getActiveCase();

  if (!currentCase) return;

  const caseId = currentCase.id;

  const currentDraft = output.value.trim();
  const refinement = button.dataset.refinement;

  setBusyState(true);

  status.textContent =
    "Applying the selected refinement while preserving the original response context...";

  try {
    const response = await fetch(`${API_URL}/refine`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...lastDraftContext,
        currentDraft,
        refinement
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Unable to refine this response."
      );
    }

    const refinedText =
      data.response || data.email || currentDraft;

    output.value = refinedText;

    addHistoryEntry(refinedText, "refined", caseId);

    status.textContent =
      "Response refined. Review it to ensure all required QA elements and facts remain accurate.";

    await saveCurrentCase();

  } catch (error) {
    status.textContent =
      `${error.message} Your previous response has been preserved.`;

  } finally {
    setBusyState(false);
  }
});

// ==========================================
// COPY RESPONSE
// ==========================================

copy.addEventListener("click", async () => {
  if (isBusy || !output.value.trim()) return;

  try {
    await navigator.clipboard.writeText(output.value);

    status.textContent = "Response copied successfully.";

  } catch (error) {
    status.textContent =
      "Could not copy automatically. Select the response and copy it manually.";
  }
});

// ==========================================
// START THE EXTENSION
// ==========================================

updateModePresentation();
initializeCaseManager();
