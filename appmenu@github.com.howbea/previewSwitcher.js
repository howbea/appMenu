import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

class PreviewSwitcher {
    constructor() {
        this._overlay = null;
        this._bar = null;
        this._items = [];
        this._index = 0;
        this._capturedId = 0;
        this._overviewId = Main.overview.connect('showing', () => this.close());
    }

    destroy() {
        this.close();
        if (this._overviewId) {
            Main.overview.disconnect(this._overviewId);
            this._overviewId = 0;
        }
    }

    toggle() {
        if (this._overlay)
            this.close();
        else
            this.open();
    }

    open() {
        if (this._overlay || Main.overview.visible)
            return;

        const monitor = Main.layoutManager.primaryMonitor;

        this._overlay = new St.Widget({
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        });

        this._bar = new St.BoxLayout({
            style: 'background: rgba(0,0,0,0.9); padding:12px; spacing:12px;',
            x: monitor.x,
            y: monitor.y + monitor.height - 260,
            width: monitor.width,
            height: 260,
        });

        this._overlay.add_child(this._bar);
        Main.layoutManager.uiGroup.add_child(this._overlay);

        this._buildItems();
        this._highlight();

        this._capturedId = global.stage.connect('captured-event',
            this._onEvent.bind(this));
    }

    close() {
        if (!this._overlay)
            return;

        if (this._capturedId) {
            global.stage.disconnect(this._capturedId);
            this._capturedId = 0;
        }

        this._overlay.destroy();
        this._overlay = null;
        this._bar = null;
        this._items = [];
        this._index = 0;
    }

    _buildItems() {
        const tracker = Shell.WindowTracker.get_default();
        let wins = global.get_window_actors()
            .map(a => a.meta_window)
            .filter(w => w && tracker.get_window_app(w));

        // アクティブウィンドウを先頭に
        const active = global.display.get_focus_window();
        const idx = wins.indexOf(active);
        if (idx > 0) {
            wins.splice(idx, 1);
            wins.unshift(active);
        }

        for (const win of wins) {
            const actor = win.get_compositor_private();
            if (!actor)
                continue;

            const clone = new Clutter.Clone({ source: actor });
            const box = new St.Bin({ child: clone, reactive: true });

            this._bar.add_child(box);
            this._items.push({ win, box });
        }
    }

    _onEvent(actor, event) {
        if (event.type() !== Clutter.EventType.KEY_PRESS)
            return Clutter.EVENT_PROPAGATE;

        switch (event.get_key_symbol()) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Left:
            this._index = (this._index - 1 + this._items.length) % this._items.length;
            this._highlight();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Right:
        case Clutter.KEY_Tab:
            this._index = (this._index + 1) % this._items.length;
            this._highlight();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Return:
            this._items[this._index].win.activate(global.get_current_time());
            this.close();
            return Clutter.EVENT_STOP;
        default:
            return Clutter.EVENT_STOP;
        }
    }

    _highlight() {
        this._items.forEach((i, idx) => {
            i.box.set_style(idx === this._index
                ? 'border:2px solid white;'
                : '');
        });
    }
}

let _instance = null;

export function getPreviewSwitcher() {
    if (!_instance)
        _instance = new PreviewSwitcher();
    return _instance;
}

