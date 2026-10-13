import * as Format from '../extension/lib/format.js';
import {test, equal, done} from './harness.js';

const battery = more => ({percent: 60, onBattery: true, watts: 9.64, remainingMs: 80 * 60000, ...more});
const state = more => ({mode: 'auto', holding: false, sessions: [], sensor: true, ...more});
const working = {project: 'ember', state: 'working', since: 0};
const waiting = {project: 'tally', state: 'waiting', since: 0};

test('watts keep one decimal below ten', () => {
    equal([9.64, 12.4, null].map(Format.watts), ['9.6 W', '12 W', '–']);
});

test('averages show small draws too', () => {
    equal([12.4, 5.64, 0.437, null].map(Format.average), ['12 W', '5.6 W', '0.44 W', '–']);
});

test('durations', () => {
    equal([10000, 5 * 60000, 60 * 60000, 105 * 60000].map(Format.duration),
        ['under 1 min', '5 min', '1 h', '1 h 45 min']);
});

test('the caption says where the power goes', () => {
    equal([battery({}), battery({onBattery: false}), battery({onBattery: false, watts: null})].map(Format.powerCaption),
        ['drawn from the battery now', 'going into the battery now', 'on mains power']);
    equal(Format.powerCaption(null), 'not known without the service');
});

test('time left is only said on battery', () => {
    equal([battery({}), battery({onBattery: false}), battery({remainingMs: null})].map(Format.remaining),
        ['About 1 h 20 min left', '', '']);
});

test('the lid sentence follows mode and work', () => {
    equal([
        state({mode: 'now'}),
        state({mode: 'off', sessions: [working]}),
        state({sessions: [working], holding: true}),
        state({sessions: [working, working, waiting], holding: true}),
        state({sessions: [waiting], holding: true}),
        state({holding: true}),
        state({}),
    ].map(Format.lidSentence), [
        'Stays awake until you open it again.',
        'Goes to sleep, as always.',
        'Stays awake: 1 session is working.',
        'Stays awake: 2 sessions are working.',
        'Stays awake a while: 1 session waits for you.',
        'Stays awake a moment longer, in case the work goes on.',
        'Goes to sleep: nothing is working.',
    ]);
});

test('without a sensor the lid sentence says why nothing is held', () => {
    equal([state({sensor: false, sessions: [working]}), state({sensor: false, mode: 'now'}),
        state({sensor: false, mode: 'off'})].map(Format.lidSentence),
    ['Goes to sleep: no temperature sensor found.', 'Goes to sleep: no temperature sensor found.',
        'Goes to sleep, as always.']);
});

test('a session says what it does', () => {
    equal([Format.sessionLine(working, 12 * 60000), Format.sessionLine({...working, since: null}, 0),
        Format.sessionLine(waiting, 0)], ['Working for 12 min', 'Working', 'Waits for you']);
});

test('a run says what it used', () => {
    equal([Format.runUsed({startPercent: 80, endPercent: 66}), Format.runUsed({startPercent: null, endPercent: 66})],
        [14, null]);
});

done('format');
