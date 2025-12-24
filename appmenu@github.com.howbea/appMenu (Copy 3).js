import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as AppFavorites from 'resource:///org/gnome/shell/ui/appFavorites.js';
import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Pango from 'gi://Pango';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

let button; // (unused here but kept for compatibility)
const MAX_W = 260;
const MAX_H = 195;

const MyPanelMenuButton = GObject.registerClass(
class MyPanelMenuButton extends PanelMenu.Button {
    _init() {
        super._init(0.0, 'MyPanelMenuButton');

        const icon = new St.Icon({
            icon_name: 'view-grid-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(icon);

        this._overlay = null;
        this._bottomBar = null;
        this._previewWrapper = null;
        this._previewContainer = null;
        this._clones = [];
        this._selectedIndex = 0;
        this._modalHandlerId = 0;

        this.connect('button-press-event', () => {
            this._showWidget();
        });
    }

    _showWidget() {
        if (this._overlay) return;
        if (Main.overview.visible) return;
        
        if (this._isShowing)
        return;
    this._isShowing = true;

    //
    // 1. ホットコーナー無効化
    //
    this._shellSettings = new Gio.Settings({ schema: 'org.gnome.shell' });
    this._oldHotCorner = this._shellSettings.get_boolean('enable-hot-corners');
    this._shellSettings.set_boolean('enable-hot-corners', false);

    //
    // 2. Super キー無効化（Overlay-key ハンドラ）
    //
    this._overlayId = global.display.connect('overlay-key', () => true);

    //
    // 3. bottomBar を modal にしてフォーカス捕まえる
    //
    Main.pushModal(this.bottomBar, {
        actionMode: Shell.ActionMode.NONE,
        dontDim: true,        // 背景暗くしない
    });

    this.bottomBar.grab_key_focus();


        const monitor = Main.layoutManager.primaryMonitor;

        // overlay
        this._overlay = new St.Widget({
            reactive: true,
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
        });
        this._overlay.connect('button-press-event', () => {
            this._closeWidget();
            return Clutter.EVENT_STOP;
        });

        // bottom bar
        this._bottomBar = new St.BoxLayout({
            reactive: true,
            vertical: false,
            x: monitor.x,
            y: monitor.y + monitor.height - 340,
            width: monitor.width,
            height: 340,
            style: 'background-color: rgba(0,0,0,0.8); padding: 12px;',
        });
        this._bottomBar.connect('button-press-event', () => Clutter.EVENT_STOP);
        this._bottomBar.reactive = true;
        this._bottomBar.can_focus = true;
        this._bottomBar.focus_on_click = true;

        // preview container & wrapper
        this._previewContainer = new St.BoxLayout({
            reactive: true,
            vertical: false,
            style: 'spacing: 12px;',
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._previewWrapper = new St.Bin({
            child: this._previewContainer,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: false,
        });
        this._bottomBar.add_child(this._previewWrapper);

        // add to uiGroup
        Main.layoutManager.uiGroup.add_child(this._overlay);
        this._overlay.add_child(this._bottomBar);

        // populate previews
        this._populateClones();

        // reorder by active window, set highlight
        this._reorderByActiveWindow();
        this._selectedIndex = 0;
        this._updateHighlight();

        // captured-event: seize keys & mouse (consume Super + hotcorner)
        this._modalHandlerId = global.stage.connect(
            'captured-event',
            this._onCapturedEvent.bind(this)
        );

        // ensure focus removed from apps and ours receives it
        try { global.display.set_key_focus(null); } catch (e) {}
        GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            try { this._bottomBar.grab_key_focus(); } catch (e) {}
            try {
                const sel = this._clones[this._selectedIndex];
                if (sel && sel.box) sel.box.grab_key_focus();
            } catch (e) {}
            return GLib.SOURCE_REMOVE;
        });

        // animate in
        const finalY = monitor.y + monitor.height - 340;
        const startY = finalY + 60;
        this._bottomBar.set_position(monitor.x, startY);
        this._bottomBar.opacity = 0;
        this._bottomBar.ease({
            y: finalY,
            opacity: 255,
            duration: 250,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._overlay.opacity = 0;
        this._overlay.ease({
            opacity: 255,
            duration: 250,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        
        this.opacity = 255;
        this.show();
    }

    _populateClones() {
        // clear
        this._clones = [];

        const tracker = Shell.WindowTracker.get_default();
        const wins = global.get_window_actors()
            .map(a => a.meta_window)
            .filter(w => w && tracker.get_window_app(w));

        for (let i = 0; i < wins.length; i++) {
            const win = wins[i];
            const actor = win.get_compositor_private();
            if (!actor) continue;

            const app = Shell.WindowTracker.get_default().get_window_app(win);
            const icon = app ? app.create_icon_texture(64) : new St.Icon({
                icon_name: 'application-x-executable-symbolic',
                icon_size: 64,
            });
            icon.set({ x_expand: true, y_expand: false, x_align: Clutter.ActorAlign.CENTER });

            // compute preview size
            const w = actor.width || 1;
            const h = actor.height || 1;
            const aspect = w / h;
            let pw = MAX_W;
            let ph = pw / aspect;
            if (ph > MAX_H) { ph = MAX_H; pw = ph * aspect; }

            const clone = new Clutter.Clone({ source: actor, width: pw, height: ph, reactive: true });
            const cloneContainer = new St.Bin({
                child: clone,
                width: MAX_W,
                height: MAX_H,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            const titleText = win.get_title() || (app && app.get_name()) || '—';
            const title = new St.Label({
                text: titleText,
                style: 'color:white; font-size:14px;',
                x_expand: true,
                y_expand: false,
                x_align: Clutter.ActorAlign.CENTER,
            });
            title.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

            const itemBox = new St.BoxLayout({
                vertical: true,
                reactive: true,
                style: 'spacing:6px; padding:6px; border-radius:10px;',
                width: 340,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });

            itemBox.add_child(icon);
            itemBox.add_child(cloneContainer);
            itemBox.add_child(title);

            itemBox.connect('enter-event', () => {
                itemBox.set_style('spacing:6px; padding:6px; border-radius:10px; background-color: rgba(255,255,255,0.35);');
            });
            itemBox.connect('leave-event', () => {
                itemBox.set_style('spacing:6px; padding:6px; border-radius:10px;');
            });
            itemBox.connect('button-press-event', () => {
                try { win.activate(global.get_current_time()); } catch (e) {}
                this._closeWidget();
                return Clutter.EVENT_STOP;
            });

            this._previewContainer.add_child(itemBox);
            this._clones.push({ win, box: itemBox });
        }
    }

    _reorderByActiveWindow() {
        try {
            const activeWin = global.display.get_focus_window();
            const idx = this._clones.findIndex(c => c.win === activeWin);
            if (idx > 0) {
                const [activeItem] = this._clones.splice(idx, 1);
                this._clones.unshift(activeItem);
                this._previewContainer.remove_all_children();
                this._clones.forEach(c => this._previewContainer.add_child(c.box));
            }
        } catch (e) {}
    }

    _onCapturedEvent(actor, event) {
        const type = event.type();

        // BUTTON_PRESS -> outside click closes
        if (type === Clutter.EventType.BUTTON_PRESS) {
            this._closeWidget();
            event.stop();
            return Clutter.EVENT_STOP;
        }

        // KEY_PRESS -> consume Super and all keys (AltTab-like)
        if (type === Clutter.EventType.KEY_PRESS) {
            const symbol = event.get_key_symbol();

            // consume Super (disable overview/hotcorner trigger)
            if (symbol === Clutter.KEY_Super_L || symbol === Clutter.KEY_Super_R) {
                event.stop();
                return Clutter.EVENT_STOP;
            }

            switch (symbol) {
                case Clutter.KEY_Escape:
                    this._closeWidget();
                    event.stop();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Left:
                    this._selectPrev();
                    event.stop();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Right:
                case Clutter.KEY_Tab:
                    this._selectNext();
                    event.stop();
                    return Clutter.EVENT_STOP;

                case Clutter.KEY_Return:
                case Clutter.KEY_KP_Enter:
                    this._activateCurrent();
                    event.stop();
                    return Clutter.EVENT_STOP;
            }

            // keep focus on our bottomBar
            try { global.display.set_key_focus(null); } catch (e) {}
            try { this._bottomBar.grab_key_focus(); } catch (e) {}

            event.stop();
            return Clutter.EVENT_STOP;
        }

        // MOUSE MOVE / ENTER / LEAVE -> stop to prevent hot-corner
        if (type === Clutter.EventType.ENTER ||
            type === Clutter.EventType.LEAVE ||
            type === Clutter.EventType.MOTION) {
            event.stop();
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    }

    _selectNext() {
        if (!this._clones.length) return;
        this._selectedIndex = (this._selectedIndex + 1) % this._clones.length;
        this._updateHighlight();
        try { this._clones[this._selectedIndex].box.grab_key_focus(); } catch (e) {}
    }

    _selectPrev() {
        if (!this._clones.length) return;
        this._selectedIndex = (this._selectedIndex - 1 + this._clones.length) % this._clones.length;
        this._updateHighlight();
        try { this._clones[this._selectedIndex].box.grab_key_focus(); } catch (e) {}
    }

    _updateHighlight() {
        this._clones.forEach((c, i) => {
            if (i === this._selectedIndex)
                c.box.set_style('spacing:6px; padding:6px; border-radius:10px; background-color: rgba(255,255,255,0.32);');
            else
                c.box.set_style('spacing:6px; padding:6px; border-radius:10px;');
        });
    }

    _activateCurrent() {
        const info = this._clones[this._selectedIndex];
        if (!info) return;
        try { info.win.activate(global.get_current_time()); } catch (e) {}
        this._closeWidget();
    }

    _closeWidget() {
        if (!this._isShowing)
        return;
    this._isShowing = false;

    //
    // 1. modal を解除
    //
    if (Main.modalActor === this.bottomBar)
        Main.popModal(this.bottomBar);

    //
    // 2. Super 無効解除
    //
    if (this._overlayId) {
        global.display.disconnect(this._overlayId);
        this._overlayId = null;
    }

    //
    // 3. ホットコーナー設定を戻す
    //
    if (this._shellSettings) {
        this._shellSettings.set_boolean('enable-hot-corners', this._oldHotCorner);
    }
    
        if (!this._bottomBar || !this._overlay) {
            if (this._modalHandlerId) {
                try { global.stage.disconnect(this._modalHandlerId); } catch (e) {}
                this._modalHandlerId = 0;
            }
            return;
        }
        
        

        const endY = this._bottomBar.y - 15;
        this._bottomBar.ease({
            y: endY,
            opacity: 0,
            duration: 150,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                this._clones = [];

                if (this._bottomBar) {
    if (this._previewWrapper && this._bottomBar.contains(this._previewWrapper))
        this._bottomBar.remove_child(this._previewWrapper);
}

if (this._previewWrapper) {
    // wrapper の destroy はしない。親が壊れると連動して壊れる
    this._previewWrapper = null;
}

if (this._previewContainer) {
    // container の destroy もしない。同上
    this._previewContainer = null;
}

if (this._overlay) {
    if (Main.layoutManager.uiGroup.contains(this._overlay))
        Main.layoutManager.uiGroup.remove_child(this._overlay);

    // overlay は destroy OK（親が UIGroup だけなので安全）
    this._overlay.destroy();
    this._overlay = null;
}

if (this._bottomBar) {
    // bottomBar も destroy OK（overlay の子なのでまとめて破棄済みだが安全）
    this._bottomBar = null;
}

if (this._modalHandlerId) {
    try { global.stage.disconnect(this._modalHandlerId); } catch (e) {}
    this._modalHandlerId = 0;
}

            },
        });

        try { this._overlay.ease({ opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_IN_QUAD }); } catch (e) {}
        
        this.hide();
    }
});

export class AppMenu extends PopupMenu.PopupMenu {
    /**
     * @param {Clutter.Actor} sourceActor - actor the menu is attached to
     * @param {St.Side} side - arrow side
     * @param {object} params - options
     * @param {bool} params.favoritesSection - show items to add/remove favorite
     * @param {bool} params.showSingleWindow - show window section for a single window
     */
    constructor(sourceActor, side = St.Side.TOP, params = {}) {
        if (Clutter.get_default_text_direction() === Clutter.TextDirection.RTL) {
            if (side === St.Side.LEFT)
                side = St.Side.RIGHT;
            else if (side === St.Side.RIGHT)
                side = St.Side.LEFT;
        }

        super(sourceActor, 0.5, side);

        this.actor.add_style_class_name('app-menu');

        const {
            favoritesSection = false,
            showSingleWindows = false,
        } = params;

        this._app = null;
        this._appSystem = Shell.AppSystem.get_default();
        this._parentalControlsManager = ParentalControlsManager.getDefault();
        this._appFavorites = AppFavorites.getAppFavorites();
        this._enableFavorites = favoritesSection;
        this._showSingleWindows = showSingleWindows;

        this._windowsChangedId = 0;
        this._updateWindowsLaterId = 0;

        /* Translators: This is the heading of a list of open windows */
        this._openWindowsHeader = new PopupMenu.PopupSeparatorMenuItem(_('Open Windows'));
        this.addMenuItem(this._openWindowsHeader);

        this._windowSection = new PopupMenu.PopupMenuSection();
        this.addMenuItem(this._windowSection);

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._newWindowItem = this.addAction(_('New Window'), () => {
            this._animateLaunch();
            this._app.open_new_window(-1);
            Main.overview.hide();
        });

        this._actionSection = new PopupMenu.PopupMenuSection();
        this.addMenuItem(this._actionSection);

        this._onGpuMenuItem = this.addAction('', () => {
            this._animateLaunch();
            this._app.launch(0, -1, this._getNonDefaultLaunchGpu());
            Main.overview.hide();
        });

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._toggleFavoriteItem = this.addAction('', () => {
            const appId = this._app.get_id();
            if (this._appFavorites.isFavorite(appId))
                this._appFavorites.removeFavorite(appId);
            else
                this._appFavorites.addFavorite(appId);
        });

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        this._mypanelMenuButtonItem = this.addAction(_('Previews'), () => {
            this._mypanelMenuButton = new MyPanelMenuButton();
            this._mypanelMenuButton._showWidget();
        });
        
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._detailsItem = this.addAction(_('App Details'), async () => {
            const id = this._app.get_id();
            const args = GLib.Variant.new('(ss)', [id, '']);
            const bus = await Gio.DBus.get(Gio.BusType.SESSION, null);
            bus.call(
                'org.gnome.Software',
                '/org/gnome/Software',
                'org.gtk.Actions', 'Activate',
                new GLib.Variant('(sava{sv})', ['details', [args], null]),
                null, 0, -1, null);
            Main.overview.hide();
        });

        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._quitItem =
            this.addAction(_('Quit'), () => this._app.request_quit());

        this._appSystem.connectObject(
            'installed-changed', () => this._updateDetailsVisibility(),
            'app-state-changed', this._onAppStateChanged.bind(this),
            this.actor);

        this._parentalControlsManager.connectObject(
            'app-filter-changed', () => this._updateFavoriteItem(), this.actor);

        this._appFavorites.connectObject(
            'changed', () => this._updateFavoriteItem(), this.actor);

        global.settings.connectObject(
            'writable-changed::favorite-apps', () => this._updateFavoriteItem(),
            this.actor);

        global.connectObject(
            'notify::switcheroo-control', () => this._updateGpuItem(),
            this.actor);

        this._updateQuitItem();
        this._updateFavoriteItem();
        this._updateGpuItem();
        this._updateDetailsVisibility();
    }

    _onAppStateChanged(sys, app) {
        if (this._app !== app)
            return;

        this._updateQuitItem();
        this._updateNewWindowItem();
        this._updateGpuItem();
    }

    _updateQuitItem() {
        this._quitItem.visible = this._app?.state === Shell.AppState.RUNNING;
    }

    _updateNewWindowItem() {
        const actions = this._app?.appInfo?.list_actions() ?? [];
        this._newWindowItem.visible =
            this._app?.can_open_new_window() && !actions.includes('new-window');
    }

    _updateFavoriteItem() {
        const appInfo = this._app?.app_info;
        const canFavorite = appInfo &&
            this._enableFavorites &&
            global.settings.is_writable('favorite-apps') &&
            this._parentalControlsManager.shouldShowApp(appInfo);

        this._toggleFavoriteItem.visible = canFavorite;

        if (!canFavorite)
            return;

        const {id} = this._app;
        this._toggleFavoriteItem.label.text = this._appFavorites.isFavorite(id)
            ? _('Unpin')
            : _('Pin to Dash');
    }

    _updateGpuItem() {
        const proxy = global.get_switcheroo_control();
        const hasDualGpu = proxy?.get_cached_property('HasDualGpu')?.unpack();

        const showItem =
            this._app?.state === Shell.AppState.STOPPED && hasDualGpu;

        this._onGpuMenuItem.visible = showItem;

        if (!showItem)
            return;

        const launchGpu = this._getNonDefaultLaunchGpu();
        this._onGpuMenuItem.label.text = launchGpu === Shell.AppLaunchGpu.DEFAULT
            ? _('Launch Using Integrated Graphics Card')
            : _('Launch Using Discrete Graphics Card');
    }

    _updateDetailsVisibility() {
        const sw = this._appSystem.lookup_app('org.gnome.Software.desktop');
        this._detailsItem.visible = sw !== null;
    }

    _animateLaunch() {
        if (this.sourceActor.animateLaunch)
            this.sourceActor.animateLaunch();
    }

    _getNonDefaultLaunchGpu() {
        return this._app.appInfo.get_boolean('PrefersNonDefaultGPU')
            ? Shell.AppLaunchGpu.DEFAULT
            : Shell.AppLaunchGpu.DISCRETE;
    }

    /** */
    destroy() {
        this.setApp(null);
        super.destroy();
    }

    /**
     * @returns {bool} - true if the menu is empty
     */
    isEmpty() {
        if (!this._app)
            return true;
        return super.isEmpty();
    }

    /**
     * @param {Shell.App} app - the app the menu represents
     */
    setApp(app) {
        if (this._app === app)
            return;

        this._app?.disconnectObject(this);

        this._app = app;

        this._app?.connectObject('windows-changed',
            () => this._queueUpdateWindowsSection(), this);

        this._updateWindowsSection();

        const appInfo = app?.app_info;
        const actions = appInfo?.list_actions() ?? [];

        this._actionSection.removeAll();
        actions.forEach(action => {
            const label = appInfo.get_action_name(action);
            this._actionSection.addAction(label, event => {
                if (action === 'new-window')
                    this._animateLaunch();

                this._app.launch_action(action, event.get_time(), -1);
                Main.overview.hide();
            });
        });

        this._updateQuitItem();
        this._updateNewWindowItem();
        this._updateFavoriteItem();
        this._updateGpuItem();
    }

    _queueUpdateWindowsSection() {
        if (this._updateWindowsLaterId)
            return;

        const laters = global.compositor.get_laters();
        this._updateWindowsLaterId = laters.add(
            Meta.LaterType.BEFORE_REDRAW, () => {
                this._updateWindowsSection();
                return GLib.SOURCE_REMOVE;
            });
    }

    _updateWindowsSection() {
        if (this._updateWindowsLaterId) {
            const laters = global.compositor.get_laters();
            laters.remove(this._updateWindowsLaterId);
        }
        this._updateWindowsLaterId = 0;

        this._windowSection.removeAll();
        this._openWindowsHeader.hide();

        if (!this._app)
            return;

        const minWindows = this._showSingleWindows ? 1 : 2;
        const windows = this._app.get_windows().filter(w => !w.skip_taskbar);
        if (windows.length < minWindows)
            return;

        this._openWindowsHeader.show();

        windows.forEach(window => {
            const title = window.title || this._app.get_name();
            const item = this._windowSection.addAction(title, event => {
                Main.activateWindow(window, event.get_time());
            });
            window.connectObject('notify::title', () => {
                item.label.text = window.title || this._app.get_name();
            }, item);
        });
    }
}

