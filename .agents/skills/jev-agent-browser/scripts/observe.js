() => {
  if (!document.body) return null;
  const cache = (window.__jevAgent ||= { ids: new WeakMap(), nodes: new Map(), next: 1 });
  const identity = (element) => {
    if (!cache.ids.has(element)) cache.ids.set(element, cache.next++);
    const id = cache.ids.get(element);
    cache.nodes.set(id, element);
    return id;
  };
  for (const [id, element] of cache.nodes) if (!element.isConnected) cache.nodes.delete(id);

  const safe = (element) => !["password", "file", "hidden"].includes(element.type);
  const visible = (element) =>
    !element.closest('[aria-hidden="true"],[inert]') &&
    element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  const nameOf = (element, seen = new Set()) => {
    if (!element || seen.has(element)) return "";
    seen.add(element);
    const referenced = (element.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => nameOf(document.getElementById(id), seen))
      .filter(Boolean)
      .join(" ");
    return (
      referenced ||
      element.getAttribute("aria-label") ||
      [...(element.labels || [])].map((label) => nameOf(label, seen)).filter(Boolean).join(" ") ||
      (["button", "submit", "reset"].includes(element.type) ? element.value : "") ||
      element.getAttribute("alt") ||
      (element.tagName === "INPUT"
        ? ""
        : [...element.childNodes]
            .map((node) =>
              node.nodeType === 3
                ? node.textContent
                : node.nodeType === 1 && node.getAttribute("aria-hidden") !== "true"
                  ? nameOf(node, seen)
                  : "",
            )
            .join(" ")
            .trim()) ||
      element.getAttribute("title") ||
      element.getAttribute("placeholder") ||
      ""
    );
  };
  const roles = [
    "button", "link", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemradio",
    "option", "gridcell", "combobox", "textbox", "searchbox", "spinbutton",
  ];
  const selector = [
    'a[href],button,input,textarea,select,summary,[contenteditable="true"]',
    ...roles.map((role) => `[role="${role}"]`),
  ].join(",");
  const roleOf = (element) => {
    const explicit = element.getAttribute("role");
    if (roles.includes(explicit)) return explicit;
    if (element.tagName === "BUTTON" || element.tagName === "SUMMARY") return "button";
    if (element.tagName === "A") return "link";
    if (element.tagName === "SELECT") return "combobox";
    if (element.tagName === "TEXTAREA" || element.isContentEditable) return "textbox";
    if (element.tagName === "INPUT") {
      if (["checkbox", "radio"].includes(element.type)) return element.type;
      if (["button", "submit", "reset", "image"].includes(element.type)) return "button";
      if (element.type === "search") return "searchbox";
      if (element.type === "number") return "spinbutton";
      if (["text", "email", "url", "tel"].includes(element.type)) return "textbox";
    }
    return null;
  };

  const containerOf = (element) => {
    const dialog = element.closest('dialog,[role="dialog"],[role="alertdialog"]');
    if (dialog) return "dialog";
    if (element.closest("form")) return "form";
    return "page";
  };
  const commitOf = (element) => {
    if (element.tagName === "BUTTON" || element.getAttribute("role") === "button") {
      if (element.type === "submit" || element.getAttribute("type") === "submit") return "submit";
      if (element.type === "reset" || element.getAttribute("type") === "reset") return "reset";
    }
    return "";
  };

  cache.guard = (element) => {
    if (!element?.isConnected || !visible(element)) return null;
    const scope = element.closest('form,dialog,[role="dialog"],[role="alertdialog"],article,li,tr,[role="row"]') || element.parentElement;
    return [
      identity(element), roleOf(element), nameOf(element), element.value ?? null,
      element.checked ?? null, element.selectedIndex ?? null, element.readOnly ?? null,
      element.matches(":disabled"), element.getAttribute("aria-disabled"),
      element.getAttribute("aria-expanded"), element.getAttribute("aria-checked"),
      element.getAttribute("aria-selected"), element.getAttribute("href"),
      element.getAttribute("data-test"), containerOf(element), commitOf(element),
      scope?.innerText?.slice(0, 6000) || "",
    ];
  };

  const actions = [];
  for (const element of document.querySelectorAll(selector)) {
    if (!safe(element) || !visible(element) || element.matches(":disabled") || element.closest('[aria-disabled="true"]')) continue;
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2;
    const y = rect.y + rect.height / 2;
    const role = roleOf(element);
    if (!role || rect.width <= 0 || rect.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    if (role === "gridcell" && element.querySelector('button,[role="button"]')) continue;
    const base = {
      node: identity(element),
      role,
      label: nameOf(element) || role,
      container: containerOf(element),
      testid: element.getAttribute("data-test") || "",
      commit: commitOf(element),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
    for (const key of ["checked", "selected", "expanded"]) {
      const value = element.getAttribute(`aria-${key}`);
      if (value !== null) base[key] = value;
    }
    if (["checkbox", "radio"].includes(element.type)) base.checked = String(element.checked);
    if (element.tagName === "SELECT") {
      const current = [...element.selectedOptions].map((option) => option.label).join(", ");
      const control = element.getAttribute("aria-label") || element.getAttribute("title") || role;
      base.label = control;
      for (const option of element.options) {
        if (option.selected || option.disabled || option.closest("optgroup[disabled]")) continue;
        actions.push({
          ...base,
          kind: "select",
          value: option.value,
          current_value: current,
          label: `${base.label} → ${option.label}`,
        });
      }
    } else {
      const editable = !element.readOnly && element.getAttribute("aria-readonly") !== "true" &&
        (["textbox", "searchbox", "spinbutton"].includes(role) ||
          (role === "combobox" && ["INPUT", "TEXTAREA"].includes(element.tagName)));
      const value = "value" in element
        ? String(element.value)
        : element.isContentEditable || role === "combobox" ? element.innerText.trim() : "";
      actions.push({ ...base, kind: editable ? "fill" : "click", value });
      if (editable) actions.push({ ...base, kind: "click", value, label: `Open ${base.label}` });
    }
  }

  const words = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node;
  let length = 0;
  while ((node = walker.nextNode()) && length < 6000) {
    const value = node.textContent.trim();
    const parent = node.parentElement;
    if (!value || !parent || parent.closest("script,style,noscript,template") || !visible(parent)) continue;
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth) {
      words.push(value);
      length += value.length;
    }
  }

  const omitted = Math.max(0, actions.length - 250);
  actions.splice(250);
  const seen = new Map();
  for (const action of actions) {
    const key = `${action.kind}|${action.label}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const action of actions) {
    if ((seen.get(`${action.kind}|${action.label}`) || 0) < 2) continue;
    const hint = [action.container, action.commit, action.testid].filter(Boolean).join(" ");
    if (hint) action.label = `${action.label} (${hint})`;
  }
  actions.forEach((action, index) => { action.id = `e${index + 1}`; });
  const height = document.documentElement.scrollHeight;
  if (scrollY + innerHeight < height - 2) actions.push({ id: "scroll_down", kind: "scroll", label: "Scroll down", delta: 560 });
  if (scrollY > 0) actions.push({ id: "scroll_up", kind: "scroll", label: "Scroll up", delta: -560 });
  actions.push({ id: "wait", kind: "wait", label: "Wait for the page to update" });
  const semantics = actions.map(({ rect, ...action }) => action);
  return {
    url: location.href,
    title: document.title,
    w: innerWidth,
    h: innerHeight,
    text: words.join("\n").slice(0, 6000),
    scroll: { y: scrollY, height },
    actions,
    marker: [performance.timeOrigin, location.href, scrollX, scrollY, innerWidth, innerHeight, document.title, words.join("\n").slice(0, 6000), semantics],
    guards: Object.fromEntries(actions.filter((action) => action.node).map((action) => [action.node, cache.guard(cache.nodes.get(action.node))])),
    omitted_actions: omitted,
  };
}
