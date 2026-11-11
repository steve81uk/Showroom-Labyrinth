export function updateHUD(el, state) {
  el.innerHTML = `
    <div><strong>${state.hud.objective}</strong></div>
    <div>${state.hud.readout}</div>
    <div style="color:#e7b866">${state.hud.warning}</div>
    <div style="opacity:.65">${state.cameraMode} · ${state.pose}</div>
  `;
}
