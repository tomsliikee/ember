// The one place that decides what Ember does. It only looks at what it is
// given and answers; the service carries the answer out.

// A session that waits for an answer keeps the machine awake this long, so
// the answer can still come from another device.
export const WAIT_MS = 10 * 60 * 1000;
// Above the first the sessions are paused until the machine is back below
// the second; at the third it goes to sleep whatever is running.
export const PAUSE_AT = 85;
export const RESUME_AT = 70;
export const SLEEP_AT = 95;

// input:
//   mode          "off" or "auto"
//   armed         "Now" was chosen and the lid has not been opened since
//   lidClosed
//   working       sessions at work
//   waitingSince  when the latest waiting session asked, or null
//   lastBusyAt    when a session last worked or waited, or null
//   holding       the lid is being kept from putting the machine to sleep
//   paused        the sessions are paused for heat
//   battery       {percent, onBattery}, percent null when unknown
//   temperature   degrees Celsius, or null when it cannot be read
//   graceMs, floor
//
// Returns:
//   hold        keep the lid from putting the machine to sleep
//   saving      the closed-lid state: locked, dark, everything else at rest
//   pause       pause the sessions themselves
//   sleep       null, or why the machine goes to sleep now:
//               "done", "waiting", "battery" or "heat"
//   lastBusyAt  to be handed back in at the next call
export function decide(input) {
    const {mode, armed, lidClosed, working, waitingSince, now} = input;
    const waiting = waitingSince !== null && now - waitingSince < WAIT_MS;
    const busy = working > 0 || waiting;
    const lastBusyAt = busy ? now : input.lastBusyAt;
    // The next step of a task may start a moment after the last one ended.
    const lingering = lastBusyAt !== null && now - lastBusyAt < input.graceMs;
    // A closed lid keeps the heat in; without a reading of it nothing is held.
    const blind = input.temperature === null;
    const wanted = !blind && (armed || (mode === 'auto' && (busy || lingering)));
    const awake = {hold: wanted, saving: false, pause: false, sleep: null, lastBusyAt};

    if (!lidClosed)
        return awake;
    if (!wanted) {
        // With nothing held the lid has already put the machine to sleep.
        const sleep = input.holding ? waitingSince !== null && working === 0 ? 'waiting' : 'done' : null;
        return {...awake, sleep};
    }

    const {percent, onBattery} = input.battery;
    if (onBattery && percent !== null && percent <= input.floor)
        return {...awake, hold: false, sleep: 'battery'};
    const {temperature} = input;
    if (temperature >= SLEEP_AT)
        return {...awake, hold: false, sleep: 'heat'};

    const pause = input.paused ? temperature > RESUME_AT : temperature >= PAUSE_AT;
    return {...awake, saving: true, pause};
}
