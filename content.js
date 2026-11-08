(() => {
  if (document.getElementById("skims-ai-launcher")) return;

  const button = document.createElement("button");
  button.id = "skims-ai-launcher";
  button.type = "button";
  button.textContent = "✦ Draft SKIMS response";
  button.title = "Open the SKIMS drafting assistant. Select only the relevant customer message first.";
  Object.assign(button.style, {
    position: "fixed", right: "22px", bottom: "22px", zIndex: "2147483647",
    border: "0", borderRadius: "999px", padding: "12px 16px",
    background: "#171717", color: "#fff", font: "600 13px Arial, sans-serif",
    boxShadow: "0 4px 16px rgba(0,0,0,.22)", cursor: "pointer"
  });
  button.addEventListener("click", () => {
    const selectedText = String(window.getSelection()?.toString() || "").trim();
    chrome.runtime.sendMessage({ type: "OPEN_SKIMS_PANEL", selectedText });
  });
  document.documentElement.appendChild(button);
})();
