// What the service did, for the journal. In a dry run nothing is changed,
// and the same lines say what would have been.

let dry = false;

export function setDryRun(value) {
    dry = value;
}

export function note(message) {
    print(`ember: ${message}`);
}

// Carries out one change to the system, unless this is a dry run. A change
// that fails is noted and the rest goes on: one missing device must not
// keep the others from being set or restored.
export function act(description, change) {
    note(dry ? `would ${description}` : description);
    if (dry)
        return null;
    try {
        return change() ?? null;
    } catch (e) {
        note(`failed to ${description}: ${e.message}`);
        return null;
    }
}
