export function evaluateShotState(timeMs, timeline) {
  const rows = timeline.shots;
  let active = null;
  for (const row of rows) {
    if (timeMs >= row[0]) active = row;
    else break;
  }
  const terminal = timeline.terminalEvent;
  const isTerminal = timeMs >= terminal.timeMs;
  const shot = isTerminal ? terminal : active;
  const [startMs, camera, pose, action] = shot;
  return {
    timeMs,
    shotId: `S${String(rows.indexOf(active) + 1).padStart(3, '0')}`,
    cameraMode: camera,
    pose,
    action,
    startMs,
    isTerminal,
    hud: deriveHUD(camera, action, timeMs),
    postProcess: derivePostProcess(camera, action)
  };
}

function deriveHUD(camera, action, timeMs) {
  const hud = { objective: 'BUY 1 SHELF', readout: '', warning: '' };
  if (action.includes('MAP CHECKIN 1')) hud.readout = 'DISTANCE TO EXIT: 412m';
  if (action.includes('MAP CHECKIN 2')) hud.readout = 'FOUR POSTER AIRBORNE';
  if (action.includes('MAP CHECKIN 3')) hud.readout = 'MINO7000 DETECTED';
  if (action.includes('MAP CHECKIN 4')) hud.readout = 'WINDOW DETECTED';
  if (action.includes('MAP CHECKIN 5')) hud.readout = 'STORE IS MAZE';
  if (action.includes('CHORUS SNAP')) hud.objective = 'ESCAPE';
  if (action.includes('FINAL CHORUS')) hud.objective = 'FIND OWN ROOM';
  if (action.includes('PERMANENT ASSISTANT')) hud.warning = 'PERMANENT ASSISTANT TO THE SHELVING';
  return hud;
}

function derivePostProcess(camera, action) {
  return {
    bloom: action.includes('CHORUS SNAP') ? 1.8 : 0.6,
    vignette: action.includes('BREAK2') ? 0.6 : 0.3,
    grain: 0.08
  };
}
