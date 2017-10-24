(require.specified('base/js/namespace') ? define : function(deps, callback) {
    "use strict";
    // if here, the Jupyter namespace hasn't been specified to be loaded.
    // This means that we're probably embedded in a page, so we need to make
    // our definition with a specific module name
    return define('nbextensions/toc2/toc2', deps, callback);
})(['jquery', 'require'], function($, require) {
    "use strict";

    var IPython;
    var events;
    var liveNotebook = false;
    var all_headers = $("#notebook").find(":header");

    // globally-used status variables:
    var rendering_toc_cell = false;

    try {
        // this will work in a live notebook because nbextensions & custom.js
        // are loaded by/after notebook.js, which requires base/js/namespace
        IPython = require('base/js/namespace');
        events = require('base/js/events');
        liveNotebook = true;
    } catch (err) {
        // We *are* theoretically in a non-live notebook
        console.log('[toc2] working in non-live notebook'); //, err);
        // in non-live notebook, there's no event structure, so we make our own
        if (window.events === undefined) {
            var Events = function() {};
            window.events = $([new Events()]);
        }
        events = window.events;
    }
    var Jupyter = IPython;

    var setMd = function(key, value) {
        if (liveNotebook) {
            var md = IPython.notebook.metadata.toc;
            if (md === undefined) {
                md = IPython.notebook.metadata.toc = {};
            }
            md[key] = value;
            IPython.notebook.set_dirty();
        }
        return value;
    };

    function incr_lbl(ary, h_idx) { //increment heading label  w/ h_idx (zero based)
        ary[h_idx]++;
        for (var j = h_idx + 1; j < ary.length; j++) {
            ary[j] = 0;
        }
        return ary.slice(0, h_idx + 1);
    }

    function removeMathJaxPreview(elt) {
        elt.children('.anchor-link, .toc-mod-link').remove();
        elt.find("script[type='math/tex']").each(
            function(i, e) {
                $(e).replaceWith('$' + $(e).text() + '$')
            })
        elt.find("span.MathJax_Preview").remove()
        elt.find("span.MathJax").remove()
        return elt
    }

    var callback_toc_link_click = function(evt) {
        // workaround for https://github.com/jupyter/notebook/issues/699
        setTimeout(function() {
            $.ajax()
        }, 100);
        evt.preventDefault();
        var trg_id = $(evt.currentTarget).attr('data-toc-modified-id');
        // use native scrollIntoView method with semi-unique id
        // ! browser native click does't follow links on all browsers
        document.getElementById(trg_id).scrollIntoView(true)
        if (liveNotebook) {
            // use native document method as jquery won't cope with characters
            // like . in an id
            var cell = $(document.getElementById(trg_id)).closest('.cell').data('cell');
            Jupyter.notebook.select(Jupyter.notebook.find_cell_index(cell));
            highlight_toc_item("toc_link_click", {
                cell: cell
            });
        }
    };

    var make_link = function(h, toc_mod_id) {
        var a = $('<a>')
            .attr({
                'href': h.find('.anchor-link').attr('href'),
                'data-toc-modified-id': toc_mod_id,
            });
        // get the text *excluding* the link text, whatever it may be
        var hclone = h.clone();
        hclone = removeMathJaxPreview(hclone);
        a.html(hclone.html());
        a.on('click', callback_toc_link_click);
        return a;
    };

    function highlight_toc_item(evt, data) {
        var c = $(data.cell.element);
        if (c.length < 1) {
            return;
        }
        var trg_id = c.find('.toc-mod-link').attr('id') ||
            c.prevAll().find('.toc-mod-link').eq(-1).attr('id');
        var highlighted_item = $();
        if (trg_id !== undefined) {
            highlighted_item = $('.toc a').filter(function(idx, elt) {
                return $(elt).attr('data-toc-modified-id') === trg_id;
            });
        }
        if (evt.type === 'execute') {
            // remove the selected class and add execute class
            // if the cell is selected again, it will be highligted as selected+running
            highlighted_item.removeClass('toc-item-highlight-select').addClass('toc-item-highlight-execute');
        } else {
            $('.toc .toc-item-highlight-select').removeClass('toc-item-highlight-select');
            highlighted_item.addClass('toc-item-highlight-select');
        }
    }

    var create_navigate_menu = function(callback) {
        $('#kernel_menu').parent().after('<li id="Navigate"/>')
        $('#Navigate').addClass('dropdown').append($('<a/>').attr('href', '#').attr('id', 'Navigate_sub'))
        $('#Navigate_sub').text('Navigate').addClass('dropdown-toggle').attr('data-toggle', 'dropdown')
        $('#Navigate').append($('<ul/>').attr('id', 'Navigate_menu').addClass('dropdown-menu')
            .append($("<div/>").attr("id", "navigate_menu").addClass('toc')))

        if (IPython.notebook.metadata.toc['nav_menu']) {
            $('#Navigate_menu').css(IPython.notebook.metadata.toc['nav_menu'])
            $('#navigate_menu').css('width', $('#Navigate_menu').css('width'))
            $('#navigate_menu').css('height', $('#Navigate_menu').height())
        } else {
            IPython.notebook.metadata.toc.nav_menu = {};
            events.on("before_save.Notebook",
                function() {
                    try {
                        IPython.notebook.metadata.toc.nav_menu['width'] = $('#Navigate_menu').css('width')
                        IPython.notebook.metadata.toc.nav_menu['height'] = $('#Navigate_menu').css('height')
                    } catch (e) {
                        console.log("[toc2] Error in metadata (navigation menu) - Proceeding", e)
                    }
                })
        }

        $('#Navigate_menu').resizable({
            resize: function(event, ui) {
                $('#navigate_menu').css('width', $('#Navigate_menu').css('width'))
                $('#navigate_menu').css('height', $('#Navigate_menu').height())
            },
            stop: function(event, ui) {
                IPython.notebook.metadata.toc.nav_menu['width'] = $('#Navigate_menu').css('width')
                IPython.notebook.metadata.toc.nav_menu['height'] = $('#Navigate_menu').css('height')
            }
        })

        callback && callback();
    }

    function setNotebookWidth(cfg, st) {
        if (cfg.sideBar) {
            if ($('#toc-wrapper').is(':visible')) {
                if (cfg.widenNotebook) {
                    $('#notebook-container').css('margin-left', $('#toc-wrapper').width() + 30)
                    $('#notebook-container').css('width', $('#notebook').width() - $('#toc-wrapper').width() - 30)
                } else {
                    var space_needed = $('#toc-wrapper').width() + 30 +
                        $('#notebook-container').width() - $('#notebook').width();
                    if (space_needed > 0) {
                        $('#notebook-container').css('margin-left', $('#toc-wrapper').width() + 30)
                        $('#notebook-container').css('width', $('#notebook-container').width() - space_needed)
                    }
                }
            } else {
                if (cfg.widenNotebook) {
                    $('#notebook-container').css('margin-left', 30);
                    $('#notebook-container').css('width', $('#notebook').width() - 30);
                } else { // original width
                    $("#notebook-container").css({
                        'width': '',
                        'margin-left': ''
                    })
                }
            }
        } else {
            if (cfg.widenNotebook) {
                $('#notebook-container').css('margin-left', 30);
                $('#notebook-container').css('width', $('#notebook').width() - 30);
            } else { // original width
                $("#notebook-container").css({
                    'width': '',
                    'margin-left': ''
                })
            }
        }
    }

    function setSideBarHeight(cfg, st) {
        if (cfg.sideBar) {
            var headerVisibleHeight = $('#header').is(':visible') ? $('#header').height() : 0
            $('#toc-wrapper').css('top', liveNotebook ? headerVisibleHeight : 0)
            $('#toc-wrapper').css('height', $('#site').height());
            $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height())
        }
    }

    var create_toc_div = function(cfg, st) {
        var toc_wrapper = $('<div id="toc-wrapper"/>')
            .append(
                $('<div id="toc-header"/>')
                .append('<span class="header"/>')
                .append(
                    $('<i class="fa fa-fw hide-btn" title="Hide ToC">')
                    .on('click', function (evt) {
                        $('#toc').slideToggle({
                            'complete': function() {
                                if (liveNotebook) {
                                    IPython.notebook.metadata.toc['toc_section_display'] = $('#toc').css('display');
                                    IPython.notebook.set_dirty();
                                }
                            }
                        });
                        $('#toc-wrapper').toggleClass('closed');
                        if ($('#toc-wrapper').hasClass('closed')) {
                            st.oldTocHeight = $('#toc-wrapper').css('height');
                            $('#toc-wrapper').css({
                                height: 40
                            });
                            $('#toc-wrapper .hide-btn')
                                .attr('title', 'Show ToC');
                        } else {
                            $('#toc-wrapper').css({
                                height: st.oldTocHeight
                            });
                            $('#toc').css({
                                height: st.oldTocHeight
                            });
                            $('#toc-wrapper .hide-btn')
                                .attr('title', 'Hide ToC');
                        }
                        return false;
                    })
                ).append(
                    $('<i class="fa fa-fw fa-refresh" title="Reload ToC">')
                    .on('click', function(evt) {
                        var icon = $(evt.currentTarget).addClass('fa-spin');
                        table_of_contents(cfg, st);
                        icon.removeClass('fa-spin');
                    })
                ).append(
                    $('<i class="fa fa-fw fa-cog" title="ToC settings"/>')
                    .on('click', function(evt) {
                        show_settings_dialog(cfg, st);
                    })
                )
            ).append(
                $("<div/>").attr("id", "toc").addClass('toc')
            )

        $("body").append(toc_wrapper);

        // On header/menu/toolbar resize, resize the toc itself
        // (if displayed as a sidebar)
        if (liveNotebook) {
            events.on("resize-header.Page", function() {
                setSideBarHeight(cfg, st);
            });
            events.on("toggle-all-headers", function() {
                setSideBarHeight(cfg, st);
            });
        }

        // enable dragging and save position on stop moving
        $('#toc-wrapper').draggable({

            drag: function(event, ui) {

                // If dragging to the left side, then transforms in sidebar
                if ((ui.position.left <= 0) && (cfg.sideBar == false)) {
                    cfg.sideBar = true;
                    st.oldTocHeight = $('#toc-wrapper').css('height');
                    if (liveNotebook) {
                        IPython.notebook.metadata.toc['sideBar'] = true;
                        IPython.notebook.set_dirty();
                    }
                    toc_wrapper.removeClass('float-wrapper').addClass('sidebar-wrapper');
                    setNotebookWidth(cfg, st)
                    var headerVisibleHeight = $('#header').is(':visible') ? $('#header').height() : 0
                    ui.position.top = liveNotebook ? headerVisibleHeight : 0;
                    ui.position.left = 0;
                    if (liveNotebook) {
                        $('#toc-wrapper').css('height', $('#site').height());
                    } else {
                        $('#toc-wrapper').css('height', '96%');
                    }
                    $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height());
                }
                if (ui.position.left <= 0) {
                    ui.position.left = 0;
                    var headerVisibleHeight = $('#header').is(':visible') ? $('#header').height() : 0
                    ui.position.top = liveNotebook ? headerVisibleHeight : 0;
                }
                if ((ui.position.left > 0) && (cfg.sideBar == true)) {
                    cfg.sideBar = false;
                    if (liveNotebook) {
                        IPython.notebook.metadata.toc['sideBar'] = false;
                        IPython.notebook.set_dirty();
                    }
                    if (st.oldTocHeight == undefined) st.oldTocHeight = Math.max($('#site').height() / 2, 200)
                    $('#toc-wrapper').css('height', st.oldTocHeight);
                    toc_wrapper.removeClass('sidebar-wrapper').addClass('float-wrapper');
                    setNotebookWidth(cfg, st)
                    $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height()); //redraw at begin of of drag (after resizing height)

                }
            }, //end of drag function
            start: function(event, ui) {
                $(this).width($(this).width());
            },
            stop: function(event, ui) { // on save, store toc position
                if (liveNotebook) {
                    IPython.notebook.metadata.toc['toc_position'] = {
                        'left': $('#toc-wrapper').css('left'),
                        'top': $('#toc-wrapper').css('top'),
                        'width': $('#toc-wrapper').css('width'),
                        'height': $('#toc-wrapper').css('height'),
                        'right': $('#toc-wrapper').css('right')
                    };
                    IPython.notebook.set_dirty();
                }
                // Ensure position is fixed (again)
                $('#toc-wrapper').css('position', 'fixed');
            },
            containment: 'body',
            snap: 'body, #site',
        });

        $('#toc-wrapper').resizable({
            resize: function(event, ui) {
                if (cfg.sideBar) {
                    setNotebookWidth(cfg, st)
                } else {
                    $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height());
                }
            },
            start: function(event, ui) {
                $(this).width($(this).width());
            },
            stop: function(event, ui) { // on save, store toc position
                if (liveNotebook) {
                    IPython.notebook.metadata.toc['toc_position'] = {
                        'left': $('#toc-wrapper').css('left'),
                        'top': $('#toc-wrapper').css('top'),
                        'height': $('#toc-wrapper').css('height'),
                        'width': $('#toc-wrapper').css('width'),
                        'right': $('#toc-wrapper').css('right')
                    };
                    $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height())
                    IPython.notebook.set_dirty();
                }
            }
        })

        $("body").append(toc_wrapper);

        // On header/menu/toolbar resize, resize the toc itself
        // (if displayed as a sidebar)
        if (liveNotebook) {
            events.on("resize-header.Page toggle-all-headers", function() {
                setSideBarHeight(cfg, st);
            });
        }

        // restore toc position at load
        if (liveNotebook) {
            if (IPython.notebook.metadata.toc['toc_position'] !== undefined) {
                $('#toc-wrapper').css(IPython.notebook.metadata.toc['toc_position']);
            }
        }
        // Ensure position is fixed
        $('#toc-wrapper').css('position', 'fixed');

        // Restore toc display
        if (liveNotebook) {
            if (IPython.notebook.metadata.toc !== undefined) {
                if (IPython.notebook.metadata.toc['toc_section_display'] !== undefined) {
                    $('#toc').css('display', IPython.notebook.metadata.toc['toc_section_display'])
                    $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height())
                    if (IPython.notebook.metadata.toc['toc_section_display'] == 'none') {
                        $('#toc-wrapper').addClass('closed');
                        $('#toc-wrapper').css({
                            height: 40
                        });
                        $('#toc-wrapper .hide-btn')
                            .text('[+]')
                            .attr('title', 'Show ToC');
                    }
                }
                if (IPython.notebook.metadata.toc['toc_window_display'] !== undefined) {
                    console.log("******Restoring toc display");
                    $('#toc-wrapper').css('display', IPython.notebook.metadata.toc['toc_window_display'] ? 'block' : 'none');
                }
            }
        }

        // if toc-wrapper is undefined (first run(?), then hide it)
        if ($('#toc-wrapper').css('display') == undefined) $('#toc-wrapper').css('display', "none");

        $('#site').bind('siteHeight', function() {
            if (cfg.sideBar) $('#toc-wrapper').css('height', $('#site').height());
        })

        $('#site').trigger('siteHeight');

        // Initial style
        if (cfg.sideBar) {
            $('#toc-wrapper').addClass('sidebar-wrapper');
            if (!liveNotebook) {
                $('#toc-wrapper').css('width', '202px');
                $('#notebook-container').css('margin-left', '212px');
                $('#toc-wrapper').css('height', '96%');
                $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height())
            } else {
                if (cfg.toc_window_display) {
                    setTimeout(function() {
                        setNotebookWidth(cfg, st)
                    }, 500)
                }
                setTimeout(function() {
                    $('#toc-wrapper').css('height', $('#site').height());
                    $('#toc').css('height', $('#toc-wrapper').height() - $('#toc-header').height())
                }, 500)
            }
            setTimeout(function() {
                $('#toc-wrapper').css('top', liveNotebook ? $('#header').height() : 0);
            }, 500) //wait a bit
            $('#toc-wrapper').css('left', 0);

        } else {
            toc_wrapper.addClass('float-wrapper');
        }
    }

    //----------------------------------------------------------------------------
    // on scroll - mark the toc item corresponding to the first header visible in
    // the viewport with 'highlight_on_scroll' class
    // some elements from https://stackoverflow.com/questions/20791374/jquery-check-if-element-is-visible-in-viewport
    function highlightTocItemOnScroll(cfg, st) {
        if (cfg.markTocItemOnScroll) {
            var scrolling_elt = liveNotebook ? '#site' : window
            $(scrolling_elt).scroll(function() {
                var headerVisibleHeight = $('#header').is(':visible') ? $('#header').height() : 0
                var headerHeight = liveNotebook ? headerVisibleHeight : 0
                var bottom_of_screen = $(window).scrollTop() + $(scrolling_elt).height() + headerHeight;
                var top_of_screen = $(window).scrollTop() + headerHeight;
                //loop over all headers
                all_headers.each(function(i, h) {
                    var top_of_element = $(h).offset().top;

                    if ((bottom_of_screen > top_of_element) && (top_of_screen < top_of_element)) {
                        // The element is visible
                        var trg_id = $(h).attr('data-toc-modified-id')
                        if (trg_id !== undefined) {
                            var highlighted_item = $('#toc a').filter(function(idx, elt) {
                                return $(elt).attr('data-toc-modified-id') === trg_id;
                            });
                            $('#toc .highlight_on_scroll').removeClass('highlight_on_scroll')
                            highlighted_item.parent().addClass('highlight_on_scroll')
                        }
                        return false;
                    } else {
                        // The element is not visible
                        // If the current header is already below the viewport then break
                        if (bottom_of_screen < top_of_element) return false
                        else return
                    }
                })
            });
        }
    }
    //----------------------------------------------------------------------------
    // TOC CELL -- if cfg.toc_cell=true, add and update a toc cell in the notebook.
    //             This cell, initially at the very beginning, can be moved.
    //             Its contents are automatically updated.
    //             Optionnaly, the sections in the toc can be numbered.

    function process_cell_toc(cfg, st) {
        var new_html = '<h1>' +
            $('<div>').text(cfg.title_cell).html() + '<span class="tocSkip"></span></h1>\n' +
            '<div class="toc">' +
            $('#toc').html() +
            '</div>';
        if (!liveNotebook) {
            if (cfg.toc_cell) {
                $('.cell > .toc').parent(':has(.tocSkip)')
                    .html(new_html)
                    .find('.toc-item li a')
                        .on('click', callback_toc_link_click);
            }
            return;
        }
        var cell_toc;
        // look for a possible toc cell
        var cells = IPython.notebook.get_cells();
        var lcells = cells.length;
        for (var i = 0; i < lcells; i++) {
            if (cells[i].metadata.toc) {
                // delete if we don't want it
                if (!cfg.toc_cell) {
                    return IPython.notebook.delete_cell(i);
                }
                cell_toc = cells[i];
                break;
            }
        }
        //if toc_cell=true, we want a cell_toc.
        //  If it does not exist, create it at the beginning of the notebook
        if (cfg.toc_cell) {
            if (cell_toc === undefined) {
                // set rendering_toc_cell flag to avoid loop on insert_cell_above
                rendering_toc_cell = true;
                cell_toc = IPython.notebook.insert_cell_above('markdown', 0);
                cell_toc.metadata.toc = true;
                rendering_toc_cell = false;
            }
            // set rendering_toc_cell flag to avoid loop on render
            rendering_toc_cell = true;
            cell_toc.set_text(new_html);
            cell_toc.render();
            rendering_toc_cell = false;
            cell_toc.element.find('.toc-item li a').on('click', callback_toc_link_click);
        }
    } //end function process_cell_toc --------------------------

    var collapse_by_id = function(trg_id, show, trigger_event) {
        var anchors = $('.toc .toc-item > li > span > a').filter(function(idx, elt) {
            return $(elt).attr('data-toc-modified-id') === trg_id;
        });
        anchors.siblings('i')
            .toggleClass('fa-caret-right', !show)
            .toggleClass('fa-caret-down', show);
        anchors.parent().siblings('ul')[show ? 'slideDown' : 'slideUp']('fast');
        if (trigger_event !== false) {
            // fire event for collapsible_heading to catch
            var cell = $(document.getElementById(trg_id)).closest('.cell').data('cell');
            events.trigger((show ? 'un' : '') + 'collapse.Toc', {
                cell: cell
            });
        }
    };

    var callback_toc2_collapsible_headings = function(evt, data) {
        var trg_id = data.cell.element.find(':header').filter(function(idx, elt) {
            return Boolean($(elt).attr('data-toc-modified-id'));
        }).attr('data-toc-modified-id');
        var show = evt.type.indexOf('un') >= 0;
        // use trigger_event false to avoid re-triggering collapsible_headings
        collapse_by_id(trg_id, show, false);
    };

    var callback_collapser = function(evt) {
        var clicked_i = $(evt.currentTarget);
        var trg_id = clicked_i.siblings('a').attr('data-toc-modified-id');
        var show = clicked_i.hasClass('fa-caret-right');
        collapse_by_id(trg_id, show);
    };

    // Table of Contents =================================================================
    var table_of_contents = function(cfg, st) {

        // if this call is a result of toc_cell rendering, do nothing to avoid
        // looping, as we're already in a table_of_contents call
        if (rendering_toc_cell) {
            return
        }


        var toc_wrapper = $("#toc-wrapper");
        if (toc_wrapper.length === 0) { // toc window doesn't exist at all
            create_toc_div(cfg, st); // create it
            highlightTocItemOnScroll(cfg, st); // initialize highlighting on scroll
        }
        var ul = $('<ul/>').addClass('toc-item');

        // update sidebar/window title
        $('#toc-header > .header').text(cfg.title_sidebar + ' ');

        // update toc element
        $("#toc").empty().append(ul);

        var depth = 1;
        // update all headers with id that are in rendered text cell outputs,
        // excepting any header which contains an html tag with class 'tocSkip'
        // eg in ## title <a class='tocSkip'>,
        // or the ToC cell.
        all_headers = $('.text_cell_render').find('[id]:header:not(:has(.tocSkip))');
        var min_lvl = 1 + Number(Boolean(cfg.skip_h1_title)),
            lbl_ary = [];
        for (; min_lvl <= 6; min_lvl++) {
            if (all_headers.is('h' + min_lvl)) {
                break;
            }
        }
        for (var i = min_lvl; i <= 6; i++) {
            lbl_ary[i - min_lvl] = 0;
        }

        //loop over all headers
        all_headers.each(function(i, h) {
            // remove pre-existing number
            $(h).children('.toc-item-num').remove();

            var level = parseInt(h.tagName.slice(1), 10) - min_lvl + 1;
            // skip below threshold, or h1 ruled out by cfg.skip_h1_title
            if (level < 1 || level > cfg.threshold) {
                return;
            }
            h = $(h);
            // numbered heading labels
            var num_str = incr_lbl(lbl_ary, level - 1).join('.');
            if (cfg.number_sections) {
                $('<span>')
                    .text(num_str + '\u00a0\u00a0')
                    .addClass('toc-item-num')
                    .prependTo(h);
            }

            // walk down levels
            for (; depth < level; depth++) {
                var li = ul.children('li:last-child');
                if (li.length < 1) {
                    li = $('<li>').appendTo(ul);
                }
                ul = $('<ul class="toc-item">').appendTo(li);
            }
            // walk up levels
            for (; depth > level; depth--) {
                ul = ul.parent().closest('.toc-item');
            }

            var toc_mod_id = h.attr('id') + '-' + num_str;
            h.attr('data-toc-modified-id', toc_mod_id);
            // add an anchor with modified id (if it doesn't already exist)
            h.children('.toc-mod-link').remove();
            $('<a>').addClass('toc-mod-link').attr('id', toc_mod_id).prependTo(h);

            // Create toc entry, append <li> tag to the current <ol>.
            ul.append(
                $('<li>').append(
                    $('<span>').append(
                        make_link(h, toc_mod_id))));
        });

        // update navigation menu
        if (cfg.navigate_menu) {
            var pop_nav = function() { //callback for create_nav_menu
                $('#navigate_menu').empty().append($('#toc > .toc-item').clone());
            }
            if ($('#Navigate_menu').length == 0) {
                create_navigate_menu(pop_nav);
            } else {
                pop_nav()
            }
        } else { // If navigate_menu is false but the menu already exists, then remove it
            if ($('#Navigate_menu').length > 0) $('#Navigate_sub').remove()
        }

        // if cfg.toc_cell=true, find/add and update a toc cell in the notebook.
        process_cell_toc(cfg, st);

        // add collapse controls
        $('<i>')
            .addClass('fa fa-fw fa-caret-down')
            .on('click', callback_collapser) // callback
            .prependTo('.toc li:has(ul) > span'); // only if li has descendants
        $('<i>').addClass('fa fa-fw ').prependTo('.toc li:not(:has(ul)) > span'); // otherwise still add <i> to keep things aligned

        events[cfg.collapse_to_match_collapsible_headings ? 'on' : 'off'](
            'collapse.CollapsibleHeading uncollapse.CollapsibleHeading', callback_toc2_collapsible_headings);

        $(window).resize(function() {
            $('#toc').css({
                maxHeight: $(window).height() - 30
            });
            $('#toc-wrapper').css({
                maxHeight: $(window).height() - 10
            });
            setSideBarHeight(cfg, st),
                setNotebookWidth(cfg, st);
        });

        $(window).trigger('resize');

    };

    var toggle_toc = function(cfg, st) {
        // toggle draw (first because of first-click behavior)
        $("#toc-wrapper").toggle({
            'progress': function() {
                setNotebookWidth(cfg, st);
            },
            'complete': function() {
                setMd('toc_window_display', $('#toc-wrapper').css('display') !== 'none');
                table_of_contents(cfg, st);
            }
        });
    };

    var show_settings_dialog = function (cfg, st) {

        var callback_setting_change = function (evt) {
            var input = $(evt.currentTarget);
            var md_key = input.attr('tocMdKey');
            cfg[md_key] = setMd(md_key, input.attr('type') == 'checkbox' ? Boolean(input.prop('checked')) : input.val());
            table_of_contents(cfg, st);
        };
        var build_setting_input = function (md_key, md_label, input_type) {
            var opts = liveNotebook ? IPython.notebook.metadata.toc : cfg;
            var id = 'toc-settings-' + md_key;
            var fg = $('<div>').append(
                $('<label>').text(md_label).attr('for', id));
            var input = $('<input/>').attr({
                type: input_type || 'text', id: id, tocMdKey: md_key,
            }).on('change', callback_setting_change);
            if (input_type == 'checkbox') {
                fg.addClass('checkbox');
                input
                    .prop('checked', opts[md_key])
                    .prependTo(fg.children('label'));
            }
            else {
                fg.addClass('form-group');
                input
                    .addClass('form-control')
                    .val(opts[md_key])
                    .appendTo(fg);
            }
            return fg;
        };

        var modal = $('<div class="modal fade" role="dialog"/>');
        var dialog_content = $("<div/>")
            .addClass("modal-content")
            .appendTo($('<div class="modal-dialog">').appendTo(modal));
        $('<div class="modal-header">')
            .append('<button type="button" class="close" data-dismiss="modal" aria-hidden="true">&times;</button>')
            .append('<h4 class="modal-title">ToC2 settings</h4>')
            .on('mousedown', function() { $('.modal').draggable({handle: '.modal-header'});})
            .appendTo(dialog_content);
        $('<div>')
            .addClass('modal-body')
            .append([
                $('<div>').text(
                    'These settings apply to this notebook only, and are stored in its metadata. ' +
                    liveNotebook ? 'The defaults for new notebooks can be edited from the nbextensions configurator.' :
                    'The settings won\'t persist in non-live notebooks though.'),
                build_setting_input('number_sections', 'Automatically number headings', 'checkbox'),
                build_setting_input('skip_h1_title', 'Leave h1 items out of ToC', 'checkbox'),
                build_setting_input('toc_cell', 'Add notebook ToC cell', 'checkbox'),
                build_setting_input('title_cell', 'ToC cell title'),
                build_setting_input('title_sidebar', 'Sidebar title'),
            ])
            .appendTo(dialog_content);
        $('<div class="modal-footer">')
            .append('<button class="btn btn-default btn-sm btn-primary" data-dismiss="modal">Ok</button>')
            .appendTo(dialog_content);
        // focus button on open
        modal.on('shown.bs.modal', function () {
            setTimeout(function () {
                dialog_content.find('.modal-footer button').last().focus();
            }, 0);
        });

        if (liveNotebook) {
            Jupyter.notebook.keyboard_manager.disable();
            modal.on('hidden.bs.modal', function () {
                modal.remove(); // destroy modal on hide
                Jupyter.notebook.keyboard_manager.enable();
                Jupyter.notebook.keyboard_manager.command_mode();
                var cell = Jupyter.notebook.get_selected_cell();
                if (cell) cell.select();
            });
        }

        // Try to use bootstrap modal, but bootstrap's js may not be available
        // (e.g. as in non-live notebook), so we provide a poor-man's version
        try {
            return modal.modal({backdrop: 'static'});
        }
        catch (err) {
            // show the backdrop
            $(document.body).addClass('modal-open');
            var $backdrop = $('<div class="modal-backdrop fade">').appendTo($(document.body));
            $backdrop[0].offsetWidth; // force reflow
            $backdrop.addClass('in');
            // hook up removals
            modal.on('click', '[data-dismiss="modal"]', function modal_close() {
                // hide the modal foreground
                modal.removeClass('in');
                setTimeout(function on_foreground_hidden() {
                    modal.remove();
                    // now hide the backdrop
                    $backdrop.removeClass('in');
                    // wait for transition
                    setTimeout(function on_backdrop_hidden() {
                        $(document.body).removeClass('modal-open');
                        $backdrop.remove();
                    }, 150);
                }, 300);
            });
            // wait for transition
            setTimeout(function () {
                // now show the modal foreground
                modal.appendTo(document.body).show().scrollTop(0);
                modal[0].offsetWidth; // force reflow
                modal.addClass('in');
                // wait for transition, then trigger callbacks
                setTimeout(function on_foreground_shown() {
                    modal.trigger('shown.bs.modal');
                }, 300);
            }, 150);
            return modal;
        }
    };

    return {
        highlight_toc_item: highlight_toc_item,
        table_of_contents: table_of_contents,
        toggle_toc: toggle_toc,
    };
});
// export table_of_contents to global namespace for backwards compatibility
// Do export synchronously, so that it's defined as soon as this file is loaded
if (!require.specified('base/js/namespace')) {
    window.table_of_contents = function(cfg, st) {
        "use strict";
        // use require to ensure the module is correctly loaded before the
        // actual call is made
        require(['nbextensions/toc2/toc2'], function(toc2) {
            toc2.table_of_contents(cfg, st);
        });
    };
}
