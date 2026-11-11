import json
from pathlib import Path
import sys

CAMERAS = {'MAP', 'SCAN', 'LOCK', 'FPV', 'CHASE', 'SCROLL', 'CHASE_FAST', 'CHASE_LOW', 'CLOSE', 'TOP_TIGHT', 'MAP_ORBIT', 'EXT'}

def validate(data):
    errors = []
    if data.get('units') != 'milliseconds':
        errors.append('units must be milliseconds')
    if data.get('columns') != ['startMs', 'camera', 'pose', 'action']:
        errors.append('unexpected row columns')
    rows = data.get('shots', [])
    previous = -1
    for i, row in enumerate(rows):
        if not isinstance(row, list) or len(row) != 4:
            errors.append(f'row {i + 1}: expected four values')
            continue
        start, camera, pose, action = row
        if type(start) is not int or start <= previous:
            errors.append(f'row {i + 1}: start must be a strictly increasing integer')
        else:
            previous = start
        if camera not in CAMERAS:
            errors.append(f'row {i + 1}: unknown camera')
        if not isinstance(pose, str) or not pose:
            errors.append(f'row {i + 1}: missing pose')
        if not isinstance(action, str) or not action:
            errors.append(f'row {i + 1}: missing action')
    if not rows or rows[0][0] != 0:
        errors.append('timeline must start at zero')
    terminal = data.get('terminalEvent', {})
    end = terminal.get('timeMs')
    if type(end) is not int or end <= previous:
        errors.append('terminal event must follow the last shot')
    if terminal.get('camera') != 'BLACK':
        errors.append('terminal event must be BLACK')
    if data.get('audioDurationMs') is not None and type(end) is int and end > data['audioDurationMs']:
        errors.append('terminal event exceeds audio duration')
    return errors

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'shots/showroom_labyrinth_shots.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    errors = validate(data)
    report = {'valid': not errors, 'errors': errors, 'shotIntervals': len(data.get('shots', [])), 'terminalEventMs': data.get('terminalEvent', {}).get('timeMs'), 'audioVerified': False, 'assetVerification': 'not performed'}
    print(json.dumps(report, indent=2))
    sys.exit(1 if errors else 0)
