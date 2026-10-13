import {formatRow, isDue, parseRows, prune, summarise, HEADER, KEEP_MS} from '../daemon/lib/usage.js';
import {test, equal, done} from './harness.js';

const MIN = 60000;
const row = (minute, state, wh, more = {}) => ({at: minute * MIN, state, working: 1, onBattery: true, percent: 50,
    wh, watts: 9.5, celsius: 48, ...more});
const watts = rows => Object.fromEntries(Object.entries(summarise(rows)).map(([kind, {watts: w}]) =>
    [kind, w === null ? null : Math.round(w * 100) / 100]));

test('a closed lid is sampled every minute, an open one every five', () => {
    equal([isDue(0, 59999, true), isDue(0, 60000, true), isDue(0, 4 * MIN, false), isDue(0, 5 * MIN, false)],
        [false, true, false, true]);
});

test('a sample is one line, and comes back the same', () => {
    const sample = row(1, 'closed', 20.1234, {watts: 5.678, celsius: 47.6, percent: 49.6});
    equal(formatRow(sample), '60,closed,1,1,50,20.123,5.68,48');
    equal(parseRows(`${HEADER}\n${formatRow(sample)}\n`),
        [{at: 60000, state: 'closed', working: 1, onBattery: true, percent: 50, wh: 20.123, watts: 5.68, celsius: 48}]);
});

test('what the machine does not say stays empty', () => {
    const line = formatRow(row(1, 'open', null, {percent: null, watts: null, celsius: null, onBattery: false}));
    equal(line, '60,open,1,0,,,,');
    equal(parseRows(line)[0].wh, null);
});

test('lines that are not samples are skipped', () => {
    equal(parseRows('time,state\n\nx,open,1\n60,flying,1,1,,,,\n').length, 0);
});

test('old samples are dropped', () => {
    equal(prune([row(0, 'open', 20), row(10, 'open', 19)], KEEP_MS + 5 * MIN).length, 1);
});

test('each kind of time gets the energy that went in it', () => {
    equal(watts([
        row(0, 'open', 30), row(5, 'open', 29.2), row(10, 'open', 28.4),
        row(10, 'closed', 28.4), row(11, 'closed', 28.3), row(12, 'closed', 28.2), row(20, 'closed', 27.4),
        row(20, 'sleep', 27.4), row(260, 'wake', 25.4),
    ]), {working: 9.6, closed: 6, asleep: 0.5});
});

test('an open lid with nobody working is not compared', () => {
    equal(watts([row(0, 'open', 30, {working: 0}), row(5, 'open', 29, {working: 0})]).working, null);
});

test('time on mains is left out', () => {
    equal(watts([row(0, 'closed', 30, {onBattery: false}), row(10, 'closed', 29)]).closed, null);
    equal(watts([row(0, 'closed', 29), row(10, 'closed', 30)]).closed, null);
});

test('a gap in the samples is not counted', () => {
    equal(watts([row(0, 'closed', 30), row(60, 'closed', 20)]).closed, null);
});

test('a sample taken on waking, before the waking is noted, does not hide the sleep', () => {
    equal(watts([row(0, 'sleep', 30), row(240, 'open', 28), row(240, 'wake', 28), row(240, 'open', 28)]).asleep, 0.5);
});

test('a sleep is not measured across the next one', () => {
    equal(watts([row(0, 'sleep', 30), row(10, 'sleep', 29.9), row(250, 'wake', 27.9)]).asleep, 0.5);
});

test('a sleep without a waking is not counted', () => {
    equal(watts([row(0, 'sleep', 30), row(300, 'open', 28)]).asleep, null);
});

test('too little time gives no average', () => {
    equal(watts([row(0, 'closed', 30), row(2, 'closed', 29.8)]).closed, null);
});

done('usage');
