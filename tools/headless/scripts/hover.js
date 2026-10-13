// The look on hover: nothing when the pointer only crosses the item, the
// menu while it rests, a click to hold it.
const state = {
    mode: 'auto', holding: false, sessions: [], sensor: true,
    battery: {percent: 64, onBattery: true, watts: 9.6, remainingMs: 200 * 60000},
    lastRun: null,
    settings: {graceMinutes: 2, batteryFloor: 20, holdProcessor: true, style: 'blue'},
    choices: {graceMinutes: [1, 2, 5, 10], batteryFloor: [10, 20, 30, 40]},
    usage: {working: null, closed: null, asleep: null},
    helper: true,
};

export default async function ({indicator, shot, sleep, note, move, moveTo, click}) {
    indicator.update(state);
    const menu = indicator.menu;
    const say = step => note(`${step}: open=${menu.isOpen} peeking=${menu.peeking}`);
    const away = () => moveTo(640, 700);

    move(indicator);
    await sleep(100);
    away();
    await sleep(600);
    say('crossed');

    move(indicator);
    await sleep(900);
    say('rested');
    await shot('hover-rested');

    away();
    await sleep(600);
    say('left');

    move(indicator);
    await sleep(900);
    await click(indicator);
    await sleep(500);
    say('clicked while looking');
    away();
    await sleep(600);
    say('left after the click');

    await click(indicator);
    await sleep(900);
    say('closed by a click, pointer still there');
    away();
    await sleep(400);
    move(indicator);
    await sleep(900);
    say('rested again');
    away();
    await sleep(600);
    say('left again');
}
