import "./styles.css";
import { CosmosScene } from "./cosmos-scene";
import {
  canvasLabelFor,
  copyFor,
  fixtures,
  provenanceFor,
  titleFor,
  type DependencyGranularity,
  type StyleId,
  type TargetId,
  type VariantId,
} from "./cosmos-data";
import {
  cloneGalaxyParameters,
  defaultGalaxyParameters,
  dependencyDeclarationControlSections,
  galaxyControlSections,
  galaxyParameterValue,
  withGalaxyParameter,
  type GalaxyParameterValue,
  type GalaxyParameters,
  type GalaxyRoleId,
  type RGB,
} from "./galaxy-parameters";

const element = <T extends HTMLElement>(id: string): T => {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
};

const canvas = element<HTMLCanvasElement>("cosmos-canvas");
const title = element<HTMLElement>("model-title");
const description = element<HTMLElement>("model-description");
const fallback = element<HTMLElement>("fallback");
const fallbackMessage = element<HTMLElement>("fallback-message");
const starTooltip = element<HTMLElement>("star-tooltip");
const formulaPanel = element<HTMLElement>("formula-panel");
const formulaOpenButton = element<HTMLButtonElement>("formula-open");
const formulaCloseButton = element<HTMLButtonElement>("formula-close");
const formulaControls = element<HTMLElement>("formula-controls");
const formulaEquation = element<HTMLElement>("formula-equation");
const formulaResetRole = element<HTMLButtonElement>("formula-reset-role");
const formulaResetAll = element<HTMLButtonElement>("formula-reset-all");
const formulaRoleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-formula-role]")];
const dependencyGranularityButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-dependency-granularity]")];
const dependencyPackageCount = element<HTMLElement>("dependency-package-count");
const dependencyDeclarationCount = element<HTMLElement>("dependency-declaration-count");
const motionButton = element<HTMLButtonElement>("motion-toggle");
const motionIcon = motionButton.querySelector<HTMLElement>("span:first-child")!;
const motionText = motionButton.querySelector<HTMLElement>("span:last-child")!;
const styleButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-style]")];
const variantButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-variant]")];
const targetButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-target]")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeTarget: TargetId = "rails";
let activeStyle: StyleId = "galaxy";
let activeVariant: VariantId = "a";
let activeDependencyGranularity: DependencyGranularity = "packages";
let scene: CosmosScene | null = null;
let galaxyParameters: GalaxyParameters = cloneGalaxyParameters();
let activeFormulaRole: GalaxyRoleId = "core";
let formulaOpen = true;
let formulaFrame: number | null = null;
const pendingFormulaKeys = new Map<GalaxyRoleId, Set<string>>();

const formulaRoleLabels: Record<GalaxyRoleId, string> = { core: "Core", tests: "Tests", dependencies: "Dependencies" };
const shapeLabels = new Map([[0, "Diamond"], [1, "Ring"], [2, "Circle"]]);

function isVariant(value: string | null): value is VariantId {
  return value === "a";
}

function isStyle(value: string | null): value is StyleId {
  return value === "galaxy" || value === "city";
}

function isTarget(value: string | null): value is TargetId {
  return value === "rails" || value === "rdoc";
}

function isDependencyGranularity(value: string | null): value is DependencyGranularity {
  return value === "packages" || value === "declarations";
}

function viewFromUrl(): { target: TargetId; style: StyleId; variant: VariantId; dependencyGranularity: DependencyGranularity } {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("target")?.toLowerCase() ?? null;
  const style = params.get("style")?.toLowerCase() ?? null;
  const variant = params.get("variant")?.toLowerCase() ?? null;
  const dependencyGranularity = params.get("deps")?.toLowerCase() ?? null;
  return {
    target: isTarget(target) ? target : "rails",
    style: isStyle(style) ? style : "galaxy",
    variant: isVariant(variant) ? variant : "a",
    dependencyGranularity: isDependencyGranularity(dependencyGranularity) ? dependencyGranularity : "packages",
  };
}

function writeUrl(mode: "push" | "replace"): void {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("target", activeTarget);
  url.searchParams.set("style", activeStyle);
  url.searchParams.set("variant", activeVariant);
  url.searchParams.set("deps", activeDependencyGranularity);
  url.hash = "";
  window.history[mode === "push" ? "pushState" : "replaceState"]({ style: activeStyle, variant: activeVariant }, "", url);
}

function renderCopy(): void {
  const copy = copyFor(activeTarget, activeStyle, activeVariant);
  document.documentElement.dataset.style = activeStyle;
  title.textContent = copy.name;
  description.textContent = copy.sentence;
  document.title = titleFor(activeTarget, activeStyle, activeVariant);
  canvas.setAttribute("aria-label", canvasLabelFor(activeTarget, activeStyle, activeVariant));
  for (const button of styleButtons) button.setAttribute("aria-pressed", button.dataset.style === activeStyle ? "true" : "false");
  for (const button of variantButtons) button.setAttribute("aria-pressed", button.dataset.variant === activeVariant ? "true" : "false");
  for (const button of targetButtons) button.setAttribute("aria-pressed", button.dataset.target === activeTarget ? "true" : "false");
  for (const button of dependencyGranularityButtons) button.setAttribute("aria-pressed", button.dataset.dependencyGranularity === activeDependencyGranularity ? "true" : "false");
  dependencyPackageCount.textContent = fixtures[activeTarget].totals.packages.toLocaleString("en-GB");
  dependencyDeclarationCount.textContent = fixtures[activeTarget].totals.dependencyDeclarations.toLocaleString("en-GB");
  element<HTMLElement>("provenance").textContent = provenanceFor(activeTarget, activeStyle, activeDependencyGranularity);
  syncFormulaVisibility();
}

function syncFormulaVisibility(): void {
  const available = activeStyle === "galaxy";
  formulaPanel.hidden = !available || !formulaOpen;
  formulaOpenButton.hidden = !available || formulaOpen;
  formulaOpenButton.setAttribute("aria-expanded", available && formulaOpen ? "true" : "false");
}

function formulaText(role: GalaxyRoleId): string {
  if (role === "dependencies" && activeDependencyGranularity === "packages") return "channel = clamp(Σ normalised package evidence or context × weight, 0–1)";
  if (role === "dependencies") return "each point = one canonical RubyDex declaration · channel = clamp(Σ attribute × weight, 0–1)";
  return "channel = clamp(Σ normalised RubyDex attribute × weight, 0–1)";
}

function numberText(value: number, step: number): string {
  const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return value.toFixed(digits);
}

function rgbToHex(rgb: RGB): string {
  return `#${rgb.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): RGB {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as unknown as RGB;
}

function scheduleFormulaUpdate(role: GalaxyRoleId, key?: string): void {
  const keys = pendingFormulaKeys.get(role) ?? new Set<string>();
  if (key) keys.add(key);
  pendingFormulaKeys.set(role, keys);
  if (formulaFrame !== null) return;
  formulaFrame = requestAnimationFrame(() => {
    formulaFrame = null;
    for (const [changedRole, changedKeys] of pendingFormulaKeys) {
      const changedKey = changedKeys.size === 1 ? [...changedKeys][0] : undefined;
      scene?.setGalaxyParameters(galaxyParameters, changedRole, changedKey);
    }
    pendingFormulaKeys.clear();
  });
}

function setFormulaParameter(role: GalaxyRoleId, key: string, value: GalaxyParameterValue): void {
  galaxyParameters = withGalaxyParameter(galaxyParameters, role, key, value);
  scheduleFormulaUpdate(role, key);
}

function renderFormulaControls(): void {
  formulaControls.replaceChildren();
  formulaEquation.textContent = formulaText(activeFormulaRole);
  formulaResetRole.textContent = `Reset ${formulaRoleLabels[activeFormulaRole]}`;
  for (const button of formulaRoleButtons) button.setAttribute("aria-pressed", button.dataset.formulaRole === activeFormulaRole ? "true" : "false");

  const sections = activeFormulaRole === "dependencies" && activeDependencyGranularity === "declarations"
    ? dependencyDeclarationControlSections
    : galaxyControlSections[activeFormulaRole];
  sections.forEach((section, sectionIndex) => {
    const details = document.createElement("details");
    details.className = "formula-section";
    details.open = sectionIndex < 2;
    const summary = document.createElement("summary");
    summary.textContent = section.label;
    details.append(summary);
    const stack = document.createElement("div");
    stack.className = "formula-stack";

    for (const control of section.controls) {
      const row = document.createElement("div");
      row.className = `formula-control formula-control-${control.kind ?? "range"}`;
      const id = `formula-${activeFormulaRole}-${control.key}`;
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = control.label;
      row.append(label);
      const value = galaxyParameterValue(galaxyParameters, activeFormulaRole, control.key);

      if (control.kind === "toggle") {
        const input = document.createElement("input");
        input.id = id;
        input.type = "checkbox";
        input.checked = Boolean(value);
        input.addEventListener("change", () => setFormulaParameter(activeFormulaRole, control.key, input.checked));
        row.append(input);
      } else if (control.kind === "color") {
        const input = document.createElement("input");
        input.id = id;
        input.type = "color";
        input.value = rgbToHex(value as RGB);
        const output = document.createElement("output");
        output.htmlFor = id;
        output.textContent = input.value.toUpperCase();
        input.addEventListener("input", () => {
          output.textContent = input.value.toUpperCase();
          setFormulaParameter(activeFormulaRole, control.key, hexToRgb(input.value));
        });
        row.append(input, output);
      } else if (control.kind === "shape") {
        const select = document.createElement("select");
        select.id = id;
        for (const [shape, shapeLabel] of shapeLabels) {
          const option = document.createElement("option");
          option.value = String(shape);
          option.textContent = shapeLabel;
          select.append(option);
        }
        select.value = String(value);
        select.addEventListener("change", () => setFormulaParameter(activeFormulaRole, control.key, Number(select.value)));
        row.append(select);
      } else {
        const min = control.min ?? 0;
        const max = control.max ?? 1;
        const step = control.step ?? 0.01;
        const numericValue = Number(value);
        const output = document.createElement("output");
        output.htmlFor = id;
        output.textContent = numberText(numericValue, step);
        const inputs = document.createElement("div");
        inputs.className = "formula-inputs";
        const range = document.createElement("input");
        range.id = id;
        range.type = "range";
        range.min = String(min);
        range.max = String(max);
        range.step = String(step);
        range.value = String(numericValue);
        range.setAttribute("aria-label", `${section.label}: ${control.label}`);
        const number = document.createElement("input");
        number.type = "number";
        number.min = String(min);
        number.max = String(max);
        number.step = String(step);
        number.value = String(numericValue);
        number.setAttribute("aria-label", `${section.label}: ${control.label} numeric value`);
        const apply = (next: number): void => {
          if (!Number.isFinite(next)) return;
          const bounded = Math.max(min, Math.min(max, next));
          range.value = String(bounded);
          number.value = String(bounded);
          output.textContent = numberText(bounded, step);
          setFormulaParameter(activeFormulaRole, control.key, bounded);
        };
        range.addEventListener("input", () => apply(Number(range.value)));
        number.addEventListener("input", () => apply(Number(number.value)));
        inputs.append(range, number);
        row.append(output, inputs);
      }
      stack.append(row);
    }
    details.append(stack);
    formulaControls.append(details);
  });
}

function updateMotion(paused: boolean): void {
  const forcedOff = reducedMotion.matches;
  motionButton.disabled = forcedOff;
  motionButton.setAttribute("aria-pressed", paused || forcedOff ? "true" : "false");
  motionIcon.textContent = forcedOff ? "—" : paused ? "▶" : "Ⅱ";
  motionText.textContent = forcedOff ? "Motion off" : paused ? "Play" : "Pause";
  motionButton.title = forcedOff ? "Your reduced-motion preference keeps the sculpture still." : "";
}

function showFallback(message: string): void {
  canvas.hidden = true;
  fallback.hidden = false;
  fallbackMessage.textContent = message;
}

function showStarTooltip(hover: { readonly label: string; readonly x: number; readonly y: number } | null): void {
  canvas.dataset.hover = hover ? "true" : "false";
  if (!hover) {
    starTooltip.hidden = true;
    return;
  }
  starTooltip.textContent = hover.label;
  starTooltip.hidden = false;
  const margin = 12;
  const offset = 14;
  const left = Math.min(hover.x + offset, window.innerWidth - starTooltip.offsetWidth - margin);
  const top = Math.min(hover.y + offset, window.innerHeight - starTooltip.offsetHeight - margin);
  starTooltip.style.left = `${Math.max(margin, left)}px`;
  starTooltip.style.top = `${Math.max(margin, top)}px`;
}

function switchView(target: TargetId, style: StyleId, variant: VariantId, dependencyGranularity: DependencyGranularity, pushHistory: boolean): void {
  activeTarget = target;
  activeStyle = style;
  activeVariant = variant;
  activeDependencyGranularity = dependencyGranularity;
  renderCopy();
  scene?.setView(target, style, variant, dependencyGranularity);
  if (activeFormulaRole === "dependencies") renderFormulaControls();
  if (pushHistory) writeUrl("push");
}

({ target: activeTarget, style: activeStyle, variant: activeVariant, dependencyGranularity: activeDependencyGranularity } = viewFromUrl());
renderCopy();
writeUrl("replace");
updateMotion(reducedMotion.matches);
renderFormulaControls();

try {
  canvas.dataset.state = "loading";
  scene = new CosmosScene(canvas, activeTarget, activeStyle, activeVariant, {
    ready: () => { canvas.dataset.state = "ready"; },
    fallback: showFallback,
    pauseChanged: updateMotion,
    hoverChanged: showStarTooltip,
  }, galaxyParameters, activeDependencyGranularity);
  if (reducedMotion.matches) scene.setPaused(true);
} catch (error) {
  showFallback(error instanceof Error ? error.message : "WebGL could not start.");
}

for (const button of styleButtons) {
  button.addEventListener("click", () => {
    const style = button.dataset.style ?? null;
    if (isStyle(style) && style !== activeStyle) switchView(activeTarget, style, activeVariant, activeDependencyGranularity, true);
  });
}

for (const button of variantButtons) {
  button.addEventListener("click", () => {
    const variant = button.dataset.variant ?? null;
    if (isVariant(variant) && variant !== activeVariant) switchView(activeTarget, activeStyle, variant, activeDependencyGranularity, true);
  });
}

for (const button of targetButtons) {
  button.addEventListener("click", () => {
    const target = button.dataset.target ?? null;
    if (isTarget(target) && target !== activeTarget) switchView(target, activeStyle, activeVariant, activeDependencyGranularity, true);
  });
}

for (const button of dependencyGranularityButtons) {
  button.addEventListener("click", () => {
    const dependencyGranularity = button.dataset.dependencyGranularity ?? null;
    if (isDependencyGranularity(dependencyGranularity) && dependencyGranularity !== activeDependencyGranularity) {
      switchView(activeTarget, activeStyle, activeVariant, dependencyGranularity, true);
    }
  });
}

for (const button of formulaRoleButtons) {
  button.addEventListener("click", () => {
    const role = button.dataset.formulaRole;
    if (role === "core" || role === "tests" || role === "dependencies") {
      activeFormulaRole = role;
      renderFormulaControls();
    }
  });
}

formulaCloseButton.addEventListener("click", () => {
  formulaOpen = false;
  syncFormulaVisibility();
});
formulaOpenButton.addEventListener("click", () => {
  formulaOpen = true;
  syncFormulaVisibility();
});
formulaResetRole.addEventListener("click", () => {
  const defaults = cloneGalaxyParameters(defaultGalaxyParameters);
  galaxyParameters = { ...galaxyParameters, [activeFormulaRole]: defaults[activeFormulaRole] } as GalaxyParameters;
  renderFormulaControls();
  scheduleFormulaUpdate(activeFormulaRole);
});
formulaResetAll.addEventListener("click", () => {
  galaxyParameters = cloneGalaxyParameters(defaultGalaxyParameters);
  renderFormulaControls();
  scheduleFormulaUpdate("core");
  scheduleFormulaUpdate("tests");
  scheduleFormulaUpdate("dependencies");
});

motionButton.addEventListener("click", () => {
  if (!scene || reducedMotion.matches) return;
  scene.setPaused(!scene.isPaused());
});
element<HTMLButtonElement>("reset-view").addEventListener("click", () => {
  scene?.reset();
  canvas.focus();
});

reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches) scene?.setPaused(true);
  updateMotion(scene?.isPaused() ?? reducedMotion.matches);
});

window.addEventListener("popstate", () => {
  const view = viewFromUrl();
  switchView(view.target, view.style, view.variant, view.dependencyGranularity, false);
});
window.addEventListener("beforeunload", () => scene?.destroy());
