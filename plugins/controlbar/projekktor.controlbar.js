/*
 * Projekktor II Plugin: Controlbar
 *
 * DESC: Adds a fully features cb element to the player
 * Copyright 2010-2014 Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2015-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    function projekktorControlbar() {}

    projekktorControlbar.prototype = {

        version: '1.2.2',
        reqVer: '1.8.0',
        
        _cTimer: null,
        _lastPos: -1,
        _isDVR: false,
        _noHide: false,
        _sSliderAct: false,
        _vSliderAct: false,

        cb: null,

        controlElements: {},
        controlElementsConfig: {
            'timeleft': null,
            'sec_dur': null,
            'min_dur': null,
            'sec_abs_dur': null,
            'min_abs_dur': null,
            'hr_dur': null,
            'sec_elp': null,
            'min_elp': null,
            'sec_abs_elp': null,
            'min_abs_elp': null,
            'hr_elp': null,
            'sec_rem': null,
            'min_rem': null,
            'sec_abs_rem': null,
            'min_abs_rem': null,
            'hr_rem': null,
            'sec_tip': null,
            'min_tip': null,
            'sec_abs_tip': null,
            'min_abs_tip': null,
            'hr_tip': null,

            'cb': null,

            'playhead': {
                on: null,
                call: null
            },
            'loaded': null, // { on:['touchstart', 'click'], call:'scrubberClk'},
            'golive': [{
                on: ['touchstart', 'click'],
                call: 'goliveClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'scrubber': null, // { on:['touchstart', 'click'], call:'scrubberClk'},
            'scrubbertip': null,
            'scrubberknob': null,
            'scrubberdrag': [{
                on: ['mouseenter', 'touchstart'],
                call: 'scrubberShowTooltip'
            }, {
                on: ['mouseout', 'touchend'],
                call: 'scrubberHideTooltip'
            }, {
                on: ['mousemove', 'touchmove'],
                call: 'scrubberdragTooltip'
            }, {
                on: ['mousedown', 'touchstart'],
                call: 'scrubberdragStartDragListener'
            }],
            'play': [{
                on: ['touchend', 'click'],
                call: 'playClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'pause': [{
                on: ['touchstart', 'click'],
                call: 'pauseClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'stop': [{
                on: ['touchstart', 'click'],
                call: 'stopClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'prev': [{
                on: ['touchstart', 'click'],
                call: 'prevClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'prevC': [{
                on: ['touchstart', 'click'],
                call: 'prevCClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'next': [{
                on: ['touchstart', 'click'],
                call: 'nextClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'nextC': [{
                on: ['touchstart', 'click'],
                call: 'nextCClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'rewind': [{
                on: ['touchstart', 'click'],
                call: 'rewindClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'forward': [{
                on: ['touchstart', 'click'],
                call: 'forwardClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'fsexit': [{
                on: ['touchstart', 'click'],
                call: 'exitFullscreenClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'fsenter': [{
                on: ['touchend', 'click'],
                call: 'enterFullscreenClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'loquality': [{
                on: ['touchstart', 'click'],
                call: 'setQualityClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'hiquality': [{
                on: ['touchstart', 'click'],
                call: 'setQualityClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'vslider': [{
                on: ['touchstart', 'click'],
                call: 'vsliderClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'vmarker': [{
                on: ['touchstart', 'click'],
                call: 'vsliderClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'vknob': {
                on: ['mousedown'],
                call: 'vknobStartDragListener'
            },

            'volumePanel': [{
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }],
            'volume': null,

            'mute': [{
                on: ['touchstart', 'click'],
                call: 'muteClk'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }, {
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'unmute': [{
                on: ['touchstart', 'click'],
                call: 'unmuteClk'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }, {
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'vmax': [{
                on: ['touchstart', 'click'],
                call: 'vmaxClk'
            }, {
                on: ['mouseout'],
                call: 'volumeBtnOut'
            }, {
                on: ['mousemove'],
                call: 'volumeBtnHover'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'open': [{
                on: ['touchstart', 'click'],
                call: 'openCloseClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'close': [{
                on: ['touchstart', 'click'],
                call: 'openCloseClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],
            'loop': [{
                on: ['touchstart', 'click'],
                call: 'loopClk'
            }, {
                on: ['touchend'],
                call: 'touchEnd'
            }],

            'controls': null,
            'title': null,
            'logo': {
                on: ['touchstart', 'click'],
                call: 'logoClk'
            }
        },

        config: {
            /* Plugin: cb - enable/disable fade away of overlayed controls */
            toggleMute: true,
            fadeDelay: 2500,
            showOnStart: false,
            showOnIdle: false,
            hideWhenPaused: false,

            /* cuepoints */
            showCuePoints: true,
            showCuePointsImmediately: true, // should the cuepoint be displayed immediately after current playlist item duration is known or only if the relevant part of the playlist item is buffered and ready to be played
            showCuePointGroups: [],
            minCuePointSize: '2px', // minimal cuepoint size
            cuePointEvents: [
                /* { // Sample global blip events config. You can set individual events for every blip within cuepoint blipEvents object.
                  'events': ['click', 'mouseover'],
                  'handler': function(e){ // the event parameter passed to the event handler has data property which contains:
                                          // pp - reference to the current projekktor instance
                                          // cuepoint - reference to the cuepoint represented by current blip
                                          // any other custom data which was passed inside 'data' property described below
                     e.data.pp.setGotoCuePoint(e.data.cuepoint.id);
                     console.log(e.data.test);
                  },
                  'data': {test:'data test'} // you can add any custom data you want
                 } */
            ],
            /**
             * displays logo on the controlbar
             * You can set the logo config globally for all playlist items in the controlbar plugin config or locally for every playlist item.
             * Playlist item config overwrites the global config.
             */
            logo: {
                /* // Sample global config (per item config follows the same schema).
                src: 'media/logo.png', // URL to your logo image (works fine with SVG too)
                title: 'visit our website', // Title added to the <img> element title and alt attributes.
                link: { // URL to go to after click on the logo [optional].
                    url: 'http://www.projekktor.com',
                    target: '_blank'
                },
                callback: function(player, e){ // Function called after click on the logo [optional]. It works only if the link config isn't present.
                                               // There are two parameters passed to the callback function:
                                               // player - reference to the current projekktor instance
                                               // e - event object
                    alert("projekktor v." + player.getVersion());
                }*/
            },

            onPrevClick: null,
            onNextClick: null,

            /* Default layout */
            controlsTemplate: '<ul class="left"><li><div %{play}></div><div %{pause}></div></li></ul><ul class="right"><li><div %{logo}></div></li><li><div %{fsexit}></div><div %{fsenter}></div></li><li><div %{settingsbtn}></div></li><li><div %{tracksbtn}></div></li><li><div %{vmax}></div></li><li><div %{vslider}><div %{vmarker}></div><div %{vknob}></div></div></li><li><div %{mute}></div><div %{unmute}></div></li><li><div %{timeleft}>%{hr_elp}:%{min_elp}:%{sec_elp} | %{hr_dur}:%{min_dur}:%{sec_dur}</div></li><li><div %{nextC}></div></li><li><div %{prevC}></div></li></ul><ul class="bottom"><li><div %{scrubber}><div %{loaded}></div><div %{playhead}></div><div %{scrubberknob}></div><div %{scrubberdrag}></div></div></li></ul><div %{scrubbertip}>%{hr_tip}:%{min_tip}:%{sec_tip}</div>'
        },

        initialize: function () {

            var ref = this,
                playerHtml = this.playerDom.html(),
                useTemplate = true,
                classPrefix = this.pp.getNS();

            // check if ANY control element already exists
            Object.keys(this.controlElementsConfig).some(function (controlElementName) {
                if (playerHtml.match(new RegExp(classPrefix + controlElementName, 'gi'))) {
                    useTemplate = false;
                    return true;
                }
            });

            if (useTemplate) {
                this.cb = this.applyToPlayer($(('<div/>')).addClass('controls'));
                this.applyTemplate(this.cb, this.getConfig('controlsTemplate'));
            } else {
                this.cb = this.playerDom.find("." + classPrefix + 'controls');
            }

            // find (inter)active elements
            Object.keys(this.controlElementsConfig).forEach(function (controlElementName) {
                ref.controlElements[controlElementName] = $(ref.playerDom).find('.' + classPrefix + controlElementName);
                $p.utils.blockSelection($(ref.controlElements[controlElementName]));
            });

            this.addGuiListeners();
            this.showcb();
            this.pluginReady = true;
        },

        /* parse and apply controls dom-template */
        applyTemplate: function (dest, templateString) {
            var classPrefix = this.pp.getNS();

            // apply template string if required:
            if (templateString) {
                // replace tags by class directive
                var tagsUsed = templateString.match(/\%{[a-zA-Z_]*\}/gi);
                if (tagsUsed != null) {
                    $.each(tagsUsed, function (key, value) {
                        var cn = value.replace(/\%{|}/gi, '');
                        if (value.match(/\_/gi)) {
                            // replace with span markup
                            templateString = templateString.replace(value, '<span class="' + classPrefix + cn + '"></span>');
                        } else {
                            templateString = templateString.replace(value, 'class="' + classPrefix + cn + '"' + $p.utils.i18n(' aria-label="%{' + cn + '}" title="%{' + cn + '}" '));
                        }
                    });
                }

                dest.html(templateString);
            }
        },

        updateDisplay: function () {
            var state = this.pp.getState();

            // nothing to do
            if (this.getConfig('controls') === false) {
                this.hidecb();
                return;
            }

            // prev / next button
            if (this.getConfig('disallowSkip')) {
                this._active('prev', false);
                this._active('prevC', false);
                this._active('next', false);
                this._active('nextC', false);
            } else {
                this._active('prev', this.pp.getPreviousItem() !== false);
                this._active('prevC', typeof this.config.onPrevClick === 'function');
                this._active('next', this.pp.getNextItem() !== false);
                this._active('nextC', typeof this.config.onNextClick === 'function');
            }

            // play / pause button
            if (this.getConfig('disablePause')) {
                this._active('play', false);
                this._active('pause', false);
            } else {
                if (state === 'PLAYING') {
                    this.drawPauseButton();
                }
                if (state === 'PAUSED') {
                    this.drawPlayButton();
                }
                if (state === 'IDLE') {
                    this.drawPlayButton();
                }    
            }

            // stop button
            this._active('stop', state !== 'IDLE');



            // rewind & forward
            this._active('forward', state !== 'IDLE');
            this._active('rewind', state !== 'IDLE');


            // fullscreen button
            if (this.pp.getIsFullscreen() === true) {
                this.drawExitFullscreenButton();
            } else {
                this.drawEnterFullscreenButton();
            }

            if (!this.pp.getFullscreenEnabled()) {
                this._active('fsexit', false);
                this._active('fsenter', false);
            }


            // loop button
            this._active('loop', true);
            this.controlElements.loop
                .addClass(this.pp.getConfig('loop') ? 'on' : 'off')
                .removeClass(!this.pp.getConfig('loop') ? 'on' : 'off');

            // hd / sd toggl
            this.displayQualityToggle();

            // init time display
            this.displayTime();

            // update progress
            this.displayProgress();

            // init volume display
            this.displayVolume(this.pp.getVolume());
        },

        deconstruct: function () {
            this.pluginReady = false;
            $.each(this.controlElements, function () {
                $(this).off();
            });
            $.each(this._appliedDOMObj, function () {
                $(this).off();
            });
        },


        /* assign listener methods to controlbar elements */
        addGuiListeners: function () {
            var ref = this;

            // if (!this.getConfig('controls')) return;

            $.each(this.controlElementsConfig, function (key, elmCfg) {
                if (elmCfg == null) {
                    return true;
                }

                if (!(elmCfg instanceof Array)) {
                    elmCfg = [elmCfg];
                }

                for (var subset = 0; subset < elmCfg.length; subset++) {

                    if (elmCfg[subset].on == null) {
                        continue;
                    }

                    $.each(elmCfg[subset].on, function (evtKey, eventName) {

                        // thanx to FF3.6 this approach became a little complicated:
                        var isSupported = ("on" + eventName in window.document),
                            callback = elmCfg[subset].call;

                        if (!isSupported) {
                            var el = document.createElement('div');
                            el.setAttribute("on" + eventName, 'return;');
                            isSupported = (typeof el["on" + eventName] == 'function');
                        }

                        if (isSupported) {
                            ref.controlElements[key].on(eventName, function (event) {
                                ref.clickCatcher(event, callback, ref.controlElements[key]);
                            });

                        }

                    });
                }
                return true;
            });
            this.cb.mousemove(function (event) {
                ref.controlsFocus(event);
            });
            this.cb.mouseout(function (event) {
                ref.controlsBlur(event);
            });
        },

        /* generic click handler for all controlbar buttons */
        clickCatcher: function (evt, callback, element) {
            //evt.stopPropagation();
            evt.preventDefault();

            this[callback](evt, element);

            return false;
        },


        touchEnd: function () {
            var ref = this;
            this._cTimer = setTimeout(function () {
                ref.hidecb();
            }, this.getConfig('fadeDelay'));
            this._noHide = false;
        },


        /*******************************
        DOM Manipulations
        *******************************/
        drawTitle: function () {
            this.controlElements['title'].html(this.getConfig('title', ''));
        },

        displayLogo: function () {
            var logoConfig = this.pp.getConfig('logo') || this.getConfig('logo'),
                logoElement = this.controlElements['logo'],
                img;

            if (logoElement && logoConfig && logoConfig.src) {
                img = $('<img>')
                    .attr({
                        src: logoConfig.src,
                        alt: logoConfig.title,
                        title: logoConfig.title
                    });

                if ((logoConfig.link && logoConfig.link.url) || typeof logoConfig.callback == 'function') {
                    img.css({
                        cursor: 'pointer'
                    });
                }

                logoElement.empty().append(img);
                this._active('logo', true);
            } else {
                this._active('logo', false);
            }
        },

        canHide: function () {
            var state = this.pp.getState(),
                result = this.cb === null ||
                this._noHide ||
                (state === 'IDLE' && this.getConfig('showOnIdle')) ||
                (state === 'PAUSED' && !this.getConfig('hideWhenPaused'));

            return !result;
        },

        canShow: function () {
            var state = this.pp.getState(),
                result = this.cb === null ||
                !this.getConfig('controls') ||
                this.pp.getHasGUI() ||
                ('ERROR|COMPLETED|DESTROYING'.indexOf(state) > -1) ||
                ('AWAKENING|STARTING'.indexOf(state) > -1 && !this.getConfig('showOnStart')) ||
                (state === 'IDLE' && !this.getConfig('showOnIdle')) ||
                false;

            return !result;
        },

        hidecb: function () {
            var wasVisible = this.cb.hasClass('active');

            clearTimeout(this._cTimer);

            // don't hide
            if (!this.canHide()) {
                return;
            }

            this.cb.removeClass('active').addClass('inactive');

            if (wasVisible) {
                this.sendEvent('hide', this.cb);
            }
        },

        showcb: function () {
            var ref = this,
                isVisible = this.cb.hasClass('active');

            // always clear timeout, stop animations
            clearTimeout(this._cTimer);
            this._cTimer = setTimeout(
                function () {
                    ref.hidecb();
                }, this.getConfig('fadeDelay')
            );

            if (!this.canShow()) {
                return;
            }

            // show up:
            if (!isVisible) {
                this.cb.removeClass('inactive').addClass('active');
                this.sendEvent('show', this.cb);
            }

            this.updateDisplay();
        },

        displayTime: function (pct, dur, pos) {
            if (this.pp.getHasGUI()) {
                return;
            }

            var percent = ((pct || this.pp.getLoadPlaybackProgress() || 0) * 10) / 10,
                duration = dur || this.pp.getDuration() || 0,
                position = pos || this.pp.getPosition() || 0,
                times;

            // limit updates to one per second
            if (Math.abs(this._lastPos - position) >= 1) {

                // check if there is anything to display
                if (duration === 0) { // hide time display elements e.g. live streams on Android
                    this._active('scrubber', false);
                    this._active('timeleft', false);
                } else { // show time display elements
                    this._active('scrubber', true);
                    this._active('timeleft', true);
                }

                times = $.extend({}, this._clockDigits(duration, 'dur'), this._clockDigits(position, 'elp'), this._clockDigits(duration - position, 'rem'));

                // update scrubber:
                this.controlElements['playhead'].css({
                    width: percent + "%"
                });
                this.controlElements['scrubberknob'].css({
                    left: percent + "%"
                });

                // update last position value
                this._lastPos = position;

                // update numeric displays
                for (var key in this.controlElements) {
                    if(this.controlElements.hasOwnProperty(key)){
                        if (key == 'cb') {
                            break;
                        }

                        if (times[key]) {
                            $.each(this.controlElements[key], function () {
                                $(this).html(times[key]);
                            });
                        }
                    }
                }
            }

        },

        displayProgress: function () {
            var percent = Math.round(this.pp.getLoadProgress() * 10) / 10,
                lastUpdatedPercent = this.controlElements['loaded'].data('pct') || undefined;

            // limit updates to 1 per 5%
            if (lastUpdatedPercent === undefined || lastUpdatedPercent !== percent) {
                this.controlElements['loaded'].data('pct', percent).css("width", percent + "%");
            };
        },

        displayVolume: function (volume) {

            if (this._vSliderAct == true) {
                return;
            }
            if (volume == null) {
                return;
            }    

            var fixed = this.getConfig('fixedVolume') || (this.pp.playerModel && this.pp.playerModel._fixedVolume),
                toggleMute = (this.controlElements['mute'].hasClass('toggle') || this.controlElements['unmute'].hasClass('toggle') || this.getConfig('toggleMute')),
                // check if the volume is in the proper range and correct its value if it's not
                volume = volume > 1 ? 1 : volume,
                volume = volume < 0 ? 0 : volume;

            // hide volume mess in case volume is fixed
            this._active('mute', !fixed);
            this._active('unmute', !fixed);
            this._active('vmax', !fixed);
            this._active('vknob', !fixed);
            this._active('vmarker', !fixed);
            this._active('vslider', !fixed);

            if (fixed) {
                return;
            }

            // make controls visible in order to allow dom manipulations
            // this.cb.stop(true, true).show();
            var vslider = this.controlElements['vslider'],
                vmarker = this.controlElements['vmarker'],
                vknob = this.controlElements['vknob'],
                orientation = vslider.width() > vslider.height() ? "horizontal" : "vertical";

            switch (orientation) {
                case "horizontal":

                    vmarker.css('width', volume * 100 + "%");
                    vknob.css('left', Math.round((vslider.width() * volume) - (vknob.width() * volume)) + "px");

                    break;

                case "vertical":

                    vmarker.css('height', volume * 100 + "%");
                    vknob.css('bottom', Math.round((vslider.height() * volume) - (vknob.height() * volume)) + "px");

                    break;
            }

            // "li" hack
            var lis = this.controlElements['volume'].find('li'),
                set = lis.length - Math.ceil((volume * 100) / lis.length);

            for (var i = 0; i <= lis.length; i++) {
                if (i >= set) {
                    $(lis[i]).addClass('active');
                }
                else {
                    $(lis[i]).removeClass('active');
                }
            }


            if (toggleMute) {
                switch (parseFloat(volume)) {
                    case 0:
                        this._active('mute', false);
                        this._active('unmute', true);
                        break;

                    default:
                        this._active('mute', true);
                        this._active('unmute', false);
                        break;
                }
            }
        },

        displayCuePoints: function (immediately) {

            if (!this.getConfig('showCuePoints')){
                return;
            }

            var ref = this,
                prefix = this.pp.getNS(),
                duration = this.pp.getDuration();

            ref.controlElements['scrubber'].children().remove('.' + prefix + 'cuepoint');

            $.each(this.pp.getCuePoints(this.pp.getItemId(), true) || [], function () {

                // display cuepoins only from given groups or all cuepoints if there are no specyfic groups defined (showCuePointGroups array is empty)
                if (ref.getConfig('showCuePointGroups').length && ref.getConfig('showCuePointGroups').indexOf(this.group) == -1) {
                    return;
                }

                var blipWidth = this.on != this.off ? (((this.off - this.on) / duration) * 100) + '%' : ref.getConfig('minCuePointSize'),
                    blipPos = (this.on / duration) * 100,
                    blip = $(document.createElement('div'))
                    .addClass(prefix + 'cuepoint')
                    .addClass(prefix + 'cuepoint_group_' + this.group)
                    .addClass(prefix + 'cuepoint_' + this.id)
                    .addClass(immediately ? 'active' : 'inactive')
                    .css('left', blipPos + "%")
                    .css('width', blipWidth),
                    blipEvents = ref.config.cuePointEvents.concat(this.blipEvents);

                if (this.title != '') {
                    blip.attr('title', this.title);
                }

                if (!immediately) {
                    this.addListener('unlock', function () {
                        $(blip).removeClass('inactive').addClass('active');
                        ref._bindCuePointBlipEvents(blip, blipEvents, {
                            pp: ref.pp,
                            cuepoint: this
                        });
                    });
                } else {
                    ref._bindCuePointBlipEvents(blip, blipEvents, {
                        pp: ref.pp,
                        cuepoint: this
                    });
                }

                ref.controlElements['scrubber'].append(blip);

            });

        },

        drawPauseButton: function (event) {
            this._active('pause', true);
            this._active('play', false);
        },

        drawPlayButton: function (event) {
            this._active('pause', false);
            this._active('play', true);
        },


        drawEnterFullscreenButton: function (event) {
            this._active('fsexit', false);
            this._active('fsenter', true);
        },

        drawExitFullscreenButton: function (event) {
            this._active('fsexit', true);
            this._active('fsenter', false);
        },

        displayQualityToggle: function (qual) {

            var qualsCfg = this.getConfig('playbackQualities'),
                qualsItm = this.pp.getPlaybackQualities(),
                classPrefix = this.pp.getNS(),
                best = [];

            // off
            if (qualsItm.length < 2 || qualsCfg.length < 2) {
                this.controlElements['loquality'].removeClass().addClass('inactive').addClass(classPrefix + 'loquality').data('qual', '');
                this.controlElements['hiquality'].removeClass().addClass('inactive').addClass(classPrefix + 'hiquality').data('qual', '');
                return;
            }

            // get two best variants
            qualsCfg.sort(function (a, b) {
                return a.minHeight - b.minHeight;
            });
            for (var i = qualsCfg.length; i--; i > 0) {
                if ($.inArray(qualsCfg[i].key, qualsItm) > -1){
                    best.push(qualsCfg[i].key);
                }
                if (best.length > 1) {
                    break;
                }
            }

            this.cb.addClass('qualities');
            if (best[0] == this.pp.getPlaybackQuality()) {
                this._active('loquality', true).addClass('qual' + best[1]).data('qual', best[1]);
                this._active('hiquality', false).addClass('qual' + best[0]).data('qual', best[0]);
            } else {
                this._active('loquality', false).addClass('qual' + best[1]).data('qual', best[1]);
                this._active('hiquality', true).addClass('qual' + best[0]).data('qual', best[0]);
            }
        },


        /*******************************
        Player Event Handlers
        *******************************/
        itemHandler: function (data) {

            $(this.cb).find('.' + this.pp.getNS() + 'cuepoint').remove();
            this._lastPos = -1;
            this.updateDisplay();
            this.drawTitle();
            this.displayLogo();
            this.pluginReady = true;
        },

        startHandler: function () {
            if (this.getConfig('showOnStart') === true) {
                this.showcb();
            } else {
                this.hidecb();
            }
        },

        readyHandler: function (data) {
            this.showcb();
            this.pluginReady = true;
        },

        stateHandler: function (state) {
            this.updateDisplay();

            if ('STOPPED|AWAKENING|IDLE|COMPLETED'.indexOf(state) > -1) {
                this.displayTime(0, 0, 0);
                this.displayProgress(0);
            }

            if ('PLAYING|STOPPED|COMPLETED|DESTROYING'.indexOf(state) > -1) {
                return;
            }

            if ('ERROR'.indexOf(state) > -1) {
                this._noHide = false;
            }

            this.showcb();

            this.displayProgress();
        },

        scheduleModifiedHandler: function () {
            if (this.pp.getState() === 'IDLE') {
                return;
            }
            this.updateDisplay();
            this.displayTime();
            this.displayProgress();
        },

        volumeHandler: function (value) {
            this.displayVolume(value);
        },

        progressHandler: function (obj) {
            this.displayProgress();
        },

        timeHandler: function (obj) {
            this.displayTime();
            this.displayProgress();
        },

        qualityChangeHandler: function (qual) {
            this.displayQualityToggle(qual);
        },

        streamTypeChangeHandler: function (streamType) {
            if (streamType === 'dvr' || streamType === 'live') {
                this._isDVR = true;
                this.setActive(this.controlElements['golive'], true);
            } else {
                this._isDVR = false;
                this.setActive(this.controlElements['golive'], false);
            }
        },

        isLiveHandler: function (islive) {
            if (islive) {
                this.controlElements['golive'].addClass('on').removeClass('off');
            } else {
                this.controlElements['golive'].addClass('off').removeClass('on');
            }
        },

        fullscreenHandler: function (inFullscreen) {

            this._noHide = false;
            this._vSliderAct = false;

            if (!this.getConfig('controls')) {
                return;
            }
            if (!this.pp.getFullscreenEnabled()) {
                return;
            }

            if (inFullscreen) {
                this.cb.addClass('fullscreen');
                this.drawExitFullscreenButton();
            } else {
                this.cb.removeClass('fullscreen');
                this.drawEnterFullscreenButton();
            }
        },

        durationChangeHandler: function () {
            if (this.pp.getDuration() != 0) {
                this.displayCuePoints(this.getConfig('showCuePointsImmediately'));
            }
        },

        cuepointsSyncHandler: function (cuepoints) {
            if (this.pp.getDuration() != 0) {
                this.displayCuePoints(this.getConfig('showCuePointsImmediately'));
            }
        },

        errorHandler: function (value) {
            this._noHide = false;
            this.hidecb();
        },

        leftclickHandler: function () {
            this.mouseleaveHandler();
        },

        focusHandler: function (evt) {
            this.showcb();
        },

        mouseenterHandler: function (evt) {
            this.showcb();
        },

        mousemoveHandler: function (evt) {
            if (this.pp.getState('STARTING')) {
                return;
            }
            this.showcb();
        },

        mouseleaveHandler: function () {},

        mousedownHandler: function (evt) {
            this.showcb();
        },

        /*******************************
        ControlUI Event LISTENERS
        *******************************/
        controlsFocus: function (evt) {

            this._noHide = true;
        },

        controlsBlur: function (evt) {
            this._noHide = false;
        },

        setQualityClk: function (evt) {
            this.pp.setPlaybackQuality($(evt.currentTarget).data('qual'));
        },

        goliveClk: function (evt) {
            this.pp.setSeek(-1);
        },

        playClk: function (evt) {
            this.pp.setPlay();
        },

        pauseClk: function (evt) {
            this.pp.setPause();
        },

        stopClk: function (evt) {
            this.pp.setStop();
        },

        startClk: function (evt) {
            this.pp.setPlay();
        },

        controlsClk: function (evt) {},

        prevClk: function (evt) {
            this.pp.setActiveItem('previous');
        },

        nextClk: function (evt) {
            this.pp.setActiveItem('next');
        },

        prevCClk: function (evt) {
            this.config.onPrevClick();
        },

        nextCClk: function (evt) {
            this.config.onNextClick();
        },

        forwardClk: function (evt) {
            this.pp.setPlayhead('+10');
        },

        rewindClk: function (evt) {
            this.pp.setPlayhead('-10');
        },

        muteClk: function (evt) {
            this.pp.setMuted(true);
        },

        unmuteClk: function (evt) {
            this.pp.setMuted(false);
        },

        vmaxClk: function (evt) {
            this.pp.setVolume(1);
        },

        enterFullscreenClk: function (evt) {
            this.pp.setFullscreen(true);
        },

        exitFullscreenClk: function (evt) {
            this.pp.setFullscreen(false);
        },

        loopClk: function (evt) {
            this.pp.setLoop($(evt.currentTarget).hasClass('inactive') || false);
            this.updateDisplay();
        },

        vmarkerClk: function (evt) {
            this.vsliderClk(evt);
        },

        openCloseClk: function (evt) {
            var ref = this;
            $($(evt.currentTarget).attr('class').split(/\s+/)).each(function (key, value) {
                if (value.indexOf('toggle') === -1) {
                    return;
                }
                ref.playerDom.find('.' + value.substring(6)).slideToggle('slow', function () {
                    ref.pp.setSize();
                });
                ref.controlElements['open'].toggle();
                ref.controlElements['close'].toggle();
            });
        },

        logoClk: function (evt) {
            var logoConfig = this.pp.getConfig('logo') || this.getConfig('logo');
            if (logoConfig) {
                if (logoConfig.link && logoConfig.link.url) {
                    window.open(logoConfig.link.url, logoConfig.link.target);
                } else if (typeof logoConfig.callback === 'function') {
                    logoConfig.callback(this.pp, evt);
                }
            }
        },

        volumeBtnHover: function (evt) {
            clearTimeout(this._outDelay);
            this.setActive(this.controlElements['volumePanel'], true);
        },

        volumeBtnOut: function (evt, elm) {
            var ref = this;
            if (evt.currentTarget != elm.get(0)) {
                return;
            }    
            if (evt.relatedTarget == elm.get(0)) {
                return;
            }
            this._outDelay = setTimeout(function () {
                ref.setActive(ref.controlElements['volumePanel'], false);
            }, 100);
        },

        vsliderClk: function (evt) {
            if (this._vSliderAct == true) {
                return;
            }


            var slider = $(this.controlElements['vslider']),
                orientation = slider.width() > slider.height() ? 'hor' : 'vert',
                totalDim = (orientation == 'hor') ? slider.width() : slider.height(),
                pageX = (evt.originalEvent.touches) ? evt.originalEvent.touches[0].pageX : evt.pageX,
                pageY = (evt.originalEvent.touches) ? evt.originalEvent.touches[0].pageY : evt.pageY,
                requested = (orientation == 'hor') ? pageX - slider.offset().left : pageY - slider.offset().top,
                result = 0;

            if (requested < 0 || isNaN(requested) || requested == undefined) {
                result = 0;
            } else {
                result = (orientation == 'hor') ? (requested / totalDim) : 1 - (requested / totalDim);
            }

            this.pp.setVolume(result);
        },

        scrubberShowTooltip: function (event) {
            var pointerPosition = this._getPointerPosition(event);

            if (this.pp.getDuration() === 0) {
                return;
            }
            clearTimeout(this._cTimer);

            this.updateScrubberTooltip(pointerPosition);
        },

        scrubberHideTooltip: function (event) {
            this.setActive(this.controlElements['scrubbertip'], false);
        },

        scrubberdragTooltip: function (event) {
            
            var pointerPosition = this._getPointerPosition(event);

            // IE amd Chrome issues (mouseenter,mouseleave)
            if (this.pp.getDuration() === 0) {
                return;
            }

            this.updateScrubberTooltip(pointerPosition);
        },

        updateScrubberTooltip: function (pointerPosition) {
            var ref = this,
                slider = $(this.controlElements['scrubberdrag'][0]),
                tip = $(this.controlElements['scrubbertip']),
                newPos = pointerPosition.clientX - slider.offset().left - (tip.outerWidth() / 2),
                timeIdx = this.pp.getDuration() / 100 * ((pointerPosition.clientX - slider.offset().left) * 100 / slider.width()),
                times = this._clockDigits(timeIdx, 'tip', 0, this.pp.getDuration());

            this.setActive(this.controlElements['scrubbertip'], true);

            Object.keys(times).forEach(function (key) {
                if (ref.controlElements.hasOwnProperty(key)) {
                    $(ref.controlElements[key]).html(times[key]);
                }
            });

            newPos = (newPos < 0) ? 0 : newPos;
            newPos = (newPos > slider.width() - tip.outerWidth()) ? slider.width() - tip.outerWidth() : newPos;

            tip.css({
                left: newPos + "px"
            });
        },

        updateScrubberKnobAndPlayhead: function (pointerPosition) {
            var slider = $(this.controlElements['scrubberdrag'][0]),
                knob = $(this.controlElements['scrubberknob']),
                playhead = $(this.controlElements['playhead']),
                newPos = pointerPosition.clientX - slider.offset().left;

            newPos = (newPos < 0) ? 0 : newPos;
            newPos = newPos / slider.width() * 100;
            newPos = (newPos > 100) ? 100 : newPos;

            knob.css({
                left: newPos + "%"
            });
            playhead.css({
                width: newPos + "%"
            });
        },

        scrubberdragStartDragListener: function (event) {

            if (this.getConfig('disallowSkip') === true) {
                return;
            }

            this._sSliderAct = true;

            var ref = this,
                jqEventNS = '.' + this.pp.getNS() + 'scrubberdrag',
                slider = ref.controlElements['scrubberdrag'],
                loaded = ref.controlElements['loaded'],
                lastPointerPosition = this._getPointerPosition(event),
                seekDelayTimer,

                applyValue = function (pointerPosition) {

                    var newPos = Math.abs(slider.offset().left - pointerPosition.clientX);

                    newPos = (newPos > slider.width()) ? slider.width() : newPos;
                    newPos = (newPos > loaded.width()) ? loaded.width() : newPos;
                    newPos = (newPos < 0) ? 0 : newPos;
                    newPos = Math.abs(newPos / slider.width()) * ref.pp.getDuration();

                    if (newPos > 0) {
                        ref.updateScrubberKnobAndPlayhead(pointerPosition);
                        // delay the seek call
                        clearInterval(seekDelayTimer);
                        seekDelayTimer = setTimeout(function() {
                            ref.pp.setPlayhead(newPos);
                        }, 100);
                    }

                },

                pointerUp = function (evt) {
                    $(window).off(jqEventNS);

                    applyValue(lastPointerPosition);

                    ref._sSliderAct = false;
                    return false;
                },

                pointerMove = function (evt) {
                    lastPointerPosition = ref._getPointerPosition(evt);
                    
                    clearTimeout(ref._cTimer);
                    applyValue(lastPointerPosition);
                    return false;
                };
                
                if($p.features.touch){
                    $(window).on('touchmove' + jqEventNS, pointerMove);
                    $(window).on('touchend' + jqEventNS, pointerUp);
                }
                else {
                    $(window).on('mousemove' + jqEventNS, pointerMove);
                    $(window).on('mouseup' + jqEventNS, pointerUp);
                }

            applyValue(lastPointerPosition);
        },

        vknobStartDragListener: function (event, domObj) {
            this._vSliderAct = true;

            var ref = this,

                jqEventNS = '.' + this.pp.getNS() + 'vknob', 
                vslider = ref.controlElements['vslider'],
                vmarker = ref.controlElements['vmarker'],
                vknob = ref.controlElements['vknob'],

                orientation = vslider.width() > vslider.height() ? "horizontal" : "vertical",

                volume = 0,

                mouseUp = function (mouseUpEvent) {
                    $(window).off(jqEventNS);

                    ref._vSliderAct = false;

                    return false;
                },

                mouseMove = function (dragEvent) {
                    clearTimeout(ref._cTimer);

                    var newXPos = (dragEvent.clientX - vslider.offset().left),
                        newXPos = (newXPos > vslider.width()) ? vslider.width() : newXPos,
                        newXPos = (newXPos < 0) ? 0 : newXPos,

                        newYPos = (dragEvent.clientY - vslider.offset().top),
                        newYPos = (newYPos > vslider.height()) ? vslider.height() : newYPos,
                        newYPos = (newYPos < 0) ? 0 : newYPos;



                    switch (orientation) {
                        case "horizontal":
                            volume = Math.abs(newXPos / vslider.width());

                            vmarker.css('width', volume * 100 + "%");
                            vknob.css('left', Math.round((vslider.width() * volume) - (vknob.width() * volume)) + "px");

                            break;

                        case "vertical":
                            volume = 1 - Math.abs(newYPos / vslider.height());

                            vmarker.css('height', volume * 100 + "%");
                            vknob.css('bottom', Math.round((vslider.height() * volume) - (vknob.height() * volume)) + "px");

                            break;
                    }

                    ref.pp.setVolume(volume);
                    return false;
                };

                $(window).on('mousemove' + jqEventNS, mouseMove);
                $(window).on('mouseup' + jqEventNS, mouseUp);
        },

        /*******************************
            GENERAL HELPERS
        *******************************/
        _active: function (elmName, on) {
            var dest = this.controlElements[elmName];
            if (on == true) {
                dest.addClass('active').removeClass('inactive');
            } else {
                dest.addClass('inactive').removeClass('active');
            }
            return dest;
        },

        /* convert a num of seconds to a digital-clock like display string */
        _clockDigits: function (secs, postfix, minValSecs, maxValSecs) {

            if (isNaN(secs) || secs === undefined) {
                secs = 0;
            }

            if(minValSecs !== undefined){
                secs = secs < minValSecs ? minValSecs : secs;
            }

            if(maxValSecs !== undefined){
                secs = secs > maxValSecs ? maxValSecs : secs;
            }

            var hr = Math.floor(secs / (60 * 60)),
                divisor_for_minutes = secs % (60 * 60),
                min = Math.floor(divisor_for_minutes / 60),
                min_abs = hr * 60 + min,
                divisor_for_seconds = divisor_for_minutes % 60,
                sec = Math.floor(divisor_for_seconds),
                sec_abs = secs,
                result = {};

            result['min_' + postfix] = (min < 10) ? "0" + min : min;
            result['min_abs_' + postfix] = (min_abs < 10) ? "0" + min_abs : min_abs;
            result['sec_' + postfix] = (sec < 10) ? "0" + sec : sec;
            result['sec_abs_' + postfix] = (sec_abs < 10) ? "0" + sec_abs : sec_abs;
            result['hr_' + postfix] = (hr < 10) ? "0" + hr : hr;

            return result;
        },
        _bindCuePointBlipEvents: function (blip, events, data) {
            if (events.length) { // bind events if there are some
                for (var i = 0; i < events.length; i++) {
                    var e = events[i]['events'].join(' '),
                        d = $.extend({}, events[i]['data'], data) || {},
                        h = (typeof events[i]['handler'] == 'function' ? events[i]['handler'] : function (e) {});
                    blip.on(e, d, h);
                }
            } else { // otherwise make the blip 'invisible' for mouse events (works everywhere but IE up to 10)
                blip.css('pointer-events', 'none');
            }
        },
        _getPointerPosition: function(event){

            var positionSource = {};

            if(event) {

                if(('touches' in event.originalEvent) && event.originalEvent.touches.length > 0) {
                    positionSource = event.originalEvent.touches[0];
                }
                else {
                    positionSource = event;
                }

                return {
                    clientX: positionSource.clientX,
                    clientY: positionSource.clientY,
                    pageX: positionSource.pageX,
                    pageY: positionSource.pageY
                };
            }
        }
    };

    $p.plugins.projekktorControlbar = projekktorControlbar;
}(window, document, jQuery, projekktor));
