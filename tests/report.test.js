import {duration, sentence} from '../daemon/lib/report.js';
import {test, equal, done} from './harness.js';

const run = more => ({startedAt: 0, endedAt: 72 * 60000, startPercent: 80, endPercent: 66.4, reason: 'opened',
    working: 0, ...more});

test('durations read like the design system asks', () => {
    equal([20000, 5 * 60000, 60 * 60000, 105 * 60000].map(duration), ['under a minute', '5 min', '1 h', '1 h 45 min']);
});

test('an opened lid reports time and battery', () => {
    equal(sentence(run({})),
        'Claude kept working until you opened the lid. The lid was closed for 1 h 12 min and used 14 % of the battery.');
});

test('a run cut short says so first', () => {
    equal(sentence(run({reason: 'battery', working: 1})).startsWith('Stopped with 1 session still working.'), true);
    equal(sentence(run({reason: 'heat', working: 2})).startsWith('Stopped with 2 sessions still working.'), true);
});

test('a machine without a battery reports the time only', () => {
    equal(sentence(run({reason: 'done', startPercent: null, endPercent: null})),
        'Claude finished, and the machine went to sleep. The lid was closed for 1 h 12 min.');
});

done('report');
