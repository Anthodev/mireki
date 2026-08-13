const container = document.querySelector("#services");
const template = document.querySelector("#service-template");
const notice = document.querySelector("#notice");
const thresholdForm = document.querySelector("#completion-threshold-form");
const thresholdInput = document.querySelector("#completion-threshold");
const thresholdValue = document.querySelector("#completion-threshold-value");
const thresholdButton = document.querySelector("#save-completion-threshold");
const controlsContainer = document.querySelector("#scrobble-controls");
const scrobblingEnabled = document.querySelector("#scrobbling-enabled");
const providerControls = document.querySelector("#provider-controls");
const providerList = document.querySelector("#provider-list");
const suspensionStatus = document.querySelector("#suspension-status");
const suspensionLabel = document.querySelector("#suspension-label");
const resumeScrobbling = document.querySelector("#resume-scrobbling");
const {
  COMPLETION_THRESHOLD_KEY,
  DEFAULT_COMPLETION_THRESHOLD,
  normalizeCompletionThreshold,
} = MirekiCompletionThreshold;
function setControlsBusy(busy) {
  controlsContainer.setAttribute("aria-busy", String(busy));
  scrobblingEnabled.disabled = busy;
  providerControls.disabled = busy;
  resumeScrobbling.disabled = busy;
  for (const input of providerList.querySelectorAll("input")) input.disabled = busy;
}

function suspensionText(controls) {
  if (controls.mode !== "paused") return "";
  if (controls.resumeAt === null) return "Scrobbling is paused until the browser restarts.";
  return `Scrobbling is paused until ${new Date(controls.resumeAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
}

function renderControls(controls) {
  scrobblingEnabled.checked = controls.globallyEnabled;
  providerList.replaceChildren(...controls.providers.map((provider) => {
    const label = document.createElement("label");
    const name = document.createElement("span");
    const input = document.createElement("input");
    label.className = "toggle-setting compact";
    name.textContent = provider.label;
    input.type = "checkbox";
    input.checked = provider.enabled;
    input.addEventListener("change", () => updateControls({
      type: "scrobble-controls:set-provider",
      providerId: provider.id,
      enabled: input.checked,
    }, `${provider.label} scrobbling ${input.checked ? "enabled" : "disabled"}.`));
    label.append(name, input);
    return label;
  }));
  const paused = controls.mode === "paused";
  suspensionStatus.hidden = !paused;
  suspensionLabel.textContent = suspensionText(controls);
  setControlsBusy(false);
}

async function updateControls(message, successNotice) {
  setControlsBusy(true);
  try {
    const response = await browser.runtime.sendMessage(message);
    if (!response?.ok) throw new Error("Control update failed");
    renderControls(response.controls);
    notice.textContent = successNotice;
  } catch {
    notice.textContent = "Unable to update scrobbling controls.";
    await loadControls();
  }
}

async function loadControls() {
  setControlsBusy(true);
  try {
    const response = await browser.runtime.sendMessage({ type: "scrobble-controls:get" });
    if (!response?.ok) throw new Error("Control load failed");
    renderControls(response.controls);
  } catch {
    controlsContainer.setAttribute("aria-busy", "false");
    notice.textContent = "Unable to load scrobbling controls.";
  }
}

async function loadCompletionThreshold() {
  let threshold = DEFAULT_COMPLETION_THRESHOLD;
  try {
    const stored = await browser.storage.local.get(COMPLETION_THRESHOLD_KEY);
    threshold = normalizeCompletionThreshold(stored?.[COMPLETION_THRESHOLD_KEY]);
  } catch {
    notice.textContent = "Unable to load watched threshold.";
  }
  thresholdInput.value = String(threshold);
  thresholdValue.textContent = `${threshold}%`;
  thresholdInput.disabled = false;
  thresholdButton.disabled = false;
}

async function loadServices() {
  try {
    const services = await browser.runtime.sendMessage({ type: "auth:list" });
    container.textContent = "";
    for (const service of services) {
      const card = template.content.cloneNode(true);
      card.querySelector(".service-name").textContent = service.label;
      const status = card.querySelector(".service-status");
      status.textContent = !service.available ? "Not configured" : service.connected ? "Connected" : "Not connected";
      const button = card.querySelector("button");
      button.textContent = service.connected ? "Disconnect" : "Connect";
      button.classList.toggle("secondary", service.connected);
      button.disabled = !service.available;
      button.addEventListener("click", async () => {
        button.disabled = true;
        notice.textContent = service.connected ? "Disconnecting…" : "Opening secure sign-in…";
        try {
          const result = await browser.runtime.sendMessage({ type: service.connected ? "auth:disconnect" : "auth:connect", serviceId: service.id });
          notice.textContent = MirekiOptionsStatus.resultNotice(result);
        } catch {
          notice.textContent = "Authentication failed.";
        }
        await loadServices();
      });
      container.append(card);
    }
  } catch {
    container.textContent = "Unable to load services.";
  }
}
scrobblingEnabled.addEventListener("change", () => updateControls({
  type: "scrobble-controls:set-global",
  enabled: scrobblingEnabled.checked,
}, scrobblingEnabled.checked ? "Scrobbling enabled." : "Scrobbling disabled."));
resumeScrobbling.addEventListener("click", () => updateControls(
  { type: "scrobble-controls:resume" },
  "Scrobbling resumed.",
));
thresholdInput.addEventListener("input", () => {
  thresholdValue.textContent = `${thresholdInput.value}%`;
});
thresholdForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const threshold = normalizeCompletionThreshold(Number(thresholdInput.value));
  thresholdInput.disabled = true;
  thresholdButton.disabled = true;
  try {
    await browser.storage.local.set({ [COMPLETION_THRESHOLD_KEY]: threshold });
    notice.textContent = "Watched threshold saved.";
  } catch {
    notice.textContent = "Unable to save watched threshold.";
  } finally {
    thresholdInput.disabled = false;
    thresholdButton.disabled = false;
  }
});
loadCompletionThreshold();
loadControls();
loadServices();
