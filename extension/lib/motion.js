// One way to animate a drawn value. Nothing moves when the desktop has
// animations switched off.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

export const STATE_MS = 200;
export const LAYOUT_MS = 320;
export const WAVE_MS = 1200;

// Calls onProgress with 0–1 and returns the running timeline, or null when
// the value was set at once.
export function animate(actor, duration, onProgress, {loop = false} = {}) {
    if (!St.Settings.get().enable_animations) {
        onProgress(loop ? 0 : 1);
        return null;
    }
    const timeline = new Clutter.Timeline({actor, duration, repeat_count: loop ? -1 : 0});
    if (!loop)
        timeline.set_progress_mode(Clutter.AnimationMode.EASE_OUT_CUBIC);
    timeline.connect('new-frame', () => onProgress(timeline.get_progress()));
    if (!loop)
        timeline.connect('completed', () => onProgress(1));
    timeline.start();
    return timeline;
}
