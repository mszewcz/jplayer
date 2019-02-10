/*
 * Projekktor II Plugin: Tracking
 * VERSION: 1.1.9
 *
 * DESC: Allows tracking of all player events and states plus some additional client information
 * to any pixelImg based tracker.
 *
 * Copyright 2013, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * all rights reserved
 * Copyright 2014-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 * all rights reserved
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorTracking = function () {};

    projekktorTracking.prototype = {
        version: '1.1.9',
        reqVer: '1.8.1',
        sessionId: null,
        pixelSeqCount: 0,
        sessionStartTime: 0,
        userStartTime: new Date(),
        continuousDurations: [],
        totalPlaybackDuration: 0,
        error: {
            code: 0,
            message: 'unknown error'
        },
        _trackThis: {},
        _data: {},
        _usageDuration: 0,
        _usageDurationOffset: 0,
        _lastPos: -1,
        config: {
            permanentUuid: false,
            respectDNT: false,
            track: []
        },
        _getConstants: function () {

            var pltfrms = this.pp.getSupportedPlatformsGlobal(),
                pltfrm = this.pp.getPlatform();

            return {
                uid: this.getTrackingId(), // player's tracking id (via config)
                sid: this.sessionId, // a unique session id
                sst: this.sessionStartTime.getTime(), // session start time (timestamp)
                plyid: this.pp.getId(), // player's DOM id
                r: String(Math.random()).slice(2, 8), // some random string
                url: this.cleanUrl(window.location.href), // page location
                ref: this.cleanUrl(window.location.href), // alias page location
                pltfrms: pltfrms, // available platforms/mimeTypes on client
                pltfrm: pltfrm, // available platforms on client
                res: screen.width + 'x' + screen.height, // client's screen dims
                ua: $p.userAgent.string
            };
        },
        _getVariables: function (error) {
            var now = new Date(),
                isLive = (this.pp.getConfig('streamType').indexOf('dvr') > -1 || this.pp.getConfig('streamType').indexOf('live') > -1);

            return {
                cat: this.pp.getItem().cat, // clip category (via config, default "clip")
                dur: this.pp.getDuration(), // clip duration in seconds
                durms: this.pp.getDuration() * 1000, // clip duration in milliseconds
                err: (error) ? 1 : 0, // is error
                errcode: this.error.code, // error code
                errmsg: this.error.message, // error message
                fs: this.pp.getIsFullscreen(), // is in fullscreen
                h: now.getHours(), // IQ TEST
                m: now.getMinutes(), // IQ TEST
                mpos: this.pp.getMaxPosition(), // current playhead position in seconds
                mposms: this.pp.getMaxPosition() * 1000, // current playhead position in milli-seconds
                mf: this.pp.getMediaType().split('/')[1], // media type (audio/video)
                mt: this.pp.getMediaType().split('/')[0], // media format (mp4/webm/ogg ...)
                mid: this.pp.getItemId(), // media id (via config)
                midx: this.pp.getItemIdx(), // media idx (0=first)
                mod: this.pp.getModel(), // media's playback model
                murl: this.pp.getSource() || '', // media URL
                mcontdur: Math.max.apply(Math, this.continuousDurations.concat(this._usageDuration) || []), // max. continuous media consume
                mlive: isLive, // is media live or VOD
                pstate: this.pp.getState(), // current player state
                pver: this.pp.getVersion(), // player version
                pos: this.pp.getPosition(), // current playhead position in seconds
                posms: this.pp.getPosition() * 1000, // current playhead position in milli-seconds
                rnd: $p.utils.randomId(8), // random string
                seq: this.pixelSeqCount, // pixel sequence # per session
                s: now.getSeconds(), // IQ TEST
                sdur: now.getTime() - this.sessionStartTime.getTime(), // session duration (milliseconds)
                udur: now.getTime() - this.userStartTime.getTime(), // session duration (milliseconds)
                udurnet: now.getTime() - this.userStartTime.getTime(), // session duration (milliseconds)
                title: this.pp.getConfig('title'), // item title (via config)
                tpdur: this.totalPlaybackDuration,
                ts: now.getTime() // timestamp of NOW
            };
        },
        initialize: function () {
            this.pluginReady = true;
            this.sessionId = this._uuid();
            this.pixelSeqCount = 0;
            this.sessionStartTime = new Date();
        },
        itemHandler: function () {

            var ref = this,
                dnt = navigator.doNotTrack || navigator.msDoNotTrack;

            // clean prior mess
            this.removeTrackingPixels();
            this._trackThis = {};

            // init usage stats counting
            this.continuousDurations = [];
            this._usageDuration = 0;
            this._usageDurationOffset = 0;
            this.totalPlaybackDuration = 0;

            // respect donottrack
            if (this.getConfig('respectDNT') === true && (dnt === 'yes' || dnt === '1')) {
                return;
            }

            this.pluginReady = false;

            // gather tracking requests from config
            $.each(this.getConfig('track'), function () {
                // parse URL
                var url = this.url || null,
                    post = this.post || null,
                    cat = this.cat || '*',
                    callback = this.callback || null;

                if (ref._trackThis[cat] == null) {
                    ref._trackThis[cat] = {};
                }

                $.each(this.events, function (key, value) {

                    // buffer / state event?
                    if (ref._trackThis[cat][value] == null) {
                        ref._trackThis[cat][value] = [];
                    }

                    ref._trackThis[cat][value].push({
                        url: url,
                        post: post,
                        callback: callback
                    });
                });

                return true;
            });

            this.pluginReady = true;
        },
        eventHandler: function (event, value, player) {

            if ($.isEmptyObject(this._trackThis)) {
                return;
            }

            var evt = event,
                evtPartsArray = [],
                evtTempArray = [],
                ref = this,
                itemCat = this.pp.getItem().cat;

            switch (event) {
                case 'state':
                    evt = event + "." + value.toLowerCase();
                    switch (value) {
                        case 'AWAKENING':
                            this.userStartTime = new Date();
                            break;
                        case 'COMPLETED':
                            // update usage stats on complete
                            this.continuousDurations.push(this._usageDuration);
                            this.totalPlaybackDuration += this._usageDuration;
                            break;
                    }
                    break;
                case 'buffering':
                    evt = event + "." + value.toLowerCase();
                    break;
                case 'seek':
                    if (isNaN(value)) { // temp V1.2.31 bug workaround
                        evt = event + "." + value.toLowerCase();

                        if (value == 'SEEKED') {
                            this.continuousDurations.push(this._usageDuration);
                            this._usageDurationOffset = null;
                        }
                    }
                    break;
                case 'time':
                    // limit time event to be tracked only one per second
                    if (Math.abs(this._lastPos - value) < 1) {
                        return;
                    }

                    this._lastPos = Math.floor(value); // cut off milliseconds part

                    // "seek" doesn't provide seek-dest values and "getPosition" is still to inaccurate
                    if (this._usageDurationOffset === null) {
                        this._usageDuration = 0;
                        this._usageDurationOffset = value;
                    }

                    evt = event + "." + this._lastPos;

                    this._usageDuration = value - this._usageDurationOffset;
                    this.totalPlaybackDuration = this.continuousDurations.reduce(function (a, b) {
                        return a + b;
                    }, 0) + this._usageDuration; // first sum up the previous durations then add current one

                    break;
                case 'error':
                    this.error.code = value;
                    this.error.message = $p.utils.errorMessage(value, this.pp);
                    break;
                default:
                    value = '';
            }

            // TRACK regular events
            try {
                evtPartsArray = evt.split('.');
                for (var i = 0; i < evtPartsArray.length; i++) {
                    evtTempArray.push(evtPartsArray[i]);
                    evt = evtTempArray.join('.');
                    if (!!this._trackThis[itemCat]) {
                        $.each(this._trackThis[itemCat][evt] || [], function () {
                            ref._trackCall(event, this.url, this.post, this.callback);
                        });
                    }
                    // track events for every category
                    if(this._trackThis.hasOwnProperty('*')) {
                        $.each(this._trackThis['*'][evt] || [], function () {
                            ref._trackCall(event, this.url, this.post, this.callback);
                        });
                    }
                }
            } catch (e) {}

        },
        _trackCall: function (event, url, post, callback) {

            var postData = {},
                tVars = this._getVariables((event === 'error')),
                tConst = this._getConstants();

            this.pixelSeqCount++;

            // trigger callback function
            if (callback != null) {
                callback(tConst, tVars, this.pp);
            }

            if (url == null) {
                return;
            }

            // parse URL tags
            url = $p.utils.parseTemplate(url, $.extend({}, tConst, tVars), true);

            // -----------------------------------------
            // no POST: load tracking pixel
            if (post == null) {
                this.addTrackingPixel(url);
                return;
            }

            // parse POST params
            $.each(post, function (key, value) {
                try {
                    postData[key] = $p.utils.parseTemplate(value, $.extend({}, tConst, tVars), true);
                } catch (e) {
                    postData[key] = value;
                }
            });

            // -----------------------------------------
            // CORS Ajax request:
            // The IE family it the most fascinating sort of browser in the whole wide world. lovin' it.
            if (window.XDomainRequest) {
                // Use Microsoft XDR
                var xdr = new XDomainRequest();
                xdr.open("POST", url, true);
                xdr.onprogress = function () {}; // IE9 caveat
                xdr.onerror = function () {};
                xdr.send($.param(postData));
                return;
            }

            var ajaxConf = {
                url: url,
                type: 'POST',
                data: postData,
                error: function () {},
                success: function () {},
                cache: false,
                async: true,
                // dataType: 'text/html',
                crossDomain: true
            };

            ajaxConf.xhrFields = {
                withCredentials: true
            };

            ajaxConf.beforeSend = function (xhr) {
                xhr.withCredentials = true;
            };

            $.support.cors = true;
            $.ajax(ajaxConf);
        },
        cleanUrl: function (url) {
            // remove hash tags, encode URI
            return window.encodeURIComponent(url.replace(new RegExp('#.*'), ''));
        },
        addTrackingPixel: function (url) {
            $('body').append(
                $('<img/>')
                .attr('src', $('<p/>').html(url).text())
                .addClass(this.pp.getId() + '_tracking')
                .hide()
            );
        },
        removeTrackingPixels: function () {
            $('.' + this.pp.getId() + '_tracking').remove();
        },
        getTrackingId: function () {
            var name = 'prkusruuid',
                uuid = null;

            if (this.getConfig('permanentUuid') === false) {
                this.pp.storage.save(name, 'anonymous');
                return this._uuid();
            }

            uuid = this.pp.storage.restore(name);
            if (uuid == null || uuid == 'anonymous') {
                uuid = this._uuid();
                this.pp.storage.save(name, uuid);
            }
            return uuid;
        },
        /* uuid generator Copyright (c) 2010 Robert Kieffer */
        _uuid: function () {
            var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
            var uuid = new Array(36),
                rnd = 0,
                r;
            for (var i = 0; i < 36; i++) {
                if (i == 8 || i == 13 || i == 18 || i == 23) {
                    uuid[i] = '-';
                } else if (i == 14) {
                    uuid[i] = '4';
                } else {
                    if (rnd <= 0x02) {
                        rnd = 0x2000000 + (Math.random() * 0x1000000) | 0;
                    }
                    r = rnd & 0xf;
                    rnd = rnd >> 4;
                    uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r];
                }
            }
            return uuid.join('');
        }
    };

    $p.plugins.projekktorTracking = projekktorTracking;
}(window, document, jQuery, projekktor));