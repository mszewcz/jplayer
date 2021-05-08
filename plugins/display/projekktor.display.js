/*
 * Projekktor II Plugin: Display
 *
 * DESC: Provides a standard display for cover-art, video or html content
 * features startbutton, logo-overlay and buffering indicator
 * Copyright 2010-2013, Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */
(function (window, document, $, $p) {
    'use strict';

    if($p === undefined || !$p.hasOwnProperty('plugins')){
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    function projekktorDisplay() {}

    projekktorDisplay.prototype = {

        version: '1.1.2',
        reqVer: '1.8.0',

        logo: null,
        logoIsFading: false,

        display: null,

        displayClicks: 0,

        buffIcn: null,
        buffIcnSprite: null,
        buffIcnHangWatcher: null,
        bufferDelayTimer: null,


        _controlsDims: null,

        config: {
            displayClick: {
                callback: 'setPlayPause',
                value: null
            },
            displayPlayingClick: {
                callback: 'setPlayPause',
                value: null
            },
            displayDblClick: {
                callback: null,
                value: null
            },

            staticControls: false,

            /* time to delay buffering-icon-overlay once "waiting" event has been triggered */
            bufferIconDelay: 1000,

            bufferIconHangWatcherInterval: 5000,

            /* if set the indicator animation is tinkered from a cssprite - must be horizontal */
            spriteUrl: '',
            spriteWidth: 50,
            spriteHeight: 50,
            spriteTiles: 25,
            spriteOffset: 1,
            spriteCountUp: false
        },


        /* triggered on plugin-instantiation */
        initialize: function () {
            // create the display container itself
            this.display = this.applyToPlayer($('<div/>'));

            // create the startbutton
            this.startButton = this.applyToPlayer($('<div/>').addClass('start'), 'startbtn');

            // create buffericon
            this.buffIcn = this.applyToPlayer($('<div><div class="dots"><div class="dot1"></div><div class="dot2"></div><div class="dot3"></div></div></div>').addClass('buffering'), 'buffericn');

            this.setActive();

            // add spritelayer to buffericon (if required)
            if (this.config.spriteUrl !== '') {
                this.buffIcnSprite = $('<div/>')
                    .appendTo(this.buffIcn)
                    .css({
                        width: this.config.spriteWidth,
                        height: this.config.spriteHeight,
                        marginLeft: ((this.buffIcn.width() - this.config.spriteWidth) / 2) + "px",
                        marginTop: ((this.buffIcn.height() - this.config.spriteHeight) / 2) + "px",
                        backgroundColor: 'transparent',
                        backgroundImage: 'url(' + this.config.spriteUrl + ')',
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: '0 0'
                    })
                    .addClass('inactive');
            }

            // create a dedicated media container (if none exists)
            this.pp.getMediaContainer();

            this.pluginReady = true;
        },



        /*****************************************
            EVENT HANDLERS
        *****************************************/
        displayReadyHandler: function () {

            if (this.pp.playerModel.getBufferState('FULL')) {
                this.hideBufferIcon();
            }
        },

        synchronizingHandler: function () {
            var ref = this;
            this.hideStartButton();
            this.showBufferIcon();
            // ppstart
            this.startButton.off().on('touchend click', function () {
                ref.pp.setPlay();
            });
        },

        synchronizedHandler: function () {
            this.readyHandler();
        },

        readyHandler: function () {
            this.hideBufferIcon();
            if (this.pp.getState('IDLE')) {
                this.showStartButton();
            }
        },

        bufferHandler: function (state) {
            if (this.pp.playerModel.getBufferState('EMPTY') && !this.pp.getState('PAUSED')) {
                this.showBufferIcon();
            } else {
                this.hideBufferIcon();
            }
        },

        stateHandler: function (state) {
            var bufferState = this.pp.playerModel.getBufferState();

            switch (state) {

                case 'IDLE':
                    clearTimeout(this._cursorTimer);
                    this.display.css('cursor', 'pointer');
                    this.showStartButton();
                    this.hideBufferIcon();
                    break;

                case 'PLAYING':
                    this.hideStartButton();
                    this.bufferHandler(bufferState);
                    break;

                case 'PAUSED':
                    this.showStartButton();
                    this.hideBufferIcon();
                    break;

                case 'STARTING':
                case 'AWAKENING':
                    this.showBufferIcon();
                    this.hideStartButton();
                    break;

                case 'COMPLETED':
                    this.hideBufferIcon();
                    break;

                default:
                    this.hideStartButton();
            }
        },

        errorHandler: function (errorCode) {
            this.hideBufferIcon();
            this.hideStartButton();
            if (!this.getConfig('skipTestcard')) {
                this.testCard(errorCode);
            }

        },

        startHandler: function () {
            this.mousemoveHandler();
        },

        stoppedHandler: function () {
            this.hideBufferIcon();
        },

        scheduleLoadingHandler: function () {
            this.hideStartButton();
            this.showBufferIcon();
        },

        scheduledHandler: function () {
            if (!this.getConfig('autoplay')) {
                this.showStartButton();
            }
            this.hideBufferIcon();
        },

        plugineventHandler: function (data) {
            if (data.PLUGIN == 'controlbar' && data.EVENT == 'show' && this.getConfig('staticControls')) {
                var pctCtrl = data.height * 100 / this.pp.getDC().height();
                this.display.height((100 - pctCtrl) + "%").data('sc', true);
            }
        },

        qualityChangeHandler: function () {
            var bufferState = this.pp.playerModel.getBufferState();
            this.bufferHandler(bufferState);
        },

        /*****************************************,
            DISPLAY: Mouse Handling
        *****************************************/
        mousemoveHandler: function (evt) {
            var dest = this.display;
            if (this.pp.getState('IDLE')) {
                dest.css('cursor', 'pointer');
                return;
            }
            dest.css('cursor', 'auto');
            clearTimeout(this._cursorTimer);
            if ("AWAKENING|ERROR|PAUSED".indexOf(this.pp.getState()) == -1) {
                this._cursorTimer = setTimeout(function () {
                    dest.css('cursor', 'none');
                }, 3000);
            }
        },

        mousedownHandler: function (evt) {
            var ref = this;

            if (($(evt.target).attr('id') || '').indexOf('_media') == -1 && !$(evt.target).hasClass(this.pp.getNS() + 'testcard')){
                return;
            }

            clearTimeout(this._cursorTimer);
            this.display.css('cursor', 'auto');

            if (evt.which != 1){
                return;
            }

            switch (this.pp.getState()) {
                case 'ERROR':
                    this.pp.setConfig({
                        disallowSkip: false
                    });
                    this.pp.setActiveItem('next');
                    this.display.html('').removeClass(this.pp.getNS() + 'testcard');
                    return;
                case 'IDLE':
                    this.pp.setPlay();
                    return;
            }

            if (this.pp.getHasGUI() === true){
                return;
            }

            this.displayClicks++;

            this.pp._promote('displayClick');

            if (this.displayClicks > 0) {
                setTimeout(
                    function () {
                        if (ref.displayClicks == 1) {
                            if (ref.pp.getState() == 'PLAYING'){
                                ref.clickHandler('displayPlaying');
                            }
                            else {
                                ref.clickHandler('display');
                            }
                        } 
                        else if (ref.displayClicks == 2) {
                            ref.clickHandler('displayDbl');
                        }
                        ref.displayClicks = 0;
                    }, 150
                );
            }
            return;
        },


        /*****************************************
            STARTBUTTON
        *****************************************/
        showStartButton: function () {
            this.startButton.removeClass('inactive').addClass('active');
        },

        hideStartButton: function () {
            this.startButton.removeClass('active').addClass('inactive');
        },


        /*****************************************
            BUFFERICON: fader and animator
        *****************************************/
        hideBufferIcon: function () {
            clearTimeout(this.bufferDelayTimer);
            clearInterval(this.buffIcnHangWatcher);
            this.buffIcn.addClass('inactive').removeClass('active');
        },

        showBufferIcon: function (instant) {
            var ref = this;

            clearTimeout(this.bufferDelayTimer);

            /* setup buffer icon hang watcher */
            clearInterval(this.buffIcnHangWatcher);
            if (this.getConfig('bufferIconHangWatcherInterval')) {
                this.buffIcnHangWatcher = setInterval(function () {
                    if (ref.pp.playerModel.getBufferState('FULL')) {
                        ref.hideBufferIcon();
                    }
                }, this.getConfig('bufferIconHangWatcherInterval'));
            }

            if (this.pp.getHasGUI() || this.pp.getState('IDLE')) {
                return;
            }

            if ((this.pp.getModel() === 'YTAUDIO' || this.pp.getModel() === 'YTVIDEO') && !this.pp.getState('IDLE')){
                instant = true;
            }

            if (instant !== true && this.getConfig('bufferIconDelay') > 0) {
                this.bufferDelayTimer = setTimeout(function () {
                    ref.showBufferIcon(true);
                }, this.getConfig('bufferIconDelay'));
                return;
            }

            if (this.buffIcn.hasClass('active')) {
                return;
            }
            this.buffIcn.addClass('active').removeClass('inactive');

            if (ref.buffIcnSprite === null) {
                return;
            }

            var startOffset = (ref.config.spriteCountUp === true) ? 0 : (ref.config.spriteHeight + ref.config.spriteOffset) * (ref.config.spriteTiles - 1),
                spriteOffset = startOffset;
            ref.buffIcnSprite.addClass('active').removeClass('inactive');
            (function bi() {

                if (!ref.buffIcn.is(':visible')) {
                    return;
                }
                ref.buffIcnSprite.css('backgroundPosition', '0px -' + spriteOffset + "px");

                if (ref.config.spriteCountUp === true){
                    spriteOffset += ref.config.spriteHeight + ref.config.spriteOffset;
                }
                else {
                    spriteOffset -= ref.config.spriteHeight + ref.config.spriteOffset;
                }

                if (spriteOffset > (startOffset + ref.config.spriteHeight) * ref.config.spriteTiles || spriteOffset < ref.config.spriteOffset) {
                    spriteOffset = startOffset;
                }

                setTimeout(bi, 60);
            })();
        },

        testCard: function (errorCode) {
            var msgTxt = $p.utils.errorMessage(errorCode, this.pp);

            if (this.pp.getItemCount() > 1) {
                // "press next to continue"
                msgTxt += ' ' + $p.utils.errorMessage(99, this.pp);
            }

            if (msgTxt.length < 3) {
                msgTxt = 'ERROR #' + errorCode;
            }

            this.display
                .html('')
                .addClass(this.pp.getNS() + 'testcard')
                .html('<p>' + msgTxt + '</p>');
        }


    };

    $p.plugins.projekktorDisplay = projekktorDisplay;
}(window, document, jQuery, projekktor));
