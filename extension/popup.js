// Popup controller — orchestrates auth, draft loading, and extension actions.
// Uses: utils.js (mapDraftToFields, isTokenExpired, formatResults)
//       api.js (exchangeToken, fetchDrafts, fetchDraft)
//       field-map-inc32.js (INC32_CATEGORIES)

(async function () {
  "use strict";

  // ── DOM refs ──
  const $ = id => document.getElementById(id);
  const connDot     = $("connDot"),     connLabel   = $("connLabel");
  const pageRow     = $("pageRow"),     pageDot     = $("pageDot"),   pageLabel = $("pageLabel");
  const authPanel   = $("authPanel"),   mainPanel   = $("mainPanel");
  const authError   = $("authError");
  const btnConnect  = $("btnConnect");
  const userName    = $("userName"),    btnDisconnect = $("btnDisconnect");
  const draftSelect = $("draftSelect"), draftCard   = $("draftCard");
  const btnSampleDraft = $("btnSampleDraft");
  const draftClient = $("draftClient"), draftType   = $("draftType");
  const draftName   = $("draftName"),   draftVerdict = $("draftVerdict");
  const draftAvailability = $("draftAvailability");
  const validationPanel = $("validationPanel"), issueList = $("issueList");
  const btnFill     = $("btnFill"),     btnValidate = $("btnValidate");
  const btnRefresh  = $("btnRefresh"),  btnClear    = $("btnClear");
  const btnScan     = $("btnScan"),     btnCopyScan = $("btnCopyScan"),  btnTest = $("btnTest");
  const scanPanel   = $("scanPanel"),   scanCount   = $("scanCount");
  const scanUrl     = $("scanUrl"),     scanBody    = $("scanBody");
  const resultPanel = $("resultPanel"), resultSummary = $("resultSummary");
  const resultList  = $("resultList");
  const spinner     = $("spinner"),     errorBanner = $("errorBanner");
  const clearDialog = $("clearDialog"), btnClearConfirm = $("btnClearConfirm"), btnClearCancel = $("btnClearCancel");

  // Tab refs
  const tabPartA       = $("tabPartA"),      tabNewCo       = $("tabNewCo");
  const tabPanelPartA  = $("tabPanelPartA"), tabPanelNewCo  = $("tabPanelNewCo");

  // Client identity bar
  const clientIdentityBar = $("clientIdentityBar");
  const cibClientName     = $("cibClientName");
  const cibClientId       = $("cibClientId");
  const cibCategory       = $("cibCategory");
  const cibBadge          = $("cibBadge");

  // New Company Reg refs
  const ncoDraftSelect   = $("ncoDraftSelect");
  const ncoCategoryList  = $("ncoCategoryList");
  const ncoBtnFill       = $("ncoBtnFill");
  const ncoBtnValidate   = $("ncoBtnValidate");
  const ncoBtnRefresh    = $("ncoBtnRefresh");
  const ncoBtnClear      = $("ncoBtnClear");
  const ncoResultPanel   = $("ncoResultPanel");
  const ncoResultSummary = $("ncoResultSummary");
  const ncoResultList    = $("ncoResultList");
  const ncoDraftCount    = $("ncoDraftCount");

  // ── State ──
  let token = null;
  let currentDraft = null;
  let ncoDraft = null;
  let drafts = [];
  let ncoDrafts = [];
  let lastScanData = [];
  let activeTabUrl = "";
  let isSampleDraft = false;
  let activeTab = "partA";

  // ── Helpers ──
  function showSpinner(yes) { spinner.style.display = yes ? "flex" : "none"; }
  function showError(msg) {
    errorBanner.textContent = msg || "";
    errorBanner.style.display = msg ? "block" : "none";
  }
  function clearError() { showError(""); }

  function setConn(state, label) {
    connDot.className = "dot " + state;
    connLabel.textContent = label;
  }

  function setPageStatus(tab) {
    activeTabUrl = tab?.url || "";
    pageRow.style.display = "flex";
    if (!tab) { pageDot.className = "dot-page"; pageLabel.textContent = "No active tab"; btnSampleDraft.disabled = true; return; }
    const isMCA = tab.url?.includes("mca.gov.in") || tab.url?.startsWith("http://localhost:4000/");
    pageDot.className = "dot-page " + (isMCA ? "active" : "inactive");
    const isDemo = tab.url?.startsWith("http://localhost:4000/");
    pageLabel.textContent = isDemo ? "Local demo form detected" : isMCA ? "MCA form detected" : "Not on MCA portal";
    btnSampleDraft.disabled = !isDemo;
    btnSampleDraft.title = isDemo ? "Load sample data for the local demo form" : "Open the local demo form at localhost:4000 to use sample data";
  }

  function companyTypeLabel(ct) {
    const m = { PRIVATE_LIMITED: "Private Limited", OPC: "One Person Company", LLP: "LLP", PUBLIC_LIMITED: "Public Limited" };
    return m[ct] || ct || "—";
  }

  // ── Client identity bar ──
  function showClientIdentity(draft, category) {
    if (!draft) { clientIdentityBar.style.display = "none"; return; }
    clientIdentityBar.style.display = "flex";
    cibClientName.textContent = draft.clientName || "—";
    cibClientId.textContent   = draft.clientId ? `ID: ${draft.clientId}` : draft.id || "—";
    cibCategory.textContent   = category || companyTypeLabel(draft.companyType);
    cibBadge.textContent      = category || "Client";
  }

  function showMain(user) {
    authPanel.style.display = "none";
    mainPanel.style.display = "flex";
    setConn("online", "Connected to Ledgerly");
    userName.textContent = user?.name ? `${user.name} (${user.role})` : "";
  }

  function showAuth(errorMsg) {
    authPanel.style.display = "flex";
    mainPanel.style.display = "none";
    setConn("", "Not connected");
    if (errorMsg) authError.textContent = errorMsg;
    else authError.textContent = "";
  }

  // ── Tab switching ──
  function switchTab(tab) {
    activeTab = tab;
    tabPartA.classList.toggle("tab-active", tab === "partA");
    tabNewCo.classList.toggle("tab-active", tab === "newCo");
    tabPanelPartA.style.display = tab === "partA" ? "" : "none";
    tabPanelNewCo.style.display = tab === "newCo" ? "" : "none";
  }

  tabPartA.addEventListener("click", () => switchTab("partA"));
  tabNewCo.addEventListener("click", () => switchTab("newCo"));

  // ── Render draft card (Part A) ──
  function renderDraftCard(draft) {
    if (!draft) { draftCard.style.display = "none"; validationPanel.style.display = "none"; showClientIdentity(null); return; }
    draftCard.style.display = "flex";
    draftClient.textContent   = draft.clientName || "—";
    draftType.textContent     = companyTypeLabel(draft.companyType);
    const name0 = draft.proposedNames?.[0];
    draftName.textContent     = name0?.name || "—";
    const verdict = name0?.verdict || "—";
    draftVerdict.textContent  = verdict.replace(/_/g, " ").toLowerCase();
    draftVerdict.className    = "verdict-badge" + (verdict === "NO_MATCH" ? "" : " warn");
    if (verdict === "NO_MATCH" && name0?.source) {
      draftAvailability.textContent = `No match found (${name0.source})`;
      draftAvailability.style.color = "#333";
    } else {
      draftAvailability.textContent = "Name availability not verified";
      draftAvailability.style.color = "#888";
    }
    const issues = draft.validation || [];
    if (issues.length) {
      validationPanel.style.display = "block";
      issueList.innerHTML = issues.map(v =>
        `<li class="${v.severity === "ERROR" ? "error" : "warn"}">${v.severity}: ${v.message}</li>`
      ).join("");
    } else {
      validationPanel.style.display = "none";
    }
    const errorCount = issues.filter(v => v.severity === "ERROR").length;
    btnFill.disabled     = errorCount > 0;
    btnValidate.disabled = false;
    btnClear.disabled    = false;
    btnFill.title = errorCount > 0 ? "Resolve validation errors before filling" : "";
    showClientIdentity(draft, "SPICe+ Part A");
  }

  // ── Render results (shared) ──
  function renderResults(results, summaryEl, listEl, panelEl) {
    panelEl.style.display = "block";
    const filled  = results.filter(r => r.status === "filled").length;
    const skipped = results.filter(r => r.status === "skipped").length;
    const invalid = results.filter(r => r.status === "invalid").length;
    const review  = results.filter(r => r.status === "needs-review").length;
    summaryEl.textContent = `${filled} filled · ${skipped} skipped · ${invalid} invalid · ${review} needs review`;
    const formatted = formatResults(results);
    listEl.innerHTML = formatted.map(r =>
      `<li class="status_${r.cssClass}">
        <span class="r-icon">${r.icon}</span>
        <span class="r-label">${r.label}</span>
        <span class="r-reason">${r.reason || ""}</span>
      </li>`
    ).join("");
  }

  // ── Render NCO categories ──
  function renderNCOCategories(draft) {
    if (!draft) {
      ncoCategoryList.style.display = "none";
      ncoBtnFill.disabled = ncoBtnValidate.disabled = ncoBtnClear.disabled = true;
      showClientIdentity(null);
      return;
    }

    // Show client identity bar
    showClientIdentity(draft, "New Company Registration");

    const fields = draft.submittedFields || {};

    ncoCategoryList.innerHTML = INC32_CATEGORIES.map(cat => {
      const rows = cat.fields.map(f => {
        const val = fields[f.dataKey] || fields[f.key] || "";
        const isEmpty = !val;
        const statusClass = isEmpty ? (f.required ? "nco-empty nco-required" : "nco-empty") : "nco-filled";
        const statusIcon  = isEmpty ? (f.required ? "⚠" : "–") : "✓";
        return `
          <div class="nco-field-row ${statusClass}">
            <span class="nco-field-icon">${statusIcon}</span>
            <span class="nco-field-label">${escHtml(f.label)}</span>
            <span class="nco-field-val">${val ? escHtml(String(val)) : isEmpty && f.required ? '<em class="nco-missing">Missing</em>' : '<em class="nco-optional">—</em>'}</span>
          </div>`;
      }).join("");

      const filledCount  = cat.fields.filter(f => !!(fields[f.dataKey] || fields[f.key])).length;
      const totalCount   = cat.fields.length;
      const pct          = Math.round((filledCount / totalCount) * 100);
      const allFilled    = filledCount === totalCount;

      return `
        <div class="nco-category">
          <div class="nco-cat-header" data-cat="${cat.id}">
            <span class="nco-cat-icon">${cat.icon}</span>
            <span class="nco-cat-label">${cat.label}</span>
            <span class="nco-cat-progress ${allFilled ? "nco-progress-done" : ""}">${filledCount}/${totalCount}</span>
            <span class="nco-cat-chevron">›</span>
          </div>
          <div class="nco-cat-body" id="catBody_${cat.id}" style="display:none">
            <div class="nco-progress-bar"><div class="nco-progress-fill" style="width:${pct}%"></div></div>
            ${rows}
          </div>
        </div>`;
    }).join("");

    // Accordion toggle
    ncoCategoryList.querySelectorAll(".nco-cat-header").forEach(hdr => {
      hdr.addEventListener("click", () => {
        const body = $("catBody_" + hdr.dataset.cat);
        const chevron = hdr.querySelector(".nco-cat-chevron");
        const open = body.style.display !== "none";
        body.style.display = open ? "none" : "block";
        chevron.style.transform = open ? "" : "rotate(90deg)";
      });
    });

    ncoCategoryList.style.display = "block";
    ncoBtnFill.disabled     = false;
    ncoBtnValidate.disabled = false;
    ncoBtnClear.disabled    = false;
  }

  // ── Token management ──
  function getStoredToken() {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ action: "GET_TOKEN" }, res => resolve(res?.token || null))
    );
  }
  function storeToken(t, meta) {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ action: "SET_TOKEN", token: t, meta }, resolve)
    );
  }
  function clearToken() {
    return new Promise(resolve =>
      chrome.runtime.sendMessage({ action: "CLEAR_TOKEN" }, resolve)
    );
  }

  function sendToContent(msg) {
    return new Promise((resolve) =>
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(res || { ok: false, error: "No response" });
        }
      })
    );
  }

  // ── Load Part A drafts ──
  async function loadDrafts() {
    btnRefresh.disabled = true;
    showSpinner(true); clearError();
    try {
      drafts = await fetchDrafts(token);
      draftSelect.innerHTML = '<option value="">— Select a draft —</option>' +
        drafts.map(d => `<option value="${d.id}">${d.id} — ${d.clientName}</option>`).join("");
      if (drafts.length === 0) {
        draftSelect.innerHTML = '<option value="">No READY_FOR_PART_A drafts</option>';
      }
    } catch (e) {
      if (e.name === "AuthError") { await clearToken(); showAuth(e.message); return; }
      showError(e.message);
    } finally {
      showSpinner(false); btnRefresh.disabled = false;
    }
  }

  // ── Load New Company drafts ──
  async function loadNCODrafts() {
    ncoBtnRefresh.disabled = true;
    showSpinner(true); clearError();
    try {
      // Fetch all drafts and filter for new company registration type
      const all = await fetchDrafts(token);
      // New company drafts are those marked as new company reg OR not yet in Part A
      ncoDrafts = all.filter(d =>
        d.formType === "NEW_COMPANY" ||
        d.formType === "INC32" ||
        d.category === "NEW_COMPANY_REGISTRATION" ||
        // fallback: include all if backend doesn't differentiate yet
        true
      );
      ncoDraftCount.textContent = `${ncoDrafts.length} pending`;
      ncoDraftSelect.innerHTML = '<option value="">— Select a client draft —</option>' +
        ncoDrafts.map(d => `<option value="${d.id}">${d.clientName || d.id}${d.clientId ? " · " + d.clientId : ""}</option>`).join("");
      if (ncoDrafts.length === 0) {
        ncoDraftSelect.innerHTML = '<option value="">No New Company drafts</option>';
        ncoDraftCount.textContent = "0 pending";
      }
    } catch (e) {
      if (e.name === "AuthError") { await clearToken(); showAuth(e.message); return; }
      showError(e.message);
    } finally {
      showSpinner(false); ncoBtnRefresh.disabled = false;
    }
  }

  // ── Init ──
  async function init() {
    setConn("", "Checking…");
    token = await getStoredToken();
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => setPageStatus(tabs[0]));
    if (!token || isTokenExpired(token)) { showAuth(); return; }
    const payload = decodeTokenPayload(token);
    showMain(payload);
    await loadDrafts();
    await loadNCODrafts();
  }

  // ── Event: Connect ──
  btnConnect.addEventListener("click", async () => {
    authError.textContent = "";
    showSpinner(true);
    try {
      const result = await exchangeToken();
      token = result.token;
      await storeToken(token, { user: result.user, expiresAt: result.expiresAt });
      showMain(result.user);
      await loadDrafts();
      await loadNCODrafts();
    } catch (e) {
      authError.textContent = e.message;
      if (e.name === "NetworkError") {
        authError.textContent = "Cannot reach Ledgerly. Is the server running at http://localhost:3000?";
      }
    } finally {
      showSpinner(false);
    }
  });

  btnDisconnect.addEventListener("click", async () => {
    token = null; currentDraft = null; ncoDraft = null; isSampleDraft = false;
    await clearToken();
    showAuth();
    resultPanel.style.display = "none";
    ncoResultPanel.style.display = "none";
    clearError();
  });

  // ── Event: Part A draft select ──
  draftSelect.addEventListener("change", async () => {
    const id = draftSelect.value;
    isSampleDraft = false;
    resultPanel.style.display = "none";
    clearError();
    if (!id) { currentDraft = null; renderDraftCard(null); btnFill.disabled = btnValidate.disabled = btnClear.disabled = true; return; }
    showSpinner(true);
    try {
      currentDraft = await fetchDraft(token, id);
      renderDraftCard(currentDraft);
    } catch (e) {
      showError(e.message);
      if (e.name === "AuthError") { await clearToken(); showAuth(e.message); }
    } finally { showSpinner(false); }
  });

  // ── Event: NCO draft select ──
  ncoDraftSelect.addEventListener("change", async () => {
    const id = ncoDraftSelect.value;
    ncoResultPanel.style.display = "none";
    clearError();
    if (!id) { ncoDraft = null; renderNCOCategories(null); return; }
    showSpinner(true);
    try {
      ncoDraft = await fetchDraft(token, id);
      renderNCOCategories(ncoDraft);
    } catch (e) {
      showError(e.message);
      if (e.name === "AuthError") { await clearToken(); showAuth(e.message); }
    } finally { showSpinner(false); }
  });

  btnRefresh.addEventListener("click", () => {
    isSampleDraft = false;
    currentDraft = null; draftCard.style.display = "none";
    resultPanel.style.display = "none"; validationPanel.style.display = "none";
    btnFill.disabled = btnValidate.disabled = btnClear.disabled = true;
    showClientIdentity(null);
    loadDrafts();
  });

  ncoBtnRefresh.addEventListener("click", () => {
    ncoDraft = null;
    ncoCategoryList.style.display = "none";
    ncoResultPanel.style.display = "none";
    showClientIdentity(null);
    loadNCODrafts();
  });

  btnSampleDraft.addEventListener("click", () => {
    if (!activeTabUrl.startsWith("http://localhost:4000/")) {
      showError("Sample data is available only on the local demo form at localhost:4000.");
      return;
    }
    currentDraft = {
      id: "LOCAL-SAMPLE-SPICE-A",
      clientName: "Sample LLP (local test data)",
      clientId: "CLT-0001",
      companyType: "LLP",
      proposedNames: [
        { name: "Northstar Digital Services LLP", verdict: "SAMPLE_ONLY" },
        { name: "Northstar Data Systems LLP", verdict: "SAMPLE_ONLY" },
      ],
      submittedFields: {
        "LLPIN": "LLPIN-TEST-0001",
        "NIC code": "62011",
        "Business activity": "Computer programming activities",
        "Language": "English",
      },
      validation: [],
      demoOnly: true,
    };
    isSampleDraft = true;
    draftSelect.value = "";
    resultPanel.style.display = "none";
    clearError();
    renderDraftCard(currentDraft);
  });

  // ── Event: Part A Fill/Validate/Clear ──
  btnFill.addEventListener("click", async () => {
    if (!currentDraft) return;
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "FILL_FORM", draft: currentDraft, sampleData: isSampleDraft });
    showSpinner(false);
    if (!res.ok) { showError(res.error); return; }
    renderResults(res.results, resultSummary, resultList, resultPanel);
  });

  btnValidate.addEventListener("click", async () => {
    if (!currentDraft) return;
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "VALIDATE_FIELDS", draft: currentDraft, sampleData: isSampleDraft });
    showSpinner(false);
    if (!res.ok) { showError(res.error); return; }
    renderResults(res.results, resultSummary, resultList, resultPanel);
  });

  btnClear.addEventListener("click", () => { clearDialog.style.display = "flex"; });
  btnClearCancel.addEventListener("click", () => { clearDialog.style.display = "none"; });
  btnClearConfirm.addEventListener("click", async () => {
    clearDialog.style.display = "none";
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "CLEAR_FORM" });
    showSpinner(false);
    if (!res.ok) { showError(res.error); return; }
    resultPanel.style.display = "none";
  });

  // ── Event: NCO Fill/Validate/Clear ──
  ncoBtnFill.addEventListener("click", async () => {
    if (!ncoDraft) return;
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "FILL_FORM", draft: ncoDraft, formType: "INC32" });
    showSpinner(false);
    if (!res.ok) { showError(res.error); return; }
    renderResults(res.results, ncoResultSummary, ncoResultList, ncoResultPanel);
  });

  ncoBtnValidate.addEventListener("click", async () => {
    if (!ncoDraft) return;
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "VALIDATE_FIELDS", draft: ncoDraft, formType: "INC32" });
    showSpinner(false);
    if (!res.ok) { showError(res.error); return; }
    renderResults(res.results, ncoResultSummary, ncoResultList, ncoResultPanel);
  });

  ncoBtnClear.addEventListener("click", async () => {
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "CLEAR_FORM" });
    showSpinner(false);
    if (!res.ok) { showError(res.error); return; }
    ncoResultPanel.style.display = "none";
  });

  // ── Event: Scan Page Fields ──
  btnScan.addEventListener("click", async () => {
    clearError(); showSpinner(true);
    scanPanel.style.display = "none";
    const res = await sendToContent({ action: "SCAN_FIELDS" });
    showSpinner(false);
    if (!res.ok) {
      showError(res.error || "Could not scan page. Reload the tab and try again.");
      return;
    }
    lastScanData = res.fields || [];
    scanCount.textContent = `(${res.total} found on ${res.title || res.url})`;
    scanUrl.textContent = res.url || "";
    scanBody.innerHTML = lastScanData.length === 0
      ? `<tr><td colspan="4" style="color:#888;padding:8px">No form fields found on this page.</td></tr>`
      : lastScanData.map(f => `
          <tr>
            <td>${f.label ? escHtml(f.label) : "<span style='color:#bbb'>—</span>"}</td>
            <td class="mono">${f.tag}</td>
            <td class="mono">${f.name ? escHtml(f.name) : "<span style='color:#bbb'>—</span>"}</td>
            <td class="mono">${f.id  ? escHtml(f.id)   : "<span style='color:#bbb'>—</span>"}</td>
          </tr>`).join("");
    scanPanel.style.display = "block";
  });

  btnCopyScan.addEventListener("click", () => {
    if (!lastScanData.length) return;
    const text = JSON.stringify(lastScanData, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      btnCopyScan.textContent = "Copied scan data";
      setTimeout(() => { btnCopyScan.textContent = "Copy scan data"; }, 2000);
    });
  });

  function escHtml(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  btnTest.addEventListener("click", async () => {
    clearError(); showSpinner(true);
    const res = await sendToContent({ action: "TEST_FILL", value: "Ledgerly ✓" });
    showSpinner(false);
    if (!res.ok) {
      showError(res.error || "Test fill failed. Reload the page tab and try again.");
      return;
    }
    showError("");
    const banner = $("errorBanner");
    banner.textContent = `Test fill successful. Filled ${res.filled.selector} with "${res.value}". Check the page for the outline.`;
    banner.style.display = "block";
    banner.style.background = "#f1f1f1";
    banner.style.color = "#222";
    banner.style.border = "1px solid #d5d5d5";
    setTimeout(() => {
      banner.style.display = "none";
      banner.style.background = "";
      banner.style.color = "";
      banner.style.border = "";
    }, 5000);
  });

  init();
})();
