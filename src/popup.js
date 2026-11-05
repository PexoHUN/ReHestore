const checkbox = document.getElementById("enabled");
const themeBtns = Array.from(document.querySelectorAll("#theme [data-theme]"));
const darkMQ = matchMedia("(prefers-color-scheme: dark)");

function paintTheme(theme) {
  themeBtns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.theme === theme)));
  const dark = theme === "dark" || (theme === "auto" && darkMQ.matches);
  document.documentElement.classList.toggle("dark", dark);
}

chrome.storage.local.get({ enabled: true, theme: "light" }, (res) => {
  checkbox.checked = res.enabled !== false;
  paintTheme(["light", "dark", "auto"].includes(res.theme) ? res.theme : "light");
});

themeBtns.forEach((b) => {
  b.addEventListener("click", () => {
    const theme = b.dataset.theme;
    paintTheme(theme);
    chrome.storage.local.set({ theme }); // the content script listens to storage changes → no reload needed
  });
});
darkMQ.addEventListener("change", () => {
  const cur = themeBtns.find((b) => b.getAttribute("aria-checked") === "true");
  if (cur) paintTheme(cur.dataset.theme);
});

checkbox.addEventListener("change", () => {
  const enabled = checkbox.checked;
  chrome.storage.local.set({ enabled }, () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (tab && tab.id && /hestore\.hu/i.test(tab.url || "")) {
        chrome.tabs.reload(tab.id);
      }
    });
  });
});
