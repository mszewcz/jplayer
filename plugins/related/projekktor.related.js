/*
 * Projekktor II Plugin: Related
 * VERSION: 1.1.2
 * DESC: Provides a "related videos" and "share me" postroll display
 *
 * Copyright Sascha Kluger, Spinning Airwhale Media, http://www.spinningairwhale.com
 * Copyright 2014-2018 - Radosław Włodkowski, www.wlodkowski.net, radoslaw@wlodkowski.net
 *
 * under GNU General Public License
 * http://www.projekktor.com/license/
 */

(function (window, document, $, $p) {
    'use strict';

    if ($p === undefined || !$p.hasOwnProperty('plugins')) {
        throw new Error('Projekktor player not found. Please initialize Projekktor before adding any plugins.');
    }

    var projekktorRelated = function () {
    };

    projekktorRelated.prototype = {
        version: '1.1.2',
        reqVer: '1.8.1',
        _showOnReady: false,
        _myContent: null,
        pluginReady: false,
        relatedTimeout: null,
        relatedSVG: null,
        _items: [],
        config: {
            enabled: true,
            showOnStart: false,
            replay: {
                enabled: true,
                title: 'Replay'
            },
            embed: {
                enabled: true,
                code: '<' + 'if' + 'rame id="%{embedid}" src="%{playerurl}?vidid=%{ID}" width="640" height="385" frameborder="0"><' + '/if' + 'rame>',
                title: "Embed this"
            },
            share: {
                enabled: true,
                code: 'http://%{playerurl}?vidid=%{ID}',
                title: "Share me"
            },
            related: {
                enabled: true,
                title: 'Related Videos',
                itemTemplate: '<a href="%{url}" target="%{target}"><span class="title">%{title}</span><span class="image"><img src="%{poster}"/></span></a>',
                items: [
                    /*  {poster: this._imgDummy, url: 'http://www.projekktor.com', title:'Title 1'} */
                ],
                autoContinue: {
                    enabled: true,
                    timeout: 5
                }
            }
        },
        initialize: function () {
            this._myContent = $('<div/>').addClass('wrapper');

            this._myPanel = this.applyToPlayer(
                $(document.createElement('div'))
                    .addClass('related')
                    .append(this._myContent)
            );

            this.setInactive();
            this.pluginReady = true;
        },
        _buildShare: function () {
            // related video list:
            var cssprefix = this.getConfig('ns'),
                div = $('<div>').addClass(cssprefix + 'relatedone'),
                ref = this,
                title = '',
                acEnabled = this.getConfig('related').autoContinue.enabled,
                acTimout = this.getConfig('related').autoContinue.timeout,
                svg = $('<svg class="csvg inactive" viewBox="0 0 36 36"><path class="cpath" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/></svg>'),
                svgStyle = $('<style>.projekktor .pprelated .cpath{animation-duration:' + acTimout + 's !important;-webkit-animation-duration:' + acTimout + 's !important;}</style>');

            if (!this.getConfig('replay').enabled && !this.getConfig('embed').enabled && !this.getConfig('share').enabled) {
                return;
            }

            // add replay tile:
            if (this.getConfig('replay').enabled) {
                title = this.getConfig('replay').title;
                div.append(
                    $('<div>')
                        .addClass(cssprefix + 'relatedreplay')
                        .append(title ? $('<h2>').html(title) : false)
                        .append($('<div>')
                            .addClass('container')
                            .append(
                                $('<a>')
                                    .addClass('replay')
                                    .attr({
                                        href: '#',
                                        title: this.getConfig('replay').title
                                    })
                                    .click(function (evt) {
                                        evt.stopPropagation();
                                        ref.pp.setActiveItem(0).setPlay();
                                        if (ref.relatedTimeout) {
                                            clearTimeout(ref.relatedTimeout);
                                        }
                                        return false;
                                    })
                            )
                            .append(acEnabled ? svg : false)
                        )
                );
                // related.autoContinue: append css to head, set timeout for auto-start function
                if (this.getConfig('related').enabled && acEnabled && acTimout > 0) {
                    $('head').append(svgStyle);
                    svg.removeClass('inactive').addClass('active');
                    this.relatedSVG = svg;
                    if (this.relatedTimeout) {
                        clearTimeout(this.relatedTimeout);
                    }
                    this.relatedTimeout = setTimeout(this._startFirstRelated.bind(this), acTimout * 1000);
                }
            }

            // add embed tile:
            if (this.getConfig('embed').enabled) {
                title = this.getConfig('embed').title;
                div.append(
                    $('<div>')
                        .addClass(cssprefix + 'relatedembed')
                        .append((title) ? $('<h2/>').html(title) : false)
                        .append(
                            $('<textarea>')
                                .val(this._getEmbedCode())
                                .click(function (evt) {
                                    evt.stopPropagation();
                                    this.select();
                                })
                                .focus(function () {
                                    this.select();
                                })
                                .attr('rows', 4)
                                .addClass('context')
                        )
                );
            }

            // add share tile:
            if (this.getConfig('share').enabled) {
                title = this.getConfig('share').title;
                div.append(
                    $('<div>')
                        .addClass(cssprefix + 'relatedshare')
                        .append((title) ? $('<h2/>').html(title) : false)
                        .append(
                            $('<textarea>')
                                .val(this._getShareUrl())
                                .click(function (evt) {
                                    evt.stopPropagation();
                                    this.select();
                                })
                                .focus(function () {
                                    this.select();
                                })
                                .attr('rows', 4)
                                .addClass('context')
                        )
                );
            }

            this._myContent.append(div);
        },
        _buildRelated: function () {
            // related video list:
            var cssprefix = this.getConfig('ns'),
                mainDiv = $('<div>').addClass(cssprefix + 'relatedtwo'),
                itemsDiv = $('<div>').addClass(cssprefix + 'relateditems'),
                itemsTitle = this.getConfig('related').title,
                itemTemplate = this.getConfig('related').itemTemplate,
                items = [],
                t = this;

            this._items = items = this._getItems();

            $.each(items, function (idx, item) {
                // ie mess:
                if (!item.url && !item.clickHandler) {
                    return;
                }
                var itemElement = itemTemplate;

                // replace template variables
                Object.keys(item).forEach(function (key) {
                    itemElement = itemElement.replace('%{' + key + '}', item[key]);
                });

                // Convert template to HTML Node, add class & some event handlers
                itemElement = $(itemElement)
                    .addClass(cssprefix + 'relateditem')
                    .off()
                    .on('mouseenter', function () {
                        $(this).addClass('active');
                    })
                    .on('mouseleave', function () {
                        $(this).removeClass('active');
                    })
                    .addClass(('ontouchstart' in document.documentElement) ? 'active' : '');

                // add click handler
                if (item.clickHandler && typeof item.clickHandler === 'function') {
                    itemElement.on('click', function() {
                        if (t.relatedTimeout) {
                            t.relatedSVG.removeClass('active').addClass('inactive');
                            clearTimeout(t.relatedTimeout);
                        }
                        t.setInactive();
                        item.clickHandler();
                    });
                }

                itemsDiv.append(itemElement);
            });

            mainDiv.append((itemsTitle) ? $('<h2>').html(itemsTitle) : false)
                .append(itemsDiv);

            this._myContent.append(mainDiv);
        },
        _startFirstRelated: function() {
            // auto-start first found related item
            var itemCH = null,
                itemUrl = null;

            $.each(this._items, function (idx, item) {
                if (itemUrl === null && itemCH === null) {
                    if (typeof item.clickHandler === 'function') {
                        itemCH = item.clickHandler;
                    }
                    if (typeof item.url === 'string') {
                        itemUrl = item.url;
                    }
                }
            });

            this.setInactive();

            if (typeof itemCH === 'function') {
                itemCH.call();
            } else if (typeof itemUrl === 'string') {
                document.location.href = itemUrl;
            }
        },
        _getEmbedCode: function () {
            // replace standard items
            var result = this.getConfig('embed').code;
            var data = {};

            data.embedid = $p.utils.randomId(8);
            data.playerurl = window.location.href + window.location.hash;
            data.ID = this.pp.getItem()['ID'];

            for (var i in data) {
                if (data.hasOwnProperty(i)) {
                    result = $p.utils.parseTemplate(result, data);
                }
            }
            return result; // jQuery('<div />').text(result).html();
        },
        _getShareUrl: function () {
            // replace standard items
            var result = this.getConfig('share').code;
            var data = {};

            data.embedid = $p.utils.randomId(8);
            data.playerurl = window.location.href + window.location.hash;
            data.ID = this.pp.getItem()['ID'];

            for (var i in data) {
                if (data.hasOwnProperty(i)) {
                    result = $p.utils.parseTemplate(result, data);
                }
            }
            return jQuery('<div />').text(result).html();
        },
        _buildPanel: function () {
            this._myContent.html('');

            if (this.getConfig('enabled') !== true) {
                return;
            }

            if (!this.getConfig('replay').enabled && !this.getConfig('embed').enabled && !this.getConfig('share').enabled && !this.getConfig('related').enabled) {
                return;
            }

            if (this.getConfig('share')) {
                this._buildShare();
            }

            if (this.getConfig('related')) {
                this._buildRelated();
            }

            if (this._items.length) {
                this.setActive();
            }
        },
        _getItems: function () {
            var items = [];

            if (typeof this.getConfig('related').items === 'function') {
                items = this.getConfig('related').items(this.pp);
            } else {
                items = this.getConfig('related').items;
            }

            return items;
        },
        /* Event Handlers */
        displayReadyHandler: function () {
            if (this.getConfig('showOnStart') && this.pp.getState('IDLE')) {
                this._buildPanel();
            }
        },
        doneHandler: function () {
            this._buildPanel();
        },
        stateHandler: function (stateValue) {
            switch (stateValue) {
                case 'ERROR':
                case 'STARTING':
                    this.setInactive();
                    break;
                case 'AWAKENING':
                case 'COMPLETED':
                case 'IDLE':
            }
        }
    };

    $p.plugins.projekktorRelated = projekktorRelated;
}(window, document, jQuery, projekktor));
