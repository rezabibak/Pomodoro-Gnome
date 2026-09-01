# Pomodoro Sky

A beautiful, sky-blue glassmorphism Pomodoro timer for the GNOME Shell top bar. Track focus and break sessions with a glass progress bar, session dots, gentle sound and notifications, and a settings page built right into the popup — no need to open GNOME Settings.

## Features

- 🍅 Focus / ☕ short break / 🌤️ long break cycle, fully automatic
- Live progress bar and countdown in both the top bar and the popup
- Session dots showing your position in the current cycle
- Sound + notification when a session ends
- Optional auto-start for breaks and/or the next focus session
- All-time completed-sessions counter
- **In-app settings** — click the gear icon in the popup to edit durations, automation, alerts, and stats, all inside the same sky-blue glass card (no GNOME Settings window)
- No native code, no dependencies — just GJS/St/Clutter

## Requirements

- GNOME Shell 45 or newer (tested on GNOME Shell 50)

## Installation

### From source

```bash
git clone https://github.com/rezabibak/Pomodoro-Gnome.git
cd Pomodoro-Gnome
./install.sh
```

Then either log out and back in, or reload extensions with:

```bash
gnome-extensions enable pomodoro-sky@rezabibak.github.io
```

### Manual

1. Copy this repository's contents into:
   ```
   ~/.local/share/gnome-shell/extensions/pomodoro-sky@rezabibak.github.io/
   ```
2. Compile the settings schema:
   ```bash
   glib-compile-schemas ~/.local/share/gnome-shell/extensions/pomodoro-sky@rezabibak.github.io/schemas/
   ```
3. Log out and back in (Wayland requires a fresh session to pick up a brand-new extension directory), then enable it:
   ```bash
   gnome-extensions enable pomodoro-sky@rezabibak.github.io
   ```
   Or toggle it on in the **Extensions** app.

## Usage

- Click the tomato/clock icon in the top bar to open the timer.
- **Start / Pause** — the big pill button.
- **Reset** — restarts the current session from full length.
- **Skip** — jumps to the next session immediately (no notification/sound).
- **Gear icon** — opens the built-in settings page; the back arrow returns to the timer.

## Settings

All available from the in-app settings page:

- Focus / short break / long break duration (minutes, typed directly)
- Sessions per cycle before a long break
- Auto-start breaks / auto-start focus sessions
- Notifications on/off, sound on/off
- Show or hide the countdown text in the top bar
- All-time completed sessions counter, with reset

## Development

After editing the source, reload with:

```bash
gnome-extensions disable pomodoro-sky@rezabibak.github.io
gnome-extensions enable pomodoro-sky@rezabibak.github.io
```

If GNOME Shell doesn't pick up the change (some Shell builds cache the loaded module), log out and back in.

## License

MIT — see [LICENSE](LICENSE).
