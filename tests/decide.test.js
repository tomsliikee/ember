import {decide, WAIT_MS, PAUSE_AT, RESUME_AT, SLEEP_AT} from '../daemon/lib/decide.js';
import {test, equal, done} from './harness.js';

const GRACE = 120000;
const base = {mode: 'auto', armed: false, lidClosed: false, working: 0, waitingSince: null, lastBusyAt: null,
    holding: false, paused: false, battery: {percent: 80, onBattery: true}, temperature: 50, graceMs: GRACE,
    floor: 20, now: 1000000};
const ask = more => decide({...base, ...more});
const pick = (result, ...keys) => keys.map(key => result[key]);

test('nothing to do, nothing held', () => {
    equal(pick(ask({}), 'hold', 'saving', 'sleep'), [false, false, null]);
});

test('work is held with the lid open, so it stands before the lid closes', () => {
    equal(pick(ask({working: 1}), 'hold', 'saving', 'lastBusyAt'), [true, false, base.now]);
});

test('work under a closed lid saves', () => {
    equal(pick(ask({working: 2, lidClosed: true, holding: true}), 'hold', 'saving', 'pause', 'sleep'),
        [true, true, false, null]);
});

test('off never holds, whatever works', () => {
    equal(pick(ask({mode: 'off', working: 3, lidClosed: true}), 'hold', 'saving', 'sleep'), [false, false, null]);
});

test('armed holds without any work, in any mode', () => {
    equal(pick(ask({mode: 'off', armed: true, lidClosed: true, holding: true}), 'hold', 'saving', 'sleep'),
        [true, true, null]);
});

test('the grace period keeps the machine awake after the work', () => {
    const result = ask({lidClosed: true, holding: true, lastBusyAt: base.now - GRACE + 1});
    equal(pick(result, 'hold', 'saving', 'sleep'), [true, true, null]);
});

test('after the grace period the machine sleeps', () => {
    equal(pick(ask({lidClosed: true, holding: true, lastBusyAt: base.now - GRACE}), 'hold', 'saving', 'sleep'),
        [false, false, 'done']);
});

test('a closed lid that was never held is left to the system', () => {
    equal(ask({lidClosed: true}).sleep, null);
});

test('a waiting session keeps the machine awake for a while', () => {
    equal(pick(ask({lidClosed: true, holding: true, waitingSince: base.now - WAIT_MS + 1}), 'hold', 'sleep'),
        [true, null]);
});

test('a session that waited too long counts as finished after the grace period', () => {
    const waited = {lidClosed: true, holding: true, waitingSince: base.now - WAIT_MS - GRACE};
    equal(pick(ask({...waited, lastBusyAt: base.now - GRACE}), 'hold', 'sleep'), [false, 'waiting']);
});

test('the battery floor ends the work on battery only', () => {
    const low = {working: 1, lidClosed: true, holding: true};
    equal(pick(ask({...low, battery: {percent: 20, onBattery: true}}), 'hold', 'sleep'), [false, 'battery']);
    equal(ask({...low, battery: {percent: 20, onBattery: false}}).sleep, null);
    equal(ask({...low, battery: {percent: null, onBattery: true}}).sleep, null);
});

test('the battery floor holds for an armed lid too', () => {
    equal(ask({armed: true, lidClosed: true, battery: {percent: 5, onBattery: true}}).sleep, 'battery');
});

test('heat pauses the sessions and lets go again only once cool', () => {
    const closed = {working: 1, lidClosed: true, holding: true};
    equal(ask({...closed, temperature: PAUSE_AT - 1}).pause, false);
    equal(ask({...closed, temperature: PAUSE_AT}).pause, true);
    equal(ask({...closed, temperature: RESUME_AT + 1, paused: true}).pause, true);
    equal(ask({...closed, temperature: RESUME_AT, paused: true}).pause, false);
});

test('too much heat puts the machine to sleep', () => {
    equal(pick(ask({working: 1, lidClosed: true, holding: true, temperature: SLEEP_AT}), 'hold', 'sleep'),
        [false, 'heat']);
});

test('without a temperature nothing is held, not even armed', () => {
    equal(pick(ask({working: 1, temperature: null}), 'hold', 'saving'), [false, false]);
    equal(pick(ask({armed: true, lidClosed: true, temperature: null}), 'hold', 'saving', 'sleep'),
        [false, false, null]);
});

test('a temperature that is lost under a closed lid ends the run', () => {
    equal(pick(ask({working: 1, lidClosed: true, holding: true, temperature: null}), 'hold', 'sleep'),
        [false, 'done']);
});

test('heat does not matter while the lid is open', () => {
    equal(pick(ask({working: 1, temperature: SLEEP_AT}), 'pause', 'sleep'), [false, null]);
});

done('decide');
