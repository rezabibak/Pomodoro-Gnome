import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

function addSpinRow(group, settings, key, title, subtitle, lower, upper) {
    const row = new Adw.SpinRow({
        title,
        subtitle,
        adjustment: new Gtk.Adjustment({ lower, upper, step_increment: 1, page_increment: 5 }),
    });
    settings.bind(key, row, 'value', 0 /* Gio.SettingsBindFlags.DEFAULT */);
    group.add(row);
    return row;
}

function addSwitchRow(group, settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', 0 /* Gio.SettingsBindFlags.DEFAULT */);
    group.add(row);
    return row;
}

export default class PomodoroSkyPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.set_default_size(560, 640);

        // ---- Timer page ----
        const timerPage = new Adw.PreferencesPage({
            title: _('Timer'),
            icon_name: 'alarm-symbolic',
        });

        const durations = new Adw.PreferencesGroup({
            title: _('Durations'),
            description: _('How long each type of session lasts, in minutes.'),
        });
        addSpinRow(durations, settings, 'work-minutes', _('Focus session'), _('Deep work interval'), 1, 180);
        addSpinRow(durations, settings, 'short-break-minutes', _('Short break'), _('Between focus sessions'), 1, 60);
        addSpinRow(durations, settings, 'long-break-minutes', _('Long break'), _('After a full cycle'), 1, 90);
        timerPage.add(durations);

        const cycle = new Adw.PreferencesGroup({
            title: _('Cycle'),
            description: _('How many focus sessions happen before a long break.'),
        });
        addSpinRow(cycle, settings, 'sessions-before-long-break', _('Sessions before long break'), null, 2, 12);
        timerPage.add(cycle);

        window.add(timerPage);

        // ---- Behavior page ----
        const behaviorPage = new Adw.PreferencesPage({
            title: _('Behavior'),
            icon_name: 'preferences-system-symbolic',
        });

        const automation = new Adw.PreferencesGroup({ title: _('Automation') });
        addSwitchRow(automation, settings, 'auto-start-breaks', _('Auto-start breaks'), _('Begin the break as soon as a focus session ends'));
        addSwitchRow(automation, settings, 'auto-start-work', _('Auto-start focus sessions'), _('Begin the next focus session as soon as a break ends'));
        behaviorPage.add(automation);

        const alerts = new Adw.PreferencesGroup({ title: _('Alerts') });
        addSwitchRow(alerts, settings, 'show-notifications', _('Show notifications'), _('Notify when a session ends'));
        addSwitchRow(alerts, settings, 'play-sound', _('Play sound'), _('Play a gentle chime when a session ends'));
        behaviorPage.add(alerts);

        const topBar = new Adw.PreferencesGroup({ title: _('Top Bar') });
        addSwitchRow(topBar, settings, 'show-timer-label', _('Show countdown text'), _('Display the mm:ss countdown next to the ring icon'));
        behaviorPage.add(topBar);

        window.add(behaviorPage);

        // ---- Statistics page ----
        const statsPage = new Adw.PreferencesPage({
            title: _('Statistics'),
            icon_name: 'emblem-favorite-symbolic',
        });

        const statsGroup = new Adw.PreferencesGroup({ title: _('All time') });
        const statsRow = new Adw.ActionRow({
            title: _('Completed focus sessions'),
            subtitle: `${settings.get_int('total-completed')}`,
        });
        const resetButton = new Gtk.Button({
            label: _('Reset'),
            valign: Gtk.Align.CENTER,
            css_classes: ['destructive-action'],
        });
        resetButton.connect('clicked', () => {
            settings.set_int('total-completed', 0);
            statsRow.subtitle = '0';
        });
        settings.connect('changed::total-completed', () => {
            statsRow.subtitle = `${settings.get_int('total-completed')}`;
        });
        statsRow.add_suffix(resetButton);
        statsGroup.add(statsRow);
        statsPage.add(statsGroup);

        window.add(statsPage);
    }
}
