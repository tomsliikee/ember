import {parseState} from '../extension/lib/state.js';
import {test, equal, done} from './harness.js';

const FULL = {
    mode: 'auto', lidClosed: false, holding: true, saving: false, paused: false,
    sessions: [{project: 'ember', state: 'working', since: 5}, {project: 'x', state: 'idle', since: 1}],
    battery: {percent: 61.5, onBattery: true, watts: 9.6, remainingMs: 3600000},
    lastRun: {startedAt: 1, endedAt: 2, startPercent: 80, endPercent: 70, reason: 'done', working: 0},
    settings: {mode: 'auto', graceMinutes: 2, batteryFloor: 20, holdProcessor: true, style: 'blue'},
    choices: {graceMinutes: [1, 2, 5, 10], batteryFloor: [10, 20, 30, 40]},
    usage: {working: 9.8, closed: 5.1, asleep: null},
    helper: true,
};

test('what the service writes is read whole', () => {
    const state = parseState(JSON.stringify(FULL));
    equal([state.mode, state.holding, state.sessions, state.battery.watts, state.lastRun.reason,
        state.settings.graceMinutes, state.choices.batteryFloor, state.helper],
    ['auto', true, [{project: 'ember', state: 'working', since: 5}], 9.6, 'done', 2, [10, 20, 30, 40], true]);
});

test('the averages come through, and missing ones are null', () => {
    equal(parseState(JSON.stringify(FULL)).usage, {working: 9.8, closed: 5.1, asleep: null});
    equal(parseState('{"mode":"off"}').usage, {working: null, closed: null, asleep: null});
});

test('anything else is no state', () => {
    equal([parseState(''), parseState('[]'), parseState('{"mode":"loud"}')], [null, null, null]);
});

test('missing parts become empty ones', () => {
    const state = parseState('{"mode":"off"}');
    equal([state.sessions, state.battery, state.lastRun, state.choices],
        [[], {percent: null, onBattery: false, watts: null, remainingMs: null}, null,
            {graceMinutes: [], batteryFloor: []}]);
});

test('a run with an unknown ending is dropped', () => {
    equal(parseState(JSON.stringify({...FULL, lastRun: {...FULL.lastRun, reason: 'magic'}})).lastRun, null);
});

done('state');
