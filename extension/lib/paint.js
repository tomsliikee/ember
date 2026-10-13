// Shared helpers for the Cairo-drawn marks.

import {colors} from './tokens.js';

const TONE_COLOR = {
    primary: 'primary',
    warn: 'status-warn',
    bad: 'status-bad',
};

export function toneColor(theme, tone) {
    return colors[theme][TONE_COLOR[tone]];
}

export function setSource(cr, hex, alpha = 1) {
    const value = Number.parseInt(hex.slice(1), 16);
    cr.setSourceRGBA(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, alpha);
}

export function fraction(percent) {
    if (percent === null || percent === undefined)
        return 0;
    return Math.min(1, Math.max(0, percent / 100));
}
