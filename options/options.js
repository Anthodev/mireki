const container = document.querySelector("#services");
const template = document.querySelector("#service-template");
const notice = document.querySelector("#notice");
const thresholdForm = document.querySelector("#completion-threshold-form");
const thresholdInput = document.querySelector("#completion-threshold");
const thresholdValue = document.querySelector("#completion-threshold-value");
const thresholdButton = document.querySelector("#save-completion-threshold");
const {
  COMPLETION_THRESHOLD_KEY,
  DEFAULT_COMPLETION_THRESHOLD,
  normalizeCompletionThreshold,
} = MirekiCompletionThreshold;

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
loadServices();
