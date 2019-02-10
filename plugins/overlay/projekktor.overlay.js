/*
 * Projekktor Plugin: Overlay
 * VERSION: 1.1.3
 * DESC: Plugin for placing timed overlays.
 * Copyright 2015-2018 Radosław Włodkowski, radoslaw@wlodkowski.net, http://www.wlodkowski.net
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */

(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorOverlay = function () {};

    projekktorOverlay.prototype = {
        version: '1.1.3',
        reqVer: '1.8.1',
        containers: {
            main: null,
            viewport: null,
            media: null
        },
        config: {
            schedule: [
                /* example overlay element config */
                {
                    /**
                     * id - should be unique
                     */
                    id: 'overlay',
                    /**
                     *  Time in seconds from the beginning of the current playlist item after the current
                     *  overlay element will be shown. If the value is negative, the overlay element will be
                     *  shown on this many seconds before the end of the current playlist item.
                     *
                     *  NOTE: Negative values works only with items which duration is known and finite.
                     *
                     *  Default: 0 - overlay will be shown immediately after start of current playlist item.
                     */
                    on: 0,
                    /**
                     * Time in seconds from the beginning of the current playlist item after the current
                     * overlay element will be hidden. If the value is negative, the overlay element will be
                     * hidden on this many seconds before the end of the current playlist item.
                     *
                     * NOTE: Negative values works only with items which duration is known and finite.
                     *
                     * Default: 0 - overlay will be hidden with the end of current item playback.
                     */
                    off: 0,
                    /**
                     * If true the overlay will appear only once during playback.
                     */
                    once: false,
                    /**
                     * Should the overlay be positioned and scaled relatively to Projekktor viewport region
                     * or current media display region.
                     *
                     * Possible values:
                     * - 'viewport' - whole projekktor viewport area
                     * - 'media' - only media display region
                     */
                    alignTo: 'media',
                    /**
                     * width/height in px or %; default means natural size of the picture loaded
                     */

                    width: 'default',
                    height: 'default',

                    /**
                     * position: top, right, bottom, left;
                     *
                     * Any property can be defined in px or %.
                     * Special value 'center' remains the element centered.
                     *
                     * Values in px are uninfluenced by scaling the container they're included.
                     * Values in % gives possibility to remain relative position when the container is scaled.
                     */
                    position: {
                        top: '0px',
                        left: '0px'
                    },
                    /**
                     * Inline styles to be added to the overlay
                     */
                    styles: {},
                    /**
                     * One or more space-separated classes to be added to the class attribute of the overlay
                     */
                    cssClasses: '',
                    /**
                     * Type of the overlay content. Overlay could be image, iframe or HTML element.
                     * Interpretation of the 'src' value depends on this setting.
                     *
                     *  Possible values:
                     *  - 'image/<type>' - proper mimeType of the image to display e.g. 'image/png', 'image/svg+xml' etc.
                     *  - 'iframe' - overlay will be handled as <iframe> element
                     *  - 'html' - overlay will be handled as <div> element
                     */
                    type: '',
                    /**
                     * URL to the overlay image (works fine with SVG too)
                     * or src of the <iframe> element
                     * or string containing HTML code which should be placed inside the overlay <div>
                     */
                    src: '',
                    /**
                     * Title added to the <img> element title and alt attributes.
                     */
                    title: '',
                    /**
                     * Should the overlay be responsive to user interactions like clicks/touches etc.
                     * If there is a 'link' or 'callback' defined this value should be set to true,
                     * otherwise they won't work.
                     */
                    interactive: false,
                    /**
                     * URL to go to after click on the overlay element [optional].
                     */
                    link: {
                        url: 'http://www.projekktor.com',
                        target: '_blank'
                    },
                    /**
                     * Function called after click on the overlay [optional].
                     * It works only if the link config isn't present.
                     *
                     * There are two parameters passed to the callback function:
                     *      - player - reference to the current projekktor instance
                     *      - plugin - reference to the overlay plugin instance
                     *      - e - event object
                     */
                    callback: function (player, plugin, e) {}
                }
            ]
        },
        defaults: {
            overlay: {
                id: null,
                on: 0,
                off: 0,
                once: false,
                alignTo: 'media',
                width: 'default',
                height: 'default',
                position: {
                    top: '0px',
                    left: '0px',
                    bottom: null,
                    right: null
                },
                styles: {},
                cssClasses: '',
                src: null,
                type: null,
                title: '',
                interactive: false,
                link: {
                    url: null,
                    target: '_blank'
                },
                callback: null
            }
        },
        _endRelativeOverlays: [],
        /*****************************************
         * PUBLIC PLUGIN API
         *****************************************/

        initialize: function () {
            this.createMainContainer();
            this.pluginReady = true;
        },
        /*****************************************
         * EVENT HANDLERS
         *****************************************/

        itemHandler: function () {

        },
        stateHandler: function (state) {

            switch (state) {
                case 'STARTING':
                    this.handleOverlays();
                    break;

                case 'COMPLETED':
                    this.removeOverlayContainers();
                    break;
            }
        },
        durationChangeHandler: function (duration) {
            this.updateEndRelativeOverlaysCuepoints(duration);
        },
        errorHandler: function (error) {
            this.removeOverlayContainers();
        },
        /*****************************************
         * PRIVATE METHODS
         *****************************************/
        handleOverlays: function () {
            var ref = this,
                schedule = this.getConfig('schedule') || [],
                overlaysCuepointListener;

            // cleanup
            this.removeOverlayContainers();

            if (schedule.length) {
                this.addOverlayContainers();

                // add cuepoints for overlays
                this.pp.removeCuePoints(this.pp.getItemId(), true, ['overlayplugin']);
                this.pp.setCuePoints(this.getOverlaysCuepoints(schedule));

                overlaysCuepointListener = function (cuepoint) {
                    var overlay;
                    if (cuepoint.group === ('plugin' + ref.name)) {

                        overlay = cuepoint.value;

                        if (cuepoint.enabled) {
                            ref.addOverlay(overlay);
                        } else {
                            ref.removeOverlay(overlay);
                        }
                    }
                };

                // add cuepoints listener
                this.pp.removeListener('cuepoint.plugin' + this.name);
                this.pp.addListener(('cuepoint.plugin' + this.name), overlaysCuepointListener);
            } else {
                $p.utils.log('Plugin Overlay: no overlays defined for the current item.');
            }
        },

        createMainContainer: function () {
            this.containers.main = this.applyToPlayer(
                $('<div>')
                .css({
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    pointerEvents: 'none'
                })
            );
        },
        addOverlayContainers: function () {
            var scaledListener,
                mainOverlay = this.containers.main,
                mediaOverlay,
                viewportOverlay;

            mediaOverlay = $('<div>')
                .addClass(this.getCN('overlay_media'))
                .css({
                    position: 'absolute',
                    display: 'block',
                    pointerEvents: 'none'
                })
                .appendTo(mainOverlay);

            viewportOverlay = $('<div>')
                .addClass(this.getCN('overlay_viewport'))
                .css({
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    pointerEvents: 'none'
                })
                .appendTo(mainOverlay);

            // scale media overlay when the media is scaled
            scaledListener = function (event, pp) {
                var mediaElement = pp.playerModel.getMediaElement();
                mediaOverlay.css(mediaElement.css(['width', 'height', 'left', 'top']));
            };

            // immediately execute scaledListener to prevent overlays being invisible
            // if 'scaled' event isn't dispatched after 'state.starting'
            scaledListener(null, this.pp);

            // add listener for scaling
            this.pp.addListener(('scaled.plugin' + this.name), scaledListener);

            this.containers.media = mediaOverlay;
            this.containers.viewport = viewportOverlay;
        },
        removeOverlayContainers: function () {
            if (this.containers.main) {
                this._endRelativeOverlays = [];
                this.containers.main.html('');
                this.pp.removeListener('*.plugin' + this.name);
                this.containers.viewport = null;
                this.containers.media = null;
            }
        },
        addOverlay: function (overlay) {
            var overlayElement = $('<div>'),
                alignTo = overlay.alignTo,
                destination = this._getDestinationContainer(alignTo),
                nId = this.getCN('overlay_' + overlay.id),
                ref = this;

            overlayElement
                .addClass(this.getCN('overlay_element'))
                .attr('id', nId)
                .append(
                    this._getElementType(overlay.src, overlay.type, overlay.id, overlay.title)
                    .addClass(overlay.cssClasses)
                    .css(overlay.styles)
                    .css(this._getElementPositionCss({
                        top: overlay.position.top,
                        right: overlay.position.right,
                        bottom: overlay.position.bottom,
                        left: overlay.position.left,
                        width: overlay.width,
                        height: overlay.height
                    }))
                    .css({
                        width: overlay.width === 'default' ? undefined : overlay.width,
                        height: overlay.height === 'default' ? undefined : overlay.height,
                        position: 'absolute',
                        display: 'block',
                        pointerEvents: overlay.interactive ? 'auto' : 'none'
                    })
                );

            if (overlay.interactive) {
                if (overlay.link && overlay.link.url) {
                    overlayElement.css({
                            cursor: 'pointer'
                        })
                        .click(function (evt) {
                            window.open(overlay.link.url, overlay.link.target);
                        });
                }
                if (!overlay.link && typeof (overlay.callback) === 'function') {
                    overlayElement.css({
                            cursor: 'pointer'
                        })
                        .click(function (evt) {
                            overlay.callback(ref.pp, ref, evt);
                        });
                }
            }

            destination.append(overlayElement);
        },
        removeOverlay: function (overlay) {
            var alignTo = overlay.alignTo,
                destination = this._getDestinationContainer(alignTo),
                nId = this.getCN('overlay_' + overlay.id);

            destination.find('#' + nId).remove();
        },
        getOverlaysCuepoints: function (schedule) {
            var ref = this,
                cuepoints = [],
                mediaDuration = this.pp.getDuration() || 0,
                isLive = this.pp.getIsLiveOrDvr();

            $.each(schedule, function () {
                var overlay = $.extend(true, {}, ref.defaults.overlay, this),
                    on = ref._getRelativeTime(overlay.on, mediaDuration),
                    off = isLive ? Number.POSITIVE_INFINITY : ref._getRelativeTime(overlay.off || mediaDuration, mediaDuration);

                // store overlays which timing is related to the media duration
                if (!isLive && ((overlay.on + '' + overlay.off).indexOf('-') > -1 || overlay.off === 0)) {
                    ref._endRelativeOverlays.push(overlay);
                }

                if (typeof overlay.src === 'string' && overlay.src.length) {

                    cuepoints.push({
                        id: overlay.id || $p.utils.randomId(8),
                        on: on,
                        off: off,
                        once: overlay.once || false,
                        group: 'plugin' + ref.name,
                        value: overlay
                    });
                }
            });

            return cuepoints;
        },
        updateEndRelativeOverlaysCuepoints: function (duration) {
            var overlay,
                cuepoint,
                i, l;

            for (i = 0, l = this._endRelativeOverlays.length; i < l; i++) {
                overlay = this._endRelativeOverlays[i];
                cuepoint = this.pp.getCuePointById(overlay.id);
                if (cuepoint && cuepoint.group === ('plugin' + this.name)) {
                    cuepoint.on = this._getRelativeTime(overlay.on, duration);
                    cuepoint.off = this._getRelativeTime(overlay.off, duration) || duration;
                }
            }
        },
        /*****************************************
         * HELPERS
         *****************************************/
        _getRelativeTime: function (time, duration) {
            if ((String(time).indexOf('-') > -1) && duration) {
                time = duration - Math.abs($p.utils.toSeconds(time));
            }

            return $p.utils.toSeconds(time);
        },
        _getElementType: function (src, type, id, title, props) {
            var el;

            // image
            if (type.indexOf('image') > -1) {
                el = $('<img>')
                    .attr('src', src)
                    .attr('type', type)
                    .attr('id', this.getCN('overlay_' + id + '_image'))
                    .attr('alt', escape(title));
            }

            // iframe
            if (type === 'iframe') {
                el = $('<iframe>')
                    .attr('src', src)
                    .attr('frameborder', 0)
                    .attr('allowtransparency', 'true')
                    .attr('scrolling', 'auto')
                    .attr('marginwidth', 0)
                    .attr('marginheight', 0)
                    .attr('vspace', 0)
                    .attr('hspace', 0);
            }

            // html
            if (type === 'html') {
                el = $('<div>')
                    .html(src);
            }

            return el;
        },
        _getElementPositionCss: function (conf) {
            var css = {};

            // set vertically centering styles
            if (String(conf.top + conf.bottom).indexOf('center') > -1) {
                css.top = 'calc(50% - (' + conf.height + '/2))';
            } else {
                if (conf.bottom) {
                    css.bottom = conf.bottom;
                } else {
                    css.top = conf.top || '0px';
                }
            }

            // set horizontally centering styles
            if (String(conf.left + conf.right).indexOf('center') > -1) {
                css.left = 'calc(50% - (' + conf.width + '/2))';
            } else {
                if (conf.right) {
                    css.right = conf.right;
                } else {
                    css.left = conf.left || '0px';
                }
            }

            return css;
        },
        _getDestinationContainer: function (alignTo) {
            var destination;

            if (alignTo === 'viewport') {
                destination = this.containers.viewport;
            } else {
                destination = this.containers.media;
            }

            return destination;
        }
    };

    $p.plugins.projekktorOverlay = projekktorOverlay;
}(window, document, jQuery, projekktor));