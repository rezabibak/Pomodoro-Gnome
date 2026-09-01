import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const SessionType = {
    WORK: 'work',
    SHORT_BREAK: 'short_break',
    LONG_BREAK: 'long_break',
};

function formatTime(totalSeconds) {
    const m = Math.max(0, Math.floor(totalSeconds / 60));
    const s = Math.max(0, totalSeconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function iconFor(type) {
    switch (type) {
    case SessionType.SHORT_BREAK: return '☕';
    case SessionType.LONG_BREAK: return '🌤️';
    default: return '🍅';
    }
}

function labelFor(type) {
    switch (type) {
    case SessionType.SHORT_BREAK: return _('SHORT BREAK');
    case SessionType.LONG_BREAK: return _('LONG BREAK');
    default: return _('FOCUS TIME');
    }
}

// Never ellipsize/wrap our labels — some Shell builds under-measure a
// label's natural width (e.g. when letter-spacing is involved), which
// clips the text instead of showing it in full.
function fitLabel(label) {
    label.clutter_text.set_line_wrap(false);
    label.clutter_text.set_ellipsize(0 /* Pango.EllipsizeMode.NONE */);
    return label;
}

const PomodoroIndicator = GObject.registerClass(
class PomodoroIndicator extends PanelMenu.Button {
    _init(extension) {
        super._init(0.5, 'Pomodoro Sky');

        this._extension = extension;
        this._settings = extension.getSettings();

        this._sessionType = SessionType.WORK;
        this._completedInCycle = 0;
        this._running = false;
        this._timeoutId = null;

        this._total = this._durationFor(this._sessionType);
        this._remaining = this._total;

        this._panelBarWidth = 26;
        this._bigBarWidth = 220;

        this._buildPanelUI();
        this._buildMenuUI();
        this._buildSettingsUI();
        this._assembleMenu();
        this._updateAll();

        this.menu.connect('open-state-changed', (menu, open) => {
            if (!open)
                this._showTimerView();
        });

        this._settingsChangedId = this._settings.connect('changed', () => this._onSettingsChanged());
    }

    // ---------------------------------------------------------------- data

    _durationFor(type) {
        const s = this._settings;
        switch (type) {
        case SessionType.SHORT_BREAK: return s.get_int('short-break-minutes') * 60;
        case SessionType.LONG_BREAK: return s.get_int('long-break-minutes') * 60;
        default: return s.get_int('work-minutes') * 60;
        }
    }

    _progressRatio() {
        if (this._total <= 0)
            return 0;
        return Math.min(1, Math.max(0, (this._total - this._remaining) / this._total));
    }

    // -------------------------------------------------------------- panel

    _buildPanelUI() {
        this._panelBox = new St.BoxLayout({
            style_class: 'pomodoro-panel-box',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._panelIcon = fitLabel(new St.Label({
            style_class: 'pomodoro-panel-icon',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        const panelBar = this._createProgressBar(this._panelBarWidth, 4, 'pomodoro-panel-track', 'pomodoro-panel-fill');
        this._panelFill = panelBar.fill;
        panelBar.container.y_align = Clutter.ActorAlign.CENTER;

        this._panelLabel = fitLabel(new St.Label({
            style_class: 'pomodoro-panel-label',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this._panelBox.add_child(this._panelIcon);
        this._panelBox.add_child(panelBar.container);
        this._panelBox.add_child(this._panelLabel);
        this.add_child(this._panelBox);
    }

    // --------------------------------------------------------------- menu

    _buildMenuUI() {
        this._menuRoot = new St.BoxLayout({
            style_class: 'pomodoro-menu-root',
            vertical: true,
        });

        // Header
        const header = new St.BoxLayout({ style_class: 'pomodoro-header-row' });
        const title = fitLabel(new St.Label({ text: _('Pomodoro Sky'), style_class: 'pomodoro-title', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));
        this._sessionPill = fitLabel(new St.Label({ style_class: 'pomodoro-session-pill', y_align: Clutter.ActorAlign.CENTER }));
        header.add_child(title);
        header.add_child(this._sessionPill);
        this._menuRoot.add_child(header);

        // Big time display
        const timeStack = new St.BoxLayout({
            vertical: true,
            style_class: 'pomodoro-ring-stack',
            x_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });

        this._bigIcon = fitLabel(new St.Label({ style_class: 'pomodoro-big-icon', x_align: Clutter.ActorAlign.CENTER }));
        this._timeLabel = fitLabel(new St.Label({ style_class: 'pomodoro-ring-time', x_align: Clutter.ActorAlign.CENTER }));
        this._subLabel = fitLabel(new St.Label({ style_class: 'pomodoro-ring-sub', x_align: Clutter.ActorAlign.CENTER }));

        const bigBar = this._createProgressBar(this._bigBarWidth, 12, 'pomodoro-track', 'pomodoro-fill');
        this._bigFill = bigBar.fill;
        bigBar.container.x_align = Clutter.ActorAlign.CENTER;

        timeStack.add_child(this._bigIcon);
        timeStack.add_child(this._timeLabel);
        timeStack.add_child(bigBar.container);
        timeStack.add_child(this._subLabel);
        this._menuRoot.add_child(timeStack);

        // Session dots
        this._dotsRow = new St.BoxLayout({ style_class: 'pomodoro-dots-row', x_align: Clutter.ActorAlign.CENTER, x_expand: true });
        this._menuRoot.add_child(this._dotsRow);

        // Controls
        const controls = new St.BoxLayout({ style_class: 'pomodoro-controls-row', x_align: Clutter.ActorAlign.CENTER, x_expand: true });

        this._resetButton = this._makeIconButton('view-refresh-symbolic', () => this._resetCurrent());
        this._toggleButton = new St.Button({ style_class: 'pomodoro-glass-button pomodoro-primary-button', reactive: true, can_focus: true, track_hover: true });
        const toggleContent = new St.BoxLayout();
        this._toggleIcon = new St.Icon({ icon_name: 'media-playback-start-symbolic', y_align: Clutter.ActorAlign.CENTER });
        this._toggleLabel = fitLabel(new St.Label({ text: _('Start'), y_align: Clutter.ActorAlign.CENTER }));
        toggleContent.add_child(this._toggleIcon);
        toggleContent.add_child(this._toggleLabel);
        this._toggleButton.set_child(toggleContent);
        this._toggleButton.connect('clicked', () => this._onToggleClicked());

        this._skipButton = this._makeIconButton('media-skip-forward-symbolic', () => this._finishSession({ silent: true }));

        controls.add_child(this._resetButton);
        controls.add_child(this._toggleButton);
        controls.add_child(this._skipButton);
        this._menuRoot.add_child(controls);

        // Separator
        const sep = new St.Widget({ style_class: 'pomodoro-separator', x_expand: true });
        this._menuRoot.add_child(sep);

        // Footer
        const footer = new St.BoxLayout({ style_class: 'pomodoro-footer-row', x_expand: true });
        this._statLabel = fitLabel(new St.Label({ style_class: 'pomodoro-stat-label', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));
        const settingsButton = this._makeFooterButton('emblem-system-symbolic', () => this._showSettingsView());
        footer.add_child(this._statLabel);
        footer.add_child(settingsButton);
        this._menuRoot.add_child(footer);
    }

    // ------------------------------------------------------------ settings

    _buildSettingsUI() {
        this._settingsRoot = new St.BoxLayout({
            style_class: 'pomodoro-menu-root',
            vertical: true,
            visible: false,
        });

        const header = new St.BoxLayout({ style_class: 'pomodoro-header-row' });
        const backButton = this._makeFooterButton('go-previous-symbolic', () => this._showTimerView());
        const title = fitLabel(new St.Label({ text: _('Settings'), style_class: 'pomodoro-title', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));
        header.add_child(backButton);
        header.add_child(title);
        this._settingsRoot.add_child(header);

        this._settingsRoot.add_child(this._makeSectionLabel(_('DURATIONS (MIN)')));
        this._settingsRoot.add_child(this._makeNumberEntryRow(_('Focus'), 'work-minutes', 1, 180));
        this._settingsRoot.add_child(this._makeNumberEntryRow(_('Short break'), 'short-break-minutes', 1, 60));
        this._settingsRoot.add_child(this._makeNumberEntryRow(_('Long break'), 'long-break-minutes', 1, 90));
        this._settingsRoot.add_child(this._makeStepperRow(_('Sessions / cycle'), 'sessions-before-long-break', 2, 12, 1));

        this._settingsRoot.add_child(this._makeSectionLabel(_('AUTOMATION')));
        this._settingsRoot.add_child(this._makeToggleRow(_('Auto-start breaks'), 'auto-start-breaks'));
        this._settingsRoot.add_child(this._makeToggleRow(_('Auto-start focus'), 'auto-start-work'));

        this._settingsRoot.add_child(this._makeSectionLabel(_('ALERTS')));
        this._settingsRoot.add_child(this._makeToggleRow(_('Notifications'), 'show-notifications'));
        this._settingsRoot.add_child(this._makeToggleRow(_('Sound'), 'play-sound'));

        this._settingsRoot.add_child(this._makeSectionLabel(_('TOP BAR')));
        this._settingsRoot.add_child(this._makeToggleRow(_('Show countdown text'), 'show-timer-label'));

        this._settingsRoot.add_child(this._makeSectionLabel(_('STATISTICS')));
        const statsRow = new St.BoxLayout({ style_class: 'pomodoro-setting-row', x_expand: true });
        this._settingsStatLabel = fitLabel(new St.Label({ style_class: 'pomodoro-setting-label', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));
        const resetButton = new St.Button({
            style_class: 'pomodoro-glass-button pomodoro-reset-button',
            label: _('Reset'),
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        resetButton.connect('clicked', () => {
            this._settings.set_int('total-completed', 0);
        });
        statsRow.add_child(this._settingsStatLabel);
        statsRow.add_child(resetButton);
        this._settingsRoot.add_child(statsRow);
    }

    _assembleMenu() {
        const wrapper = new St.BoxLayout({ vertical: true });
        wrapper.add_child(this._menuRoot);
        wrapper.add_child(this._settingsRoot);

        const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        item.add_child(wrapper);
        this.menu.addMenuItem(item);
    }

    _showSettingsView() {
        this._menuRoot.visible = false;
        this._settingsRoot.visible = true;
    }

    _showTimerView() {
        this._settingsRoot.visible = false;
        this._menuRoot.visible = true;
    }

    _makeSectionLabel(text) {
        return fitLabel(new St.Label({ text, style_class: 'pomodoro-section-label' }));
    }

    _makeStepperRow(title, key, min, max, step) {
        const row = new St.BoxLayout({ style_class: 'pomodoro-setting-row', x_expand: true });
        const label = fitLabel(new St.Label({ text: title, style_class: 'pomodoro-setting-label', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));

        const controls = new St.BoxLayout({ style_class: 'pomodoro-stepper', y_align: Clutter.ActorAlign.CENTER });
        const minusButton = this._makeMiniButton('list-remove-symbolic');
        const valueLabel = fitLabel(new St.Label({ style_class: 'pomodoro-stepper-value', y_align: Clutter.ActorAlign.CENTER }));
        const plusButton = this._makeMiniButton('list-add-symbolic');

        const sync = () => {
            valueLabel.text = `${this._settings.get_int(key)}`;
        };
        sync();

        minusButton.connect('clicked', () => {
            this._settings.set_int(key, Math.max(min, this._settings.get_int(key) - step));
            sync();
        });
        plusButton.connect('clicked', () => {
            this._settings.set_int(key, Math.min(max, this._settings.get_int(key) + step));
            sync();
        });

        controls.add_child(minusButton);
        controls.add_child(valueLabel);
        controls.add_child(plusButton);
        row.add_child(label);
        row.add_child(controls);
        return row;
    }

    _makeNumberEntryRow(title, key, min, max) {
        const row = new St.BoxLayout({ style_class: 'pomodoro-setting-row', x_expand: true });
        const label = fitLabel(new St.Label({ text: title, style_class: 'pomodoro-setting-label', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));

        const entry = new St.Entry({
            style_class: 'pomodoro-number-entry',
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        entry.set_text(`${this._settings.get_int(key)}`);

        // Digits only, while typing.
        entry.clutter_text.connect('insert-text', (clutterText, text) => {
            if (!/^\d*$/.test(text))
                GObject.signal_stop_emission_by_name(clutterText, 'insert-text');
        });

        const commit = () => {
            const parsed = parseInt(entry.get_text(), 10);
            const value = Number.isNaN(parsed)
                ? this._settings.get_int(key)
                : Math.min(max, Math.max(min, parsed));
            this._settings.set_int(key, value);
            entry.set_text(`${value}`);
        };

        entry.clutter_text.connect('activate', commit);
        entry.clutter_text.connect('key-focus-out', commit);

        row.add_child(label);
        row.add_child(entry);
        return row;
    }

    _makeToggleRow(title, key) {
        const row = new St.BoxLayout({ style_class: 'pomodoro-setting-row', x_expand: true });
        const label = fitLabel(new St.Label({ text: title, style_class: 'pomodoro-setting-label', y_align: Clutter.ActorAlign.CENTER, x_expand: true }));

        // No layout manager: the knob is positioned by hand with set_position()
        // so its left/right placement doesn't depend on Clutter alignment
        // properties being honored (they weren't, on this Shell build).
        const TOGGLE_WIDTH = 40, TOGGLE_HEIGHT = 22, KNOB_SIZE = 16, INSET = 3;
        const toggle = new St.Widget({
            style_class: 'pomodoro-toggle',
            reactive: true,
            track_hover: true,
            can_focus: true,
            width: TOGGLE_WIDTH,
            height: TOGGLE_HEIGHT,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const knob = new St.Widget({
            style_class: 'pomodoro-toggle-knob',
            width: KNOB_SIZE,
            height: KNOB_SIZE,
        });
        toggle.add_child(knob);

        const sync = () => {
            const on = this._settings.get_boolean(key);
            toggle.style_class = on ? 'pomodoro-toggle pomodoro-toggle-on' : 'pomodoro-toggle';
            const x = on ? TOGGLE_WIDTH - KNOB_SIZE - INSET : INSET;
            knob.set_position(x, (TOGGLE_HEIGHT - KNOB_SIZE) / 2);
        };
        sync();

        toggle.connect('button-press-event', () => {
            this._settings.set_boolean(key, !this._settings.get_boolean(key));
            sync();
            return Clutter.EVENT_STOP;
        });

        row.add_child(label);
        row.add_child(toggle);
        return row;
    }

    _makeMiniButton(iconName) {
        return new St.Button({
            style_class: 'pomodoro-glass-button pomodoro-mini-button',
            child: new St.Icon({ icon_name: iconName }),
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
    }

    _makeIconButton(iconName, onClicked) {
        const button = new St.Button({
            style_class: 'pomodoro-glass-button pomodoro-icon-button',
            child: new St.Icon({ icon_name: iconName }),
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        button.connect('clicked', onClicked);
        return button;
    }

    _makeFooterButton(iconName, onClicked) {
        const button = new St.Button({
            style_class: 'pomodoro-footer-button',
            child: new St.Icon({ icon_name: iconName }),
            reactive: true,
            can_focus: true,
            track_hover: true,
        });
        button.connect('clicked', onClicked);
        return button;
    }

    // -------------------------------------------------------- progress bar

    // Built entirely from plain St/Clutter widgets + CSS (no Cairo/Canvas),
    // since Clutter.Canvas is not available on all Shell versions.
    _createProgressBar(width, height, trackClass, fillClass) {
        const container = new St.Widget({
            layout_manager: new Clutter.BinLayout(),
            width,
            height,
        });
        const track = new St.Widget({
            style_class: trackClass,
            x_expand: true,
            y_expand: true,
        });
        const fill = new St.Widget({
            style_class: fillClass,
            x_align: Clutter.ActorAlign.START,
            y_align: Clutter.ActorAlign.FILL,
            width: 0,
            height,
        });
        container.add_child(track);
        container.add_child(fill);
        return { container, fill, trackWidth: width };
    }

    // --------------------------------------------------------------- timer

    _onToggleClicked() {
        if (this._running)
            this._pause();
        else
            this._start();
    }

    _start() {
        if (this._remaining <= 0)
            this._remaining = this._durationFor(this._sessionType);

        this._running = true;
        this._stopTicking();
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            this._remaining = Math.max(0, this._remaining - 1);
            if (this._remaining <= 0) {
                this._timeoutId = null;
                this._finishSession();
                return GLib.SOURCE_REMOVE;
            }
            this._updateAll();
            return GLib.SOURCE_CONTINUE;
        });
        this._updateAll();
    }

    _pause() {
        this._stopTicking();
        this._running = false;
        this._updateAll();
    }

    _resetCurrent() {
        this._stopTicking();
        this._running = false;
        this._total = this._durationFor(this._sessionType);
        this._remaining = this._total;
        this._updateAll();
    }

    _stopTicking() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    _finishSession({ silent = false } = {}) {
        const wasWork = this._sessionType === SessionType.WORK;
        const wasLongBreak = this._sessionType === SessionType.LONG_BREAK;

        if (wasWork) {
            this._completedInCycle += 1;
            this._settings.set_int('total-completed', this._settings.get_int('total-completed') + 1);
        }

        if (!silent)
            this._notifyEnd(wasWork);

        let next;
        if (wasWork) {
            const beforeLong = this._settings.get_int('sessions-before-long-break');
            next = (this._completedInCycle % beforeLong === 0) ? SessionType.LONG_BREAK : SessionType.SHORT_BREAK;
        } else {
            next = SessionType.WORK;
            if (wasLongBreak)
                this._completedInCycle = 0;
        }

        this._sessionType = next;
        this._total = this._durationFor(next);
        this._remaining = this._total;

        this._stopTicking();
        this._running = false;

        const shouldAutoStart =
            (next === SessionType.WORK && this._settings.get_boolean('auto-start-work')) ||
            (next !== SessionType.WORK && this._settings.get_boolean('auto-start-breaks'));

        if (shouldAutoStart)
            this._start();
        else
            this._updateAll();
    }

    _notifyEnd(wasWork) {
        if (this._settings.get_boolean('play-sound')) {
            try {
                global.display.get_sound_player().play_from_theme(
                    wasWork ? 'complete' : 'bell',
                    wasWork ? _('Pomodoro session complete') : _('Break complete'),
                    null);
            } catch (e) {
                // Sound theme unavailable; fail silently.
            }
        }

        if (this._settings.get_boolean('show-notifications')) {
            const title = wasWork ? _('Focus session complete 🍅') : _('Break complete ☀️');
            const body = wasWork
                ? _('Nice work! Time for a break.')
                : _('Break’s over — ready to focus again?');
            Main.notify(title, body);
        }
    }

    // ------------------------------------------------------------- render

    _updateAll() {
        const timeText = formatTime(this._remaining);
        const progress = this._progressRatio();
        const icon = iconFor(this._sessionType);

        this._panelIcon.text = icon;
        this._panelLabel.text = this._settings.get_boolean('show-timer-label') ? timeText : '';
        this._panelBox.opacity = this._running ? 255 : 190;
        this._panelFill.width = Math.round(this._panelBarWidth * progress);

        this._bigIcon.text = icon;
        this._sessionPill.text = labelFor(this._sessionType);
        this._timeLabel.text = timeText;
        this._subLabel.text = this._running ? _('RUNNING') : (this._remaining === this._total ? _('READY') : _('PAUSED'));
        this._bigFill.width = Math.round(this._bigBarWidth * progress);

        this._toggleIcon.icon_name = this._running ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic';
        this._toggleLabel.text = this._running ? _('Pause') : _('Start');

        this._rebuildDots();

        const totalCompleted = this._settings.get_int('total-completed');
        this._statLabel.text = _('🍅 %d completed').format(totalCompleted);
        this._settingsStatLabel.text = _('🍅 %d completed all-time').format(totalCompleted);
    }

    _rebuildDots() {
        this._dotsRow.destroy_all_children();
        const beforeLong = this._settings.get_int('sessions-before-long-break');
        const filled = this._completedInCycle % beforeLong;
        const count = beforeLong;
        for (let i = 0; i < count; i++) {
            const isFilled = i < filled;
            this._dotsRow.add_child(new St.Widget({
                style_class: isFilled ? 'pomodoro-dot pomodoro-dot-filled' : 'pomodoro-dot',
            }));
        }
    }

    _onSettingsChanged() {
        if (!this._running) {
            this._total = this._durationFor(this._sessionType);
            this._remaining = this._total;
        }
        this._updateAll();
    }

    destroy() {
        this._stopTicking();
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = null;
        }
        super.destroy();
    }
});

export default class PomodoroSkyExtension extends Extension {
    enable() {
        this._indicator = new PomodoroIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
