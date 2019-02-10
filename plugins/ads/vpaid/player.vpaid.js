/*
 * VPAID 2.0 model
 *
 * Copyright 2016-2017 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 * all rights reserved
 *
 * Use of this software is NOT free and requires permission of the copyright owner.
 * Unlicensed use is forbidden and subject to severe penalties of law.
 */

(function (window, document, $, $p) {

    "use strict";

    $p.newModel({
        modelId: 'VPAID',
        iLove: [{
            ext: 'js',
            type: 'application/javascript',
            platform: ['videojs'],
            streamType: ['http']
        }],
        _vpaid: null,
        _vpaidEventMap: {
            "vast.firstPlay": "vpaidFirstPlayListener",
            "vast.adStart": "vpaidAdStartListener",
            "vast.adEnd": "vpaidAdEndListener",
            "vast.adSkip": "vpaidAdEndListener",
            "vast.adError": "vpaidAdErrorListener",
            "vast.adsCancel": "vpaidAdEndListener",
            "vast.contentStart": "vpaidEventListener",
            "vast.contentEnd": "vpaidEventListener",
            "vast.reset": "vpaidEventListener"
        },
        _vpaidAdStarted: false,

        applyMedia: function (destContainer) {
            var ref = this,
                videoJsLoadSuccess = function () {
                    if ($('#' + ref.getMediaElementId()).length === 0) {

                        ref.wasPersistent = false;

                        destContainer.html('').append(
                            $('<video/>')
                            .attr({
                                "id": ref.getMediaElementId(),
                                "poster": $p.utils.imageDummy(),
                                "src": $p.utils.videoDummy('mp4'),
                                "loop": false,
                                "autoplay": false,
                                "preload": "none",
                                "x-webkit-airplay": "allow",
                                "playsinline": ""
                            }).prop({
                                "controls": false,
                                "volume": ref.getVolume()
                            }).css({
                                'width': '100%',
                                'height': '100%',
                                'position': 'absolute',
                                'top': 0,
                                'left': 0
                            })
                        );
                    }

                    ref.mediaElement = $('#' + ref.getMediaElementId());
                    ref.initVideoJs();
                },
                videoJsLoadFailed = function (jqxhr, settings, exception) {
                    ref.sendUpdate('error', 2);
                };

            // check if videojs.js is already loaded
            if (window.videojs && typeof window.videojs === 'function') {
                // just continue
                videoJsLoadSuccess();
            } else {
                // load video.js CSS
                $p.utils.getCss(ref.pp.getConfig('platformsConfig').videojs.css);
                // load video.js JS
                $p.utils.getScript(ref.pp.getConfig('platformsConfig').videojs.src, {
                        cache: true
                    })
                    .done(videoJsLoadSuccess)
                    .fail(videoJsLoadFailed);
            }
        },
        detachMedia: function () {
            try {
                //this._videojs.dispose();
            } catch (e) {}
        },

        initVideoJs: function () {
            var ref = this,
                wasAwakening = ref.getState('AWAKENING'),
                vjsConfig = $.extend({}, ref.pp.getConfig('platformsConfig').videojs.initVars, {
                    "plugins": {
                        "vpaid": {
                            "adCancelTimeout": 20000,
                            "adsEnabled": true
                        }
                    }
                });

            // init vast-vpaid plugin
            window.videojs.plugin('vpaid', function (opts) {
                $p.utils.log('VPAID adsSetup');

                var vjsPlayer = this;

                ref.addVPAIDEventListeners(vjsPlayer);

                ref._vpaid = vjsPlayer.vastClient({
                    adTagXML: function (cb) {
                        ref.getVastXML(cb, ref);
                    },
                    playAdAlways: true,
                    timeout: 1000,
                    adCancelTimeout: 15000,
                    preferredTech: 'html5',
                    adsEnabled: true,
                    verbosity: 0,
                    autoResize: false
                });

                // scale ads when the media is scaled
                var scaledListener = function (event, pp) {
                    vjsPlayer.trigger('vast.resize');
                };

                ref.pp.addListener(('scaled.vpaid'), scaledListener);
            });

            ref._videojs = window.videojs(ref.mediaElement[0], vjsConfig, function () {
                $p.utils.log('VPAID videojs ready');

                ref.mediaElement = $(this.contentEl());

                ref.addVideoJsEventListeners();

                if (wasAwakening) {
                    ref.displayReady();
                    return;
                }

                if (ref.getSeekState('SEEKING')) {
                    if (ref._isPlaying) {
                        ref.setPlay();
                    }

                    ref.seekedListener();
                    return;
                }

                if (ref._isPlaying) {
                    ref.setPlay();
                }
            });
        },
        getVastXML: function (callback, modelRef) {
            var item = modelRef.pp.getItem(),
                adSource = item.config.vast.adSourceXML;
            callback(null, '<VAST version="3.0"><Ad>' + $(adSource).html() + '</Ad></VAST>');
        },
        addVPAIDEventListeners: function (vjsPlayer) {
            var ref = this;

            // add event listeners
            $.each(ref._vpaidEventMap, function (key, value) {
                var listener = ref[value];
                vjsPlayer.on(key, listener);
            });
        },

        removeVPAIDEventListeners: function (vjsPlayer) {
            var ref = this;

            ref.pp.removeListener('*.vpaid');

            // remove event listeners
            $.each(ref._vpaidEventMap, function (key, value) {
                vjsPlayer.off(key);
            });
        },

        vpaidEventListener: function (evt) {
            var ref = this._ppModel;
            $p.utils.log("VPAID", evt);
        },
        vpaidAdErrorListener: function (evt) {
            $p.utils.log("VPAID", evt);
            var ref = this._ppModel;
            ref.removeVPAIDEventListeners(ref._videojs);
            ref.removeVideoJsEventListeners();
            ref.vjsErrorListener(evt, this);
        },
        vpaidFirstPlayListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            $p.utils.log("VPAID", evt);
        },
        vpaidAdStartListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            $p.utils.log("VPAID", evt);
            if (!ref._vpaidAdStarted) {
                ref.playingListener();
                ref._vpaidAdStarted = true;
            }
        },
        vpaidAdEndListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            $p.utils.log("VPAID", evt);
            vjsPlayer.trigger('ended');
            ref.removeVPAIDEventListeners(ref._videojs);
            ref.removeVideoJsEventListeners();
            ref._setState('completed');
        },
        vjsPlayingListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            if (ref._vpaidAdStarted) {
                ref.playingListener();
            }
        },
        vjsPauseListener: function (evt) {
            var vjsPlayer = this,
                ref = vjsPlayer._ppModel;

            if (ref._vpaidAdStarted) {
                ref.pauseListener();
            }
        },
        vjsEndedListener: function (evt) {
            $p.utils.log("VIDEOJS ENDED");
        }

    }, 'VIDEOJS');

}(window, document, jQuery, projekktor));