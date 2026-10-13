// Ember's mark in the top bar: a ring with a core. The core says what the
// lid will do: none while Ember is off, small while it watches, larger
// while it holds the lid, and the whole ring for "Now".

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {LAYOUT_MS, animate} from './motion.js';

const SIZE = 16;
const STROKE = 1.5;
const WATCHING = 0.3;
const HOLDING = 0.6;

// The share of the ring the core fills.
export function coreFor(state) {
    if (!state || state.mode === 'off')
        return 0;
    if (state.mode === 'now')
        return 1;
    return state.holding ? HOLDING : WATCHING;
}

export const Mark = GObject.registerClass({GTypeName: 'EmberMark'},
class Mark extends St.DrawingArea {
    _init() {
        super._init({width: SIZE, height: SIZE, y_align: Clutter.ActorAlign.CENTER});
        this._core = 0;
        this._tween = null;
        this.connect('repaint', () => this._draw());
        this.connect('destroy', () => this._tween?.stop());
    }

    set(core) {
        const from = this._core;
        if (core === from)
            return;
        this._tween?.stop();
        this._tween = animate(this, LAYOUT_MS, progress => {
            this._core = from + (core - from) * progress;
            this.queue_repaint();
        });
    }

    _draw() {
        const cr = this.get_context();
        const [width, height] = this.get_surface_size();
        // Drawn in the top bar's own text colour, like its other icons.
        const color = this.get_theme_node().get_foreground_color();
        cr.setSourceRGBA(color.red / 255, color.green / 255, color.blue / 255, color.alpha / 255);
        const radius = (Math.min(width, height) - STROKE) / 2;
        cr.setLineWidth(STROKE);
        cr.arc(width / 2, height / 2, radius, 0, 2 * Math.PI);
        cr.stroke();
        if (this._core > 0) {
            cr.arc(width / 2, height / 2, (radius + STROKE / 2) * this._core, 0, 2 * Math.PI);
            cr.fill();
        }
        cr.$dispose();
    }
});
