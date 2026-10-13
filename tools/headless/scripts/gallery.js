// The menu in each of its states, dark and light.
const MIN = 60000;

const base = () => ({
    mode: 'auto', holding: false, sessions: [],
    battery: {percent: 64, onBattery: true, watts: 9.6, remainingMs: 200 * MIN},
    lastRun: null,
    settings: {graceMinutes: 2, batteryFloor: 20, holdProcessor: true, style: 'blue'},
    choices: {graceMinutes: [1, 2, 5, 10], batteryFloor: [10, 20, 30, 40]},
    usage: {working: 9.8, closed: 5.1, asleep: 0.44},
    helper: true, sensor: true,
});
const run = {startedAt: 0, endedAt: 72 * MIN, startPercent: 80, endPercent: 66, reason: 'done', working: 0};

export default async function ({extension, indicator, shot, sleep, note, desktop, click}) {
    const chosen = [];
    extension._client.setMode = mode => chosen.push(mode);
    extension._client.setSetting = (name, value) => chosen.push(`${name}=${value}`);

    const show = async (name, state) => {
        indicator.update(state);
        indicator.menu.open();
        await sleep(700);
        await shot(name);
    };
    const now = Date.now();
    const busy = {...base(), holding: true, lastRun: run, sessions: [
        {project: 'ember', state: 'working', since: now - 12 * MIN},
        {project: 'tally', state: 'working', since: now - 3 * MIN},
        {project: 'Claude desktop', state: 'waiting', since: now - MIN},
    ]};

    await show('01-no-service', null);
    await show('02-idle', base());
    await show('03-working', busy);
    await show('04-now', {...busy, mode: 'now', sessions: [busy.sessions[0]]});
    await show('05-off-mains', {...base(), mode: 'off', lastRun: {...run, reason: 'battery', working: 1},
        battery: {percent: 100, onBattery: false, watts: null, remainingMs: null}});

    await show('06-no-sensor', {...busy, sensor: false});
    for (const style of ['violet', 'orange']) {
        await show(`07-dark-${style}`, {...busy, settings: {...busy.settings, style}});
    }

    await show('08-before-settings', busy);
    await click(indicator._popup._overflow);
    await sleep(600);
    await shot('09-settings');
    await click(indicator._popup._holdButton);
    await sleep(300);
    indicator.update({...busy, helper: false});
    await sleep(500);
    await shot('10-settings-no-helper');
    note(`chosen by clicks: ${JSON.stringify(chosen)}`);

    desktop.set_string('color-scheme', 'default');
    await sleep(500);
    indicator.update({...busy, settings: {...busy.settings, style: 'orange'}});
    await sleep(500);
    await shot('11-light-settings');
    await click(indicator._popup._overflow);
    await sleep(600);
    for (const style of ['orange', 'green', 'pink']) {
        await show(`12-light-${style}`, {...busy, settings: {...busy.settings, style}});
    }
    indicator.menu.close();
    await sleep(500);
    await shot('13-closed');
}
