// Chooses which of the user's units rest while the lid is closed. Only the
// names decide, so the choice can be tested without a running session.

// Programs the user opened, and the tabs of a terminal.
const APPS = [/^app-.*\.(scope|service)$/, /-spawn-.*\.scope$/, /^flatpak-.*\.scope$/, /^snap\..*\.scope$/];
// Services of the session that only serve someone looking at the screen.
const BACKGROUND = [/^evolution-.*\.service$/, /^gnome-software\.service$/, /^localsearch-.*\.service$/,
    /^tracker-.*\.service$/];
// A terminal holds the other end of a session's output; frozen, it would
// stall the session as soon as that fills up.
const TERMINALS = /ptyxis|gnome-terminal|kgx|console|kitty|alacritty|foot|wezterm|ghostty|konsole|tmux|zellij/i;
const NEVER = [/^podman-/, /^libpod-/, /ember/i];

const matches = (patterns, name) => patterns.some(pattern => pattern.test(name));

// units are the names of the running units; claude names those that hold a
// Claude process, which keep running with everything they started.
export function chooseFrozen(units, claude) {
    const keep = new Set(claude);
    return units.filter(name => {
        if (keep.has(name) || matches(NEVER, name))
            return false;
        if (matches(BACKGROUND, name))
            return true;
        if (!matches(APPS, name))
            return false;
        // The tab of a terminal is an app like any other; the terminal itself stays.
        const tab = /-spawn-.*\.scope$/.test(name);
        return tab || !TERMINALS.test(name);
    });
}
