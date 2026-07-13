const container = document.querySelector("#services");
const template = document.querySelector("#service-template");
const notice = document.querySelector("#notice");

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
loadServices();
