import {apply, status, summarise, QUIET_MS} from '../daemon/lib/sessions.js';
import {test, equal, done} from './harness.js';

const event = (kind, at, more = {}) => ({session: 'a', kind, at, cwd: '/home/t/git/ember', transcript: '/t',
    unit: 'tab.scope', desktop: false, ...more});
const alive = {alive: true, transcriptAt: null, cpuShare: 0};
const run = (...events) => events.reduce(apply, {});

test('a prompt starts a working session', () => {
    const {a} = run(event('work', 1000));
    equal([a.state, a.since, a.lastEventAt], ['working', 1000, 1000]);
});

test('later work keeps the start', () => {
    const {a} = run(event('work', 1000), event('work', 5000));
    equal([a.since, a.lastEventAt], [1000, 5000]);
});

test('a notice makes a working session wait', () => {
    equal(run(event('work', 1000), event('wait', 2000)).a.state, 'waiting');
});

test('a notice leaves a finished session finished', () => {
    equal(run(event('work', 1000), event('stop', 2000), event('wait', 60000)).a.state, 'done');
});

test('an answer puts a waiting session back to work', () => {
    equal(run(event('work', 1000), event('wait', 2000), event('work', 3000)).a.state, 'working');
});

test('the end removes the session', () => {
    equal(run(event('work', 1000), event('end', 2000)), {});
});

test('a stop without a start is nothing', () => {
    equal(run(event('stop', 1000)), {});
});

test('a session whose unit is gone is gone', () => {
    equal(status(run(event('work', 0)).a, {...alive, alive: false}, 1), 'gone');
});

test('a working session stays so while it gives signs of life', () => {
    const {a} = run(event('work', 0));
    equal(status(a, alive, QUIET_MS - 1), 'working');
    equal(status(a, {...alive, transcriptAt: QUIET_MS}, QUIET_MS + 5), 'working');
});

test('a silent session at rest is finished', () => {
    equal(status(run(event('work', 0)).a, alive, QUIET_MS), 'idle');
});

test('a silent session that uses the processor still works', () => {
    equal(status(run(event('work', 0)).a, {...alive, cpuShare: 0.6}, QUIET_MS), 'working');
});

test('an unknown load is not taken for rest', () => {
    equal(status(run(event('work', 0)).a, {...alive, cpuShare: null}, QUIET_MS), 'working');
});

test('a silent desktop session is finished, whatever its unit uses', () => {
    const {a} = run(event('work', 0, {desktop: true}));
    equal(status(a, {...alive, cpuShare: 0.5}, QUIET_MS), 'idle');
    equal(status(a, alive, QUIET_MS - 1), 'working');
});

test('a finished session with a busy unit works in the background', () => {
    const {a} = run(event('work', 0), event('stop', 10));
    equal(status(a, {...alive, cpuShare: 0.5}, 20), 'working');
    equal(status(a, {...alive, cpuShare: 0.05}, 20), 'idle');
});

test('the summary counts work and names the project', () => {
    const instances = run(event('work', 1000), event('work', 2000, {session: 'b', cwd: '/x/tally'}),
        event('stop', 3000, {session: 'b'}));
    const summary = summarise(instances, () => alive, 4000);
    equal([summary.working, summary.waitingSince, summary.list.map(e => e.project), Object.keys(summary.instances)],
        [1, null, ['ember'], ['a', 'b']]);
});

test('the summary drops what is gone', () => {
    const summary = summarise(run(event('work', 1000)), () => ({...alive, alive: false}), 2000);
    equal([summary.working, summary.instances], [0, {}]);
});

test('the latest question sets the wait', () => {
    const instances = run(event('work', 1), event('wait', 2000),
        event('work', 1, {session: 'b'}), event('wait', 5000, {session: 'b'}));
    equal(summarise(instances, () => alive, 6000).waitingSince, 5000);
});

done('sessions');
