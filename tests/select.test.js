import {chooseFrozen} from '../daemon/lib/select.js';
import {test, equal, done} from './harness.js';

const UNITS = [
    'app-com.anthropic.Claude-4522.scope',
    'app-gnome-com.anthropic.Claude-4522.scope',
    'app-gnome-ptyxis-3986.scope',
    'ptyxis-spawn-claude.scope',
    'ptyxis-spawn-other.scope',
    'app-gnome-firefox-900.scope',
    'app-flatpak-com.spotify.Client-12.scope',
    'podman-pause-1bfc67d9.scope',
    'init.scope',
    'evolution-calendar-factory.service',
    'gnome-software.service',
    'localsearch-3.service',
    'org.gnome.Shell@user.service',
    'pipewire.service',
    'gcr-ssh-agent.service',
    'dbus-broker.service',
    'ember.service',
];
const CLAUDE = ['app-com.anthropic.Claude-4522.scope', 'app-gnome-com.anthropic.Claude-4522.scope',
    'ptyxis-spawn-claude.scope'];

test('everything but Claude, its terminal and the session itself rests', () => {
    equal(chooseFrozen(UNITS, CLAUDE), [
        'ptyxis-spawn-other.scope',
        'app-gnome-firefox-900.scope',
        'app-flatpak-com.spotify.Client-12.scope',
        'evolution-calendar-factory.service',
        'gnome-software.service',
        'localsearch-3.service',
    ]);
});

test('without Claude its units rest like any other app', () => {
    const frozen = chooseFrozen(UNITS, []);
    equal(frozen.includes('app-com.anthropic.Claude-4522.scope'), true);
    equal(frozen.includes('app-gnome-ptyxis-3986.scope'), false);
});

done('select');
