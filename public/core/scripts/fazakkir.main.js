var app = (function () {
    'use strict';

    function noop() { }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function afterUpdate(fn) {
        get_current_component().$$.after_update.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    function getContext(key) {
        return get_current_component().$$.context.get(key);
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    const seen_callbacks = new Set();
    function flush() {
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.18.1' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
    }

    /* src/partials/Header.svelte generated by Svelte v3.18.1 */

    const file = "src/partials/Header.svelte";

    function create_fragment(ctx) {
    	let header;
    	let p;

    	const block = {
    		c: function create() {
    			header = element("header");
    			p = element("p");
    			p.textContent = "faZakkir - فَذَكِّــرْ";
    			attr_dev(p, "class", "svelte-njeupk");
    			add_location(p, file, 1, 1, 10);
    			attr_dev(header, "class", "svelte-njeupk");
    			add_location(header, file, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, header, anchor);
    			append_dev(header, p);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(header);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    /* src/partials/Footer.svelte generated by Svelte v3.18.1 */

    const file$1 = "src/partials/Footer.svelte";

    function create_fragment$1(ctx) {
    	let footer;
    	let p;

    	const block = {
    		c: function create() {
    			footer = element("footer");
    			p = element("p");
    			p.textContent = "من تصميــم و تطويـــر يــونس بــوعـلام";
    			attr_dev(p, "class", "left svelte-1r0i695");
    			add_location(p, file$1, 1, 1, 10);
    			attr_dev(footer, "class", "svelte-1r0i695");
    			add_location(footer, file$1, 0, 0, 0);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, footer, anchor);
    			append_dev(footer, p);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    class Footer extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, null, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Footer",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    /* src/components/Card.svelte generated by Svelte v3.18.1 */
    const file$2 = "src/components/Card.svelte";

    function create_fragment$2(ctx) {
    	let section;
    	let div1;
    	let div0;
    	let span0;
    	let img0;
    	let img0_src_value;
    	let t0;
    	let span1;
    	let img1;
    	let img1_src_value;
    	let t1;
    	let canvas;
    	let dispose;

    	const block = {
    		c: function create() {
    			section = element("section");
    			div1 = element("div");
    			div0 = element("div");
    			span0 = element("span");
    			img0 = element("img");
    			t0 = space();
    			span1 = element("span");
    			img1 = element("img");
    			t1 = space();
    			canvas = element("canvas");
    			if (img0.src !== (img0_src_value = "./core/assets/svg/close.svg")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "close");
    			attr_dev(img0, "class", "svelte-1iu0a4c");
    			add_location(img0, file$2, 127, 4, 2838);
    			set_style(span0, "animation-delay", "0s");
    			attr_dev(span0, "class", "animate-right svelte-1iu0a4c");
    			add_location(span0, file$2, 126, 3, 2751);
    			if (img1.src !== (img1_src_value = "./core/assets/svg/download.svg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "download");
    			attr_dev(img1, "class", "svelte-1iu0a4c");
    			add_location(img1, file$2, 131, 4, 2992);
    			set_style(span1, "animation-delay", ".2s");
    			attr_dev(span1, "class", "animate-right svelte-1iu0a4c");
    			add_location(span1, file$2, 130, 3, 2905);
    			attr_dev(div0, "class", "control svelte-1iu0a4c");
    			add_location(div0, file$2, 125, 2, 2726);
    			attr_dev(canvas, "class", "animate-down svelte-1iu0a4c");
    			add_location(canvas, file$2, 135, 2, 3073);
    			attr_dev(div1, "class", "backdrop svelte-1iu0a4c");
    			add_location(div1, file$2, 124, 1, 2701);
    			attr_dev(section, "class", "svelte-1iu0a4c");
    			add_location(section, file$2, 123, 0, 2690);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			append_dev(section, div1);
    			append_dev(div1, div0);
    			append_dev(div0, span0);
    			append_dev(span0, img0);
    			append_dev(div0, t0);
    			append_dev(div0, span1);
    			append_dev(span1, img1);
    			append_dev(div1, t1);
    			append_dev(div1, canvas);
    			/*canvas_binding*/ ctx[9](canvas);

    			dispose = [
    				listen_dev(span0, "click", /*closeDrawing*/ ctx[2], false, false, false),
    				listen_dev(span1, "click", /*exportVerse*/ ctx[1], false, false, false)
    			];
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			/*canvas_binding*/ ctx[9](null);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function fragmentText(ctx, text, maxWidth) {
    	let words = text.split(" "), lines = [], line = "";

    	if (ctx.measureText(text).width < maxWidth) {
    		return [text];
    	}

    	while (words.length > 0) {
    		while (ctx.measureText(words[0]).width >= maxWidth) {
    			let tmp = words[0];
    			words[0] = tmp.slice(0, -1);

    			if (words.length > 1) {
    				words[1] = tmp.slice(-1) + words[1];
    			} else {
    				words.push(tmp.slice(-1));
    			}
    		}

    		if (ctx.measureText(line + words[0]).width < maxWidth) {
    			line += words.shift() + " ";
    		} else {
    			lines.push(line);
    			line = "";
    		}

    		if (words.length === 0) {
    			lines.push(line);
    		}
    	}

    	return lines;
    }

    function instance($$self, $$props, $$invalidate) {
    	let verseCard;
    	let dispatch = createEventDispatcher();
    	let appName = `فَذَكِّــرْ - faZakkir`;
    	let { verse, detail } = getContext("currentVerse");

    	function drawVerse(canvas, lines) {
    		let pattern = new Image();
    		let ctx = canvas.getContext("2d");
    		pattern.src = "./core/assets/patterns/frame.png";
    		ctx.fillStyle = "rgba(0, 0, 0, .8)";
    		ctx.fillRect(0, 0, canvas.width, canvas.height);

    		pattern.onload = function () {
    			ctx.drawImage(pattern, 0, 0);
    			ctx.fillStyle = "#FFFFFF";
    			ctx.textAlign = "right";
    			ctx.font = "16px 'Cairo'";
    			ctx.fillText(detail, canvas.width - 40, 50);
    			ctx.font = "16px 'Cairo'";
    			ctx.textAlign = "left";
    			ctx.fillText(appName, 40, 50);
    			ctx.textAlign = "center";
    			ctx.font = "18px 'Cairo'";
    			ctx.fillText(`بسم اللََّــه الرحمــان الرحــيـــم`, canvas.width / 2, canvas.height / 2.4);
    			ctx.font = "44px 'Arial'";

    			lines.forEach(function (line, i) {
    				ctx.fillText(line, canvas.width / 2, (i + 5.7) * 56);
    			});

    			ctx.font = "12px 'Cairo'";
    			ctx.fillText(`ثم تصدير هذه الصورة باستخدام اضافة [ ${appName} ]`, canvas.width / 2, canvas.height * 0.93);
    		};
    	}

    	function makeCanvas() {
    		let ctx = verseCard.getContext("2d"),
    			backImage = new Image(),
    			lines = fragmentText(ctx, `** ${verse} **`, verseCard.width * 0.35);

    		$$invalidate(0, verseCard.width = 600, verseCard);
    		$$invalidate(0, verseCard.height = 600, verseCard);
    		backImage.crossOrigin = "Anonymous";
    		backImage.src = "https://source.unsplash.com/random/600x600/?quran,mosque";

    		backImage.onload = function () {
    			ctx.drawImage(backImage, 0, 0);
    			drawVerse(verseCard, lines);
    		};
    	}

    	function exportVerse() {
    		verseCard.toBlob(
    			function (blob) {
    				let link = document.createElement("a");
    				link.download = `${detail}.jpg`;
    				link.href = URL.createObjectURL(blob);
    				link.click();
    				URL.revokeObjectURL(link.href);
    			},
    			"image/jpeg",
    			1
    		);

    		closeDrawing();
    	}

    	function closeDrawing() {
    		dispatch("close", false);
    	}

    	onMount(() => {
    		makeCanvas();
    	});

    	function canvas_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(0, verseCard = $$value);
    		});
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("verseCard" in $$props) $$invalidate(0, verseCard = $$props.verseCard);
    		if ("dispatch" in $$props) dispatch = $$props.dispatch;
    		if ("appName" in $$props) appName = $$props.appName;
    		if ("verse" in $$props) verse = $$props.verse;
    		if ("detail" in $$props) detail = $$props.detail;
    	};

    	return [
    		verseCard,
    		exportVerse,
    		closeDrawing,
    		dispatch,
    		appName,
    		verse,
    		detail,
    		drawVerse,
    		makeCanvas,
    		canvas_binding
    	];
    }

    class Card extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment$2, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Card",
    			options,
    			id: create_fragment$2.name
    		});
    	}
    }

    /* src/components/TheVerse.svelte generated by Svelte v3.18.1 */
    const file$3 = "src/components/TheVerse.svelte";

    // (33:1) {#if exported}
    function create_if_block_1(ctx) {
    	let current;
    	const card = new Card({ $$inline: true });
    	card.$on("close", /*close_handler*/ ctx[9]);

    	const block = {
    		c: function create() {
    			create_component(card.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(card, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(card.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(card.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(card, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(33:1) {#if exported}",
    		ctx
    	});

    	return block;
    }

    // (37:1) {#if copied}
    function create_if_block(ctx) {
    	let div;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "ثم النــــــسخ";
    			attr_dev(div, "class", "copied animate-up svelte-le6abr");
    			add_location(div, file$3, 37, 2, 610);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(37:1) {#if copied}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let section;
    	let t0;
    	let t1;
    	let div0;
    	let span0;
    	let img0;
    	let img0_src_value;
    	let t2;
    	let span1;
    	let img1;
    	let img1_src_value;
    	let t3;
    	let span2;
    	let img2;
    	let img2_src_value;
    	let t4;
    	let div1;
    	let span3;
    	let t6;
    	let h1;
    	let t8;
    	let hr;
    	let t9;
    	let h2;
    	let t11;
    	let input;
    	let current;
    	let dispose;
    	let if_block0 = /*exported*/ ctx[0] && create_if_block_1(ctx);
    	let if_block1 = /*copied*/ ctx[1] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			section = element("section");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			div0 = element("div");
    			span0 = element("span");
    			img0 = element("img");
    			t2 = space();
    			span1 = element("span");
    			img1 = element("img");
    			t3 = space();
    			span2 = element("span");
    			img2 = element("img");
    			t4 = space();
    			div1 = element("div");
    			span3 = element("span");
    			span3.textContent = "بسم الله الرحمــــــــان الرحيــــــــــــــم";
    			t6 = space();
    			h1 = element("h1");
    			h1.textContent = `${/*verse*/ ctx[3]}`;
    			t8 = space();
    			hr = element("hr");
    			t9 = space();
    			h2 = element("h2");
    			h2.textContent = `${/*detail*/ ctx[4]}`;
    			t11 = space();
    			input = element("input");
    			if (img0.src !== (img0_src_value = "core/assets/svg/share.svg")) attr_dev(img0, "src", img0_src_value);
    			attr_dev(img0, "alt", "share");
    			attr_dev(img0, "class", "svelte-le6abr");
    			add_location(img0, file$3, 42, 3, 781);
    			set_style(span0, "animation-delay", ".3s");
    			attr_dev(span0, "class", "animate-right svelte-le6abr");
    			add_location(span0, file$3, 41, 2, 695);
    			if (img1.src !== (img1_src_value = "core/assets/svg/copy.svg")) attr_dev(img1, "src", img1_src_value);
    			attr_dev(img1, "alt", "copy");
    			attr_dev(img1, "class", "svelte-le6abr");
    			add_location(img1, file$3, 46, 3, 930);
    			set_style(span1, "animation-delay", ".5s");
    			attr_dev(span1, "class", "animate-right svelte-le6abr");
    			add_location(span1, file$3, 45, 2, 846);
    			if (img2.src !== (img2_src_value = "core/assets/svg/reload.svg")) attr_dev(img2, "src", img2_src_value);
    			attr_dev(img2, "alt", "reload");
    			attr_dev(img2, "class", "svelte-le6abr");
    			add_location(img2, file$3, 50, 3, 1077);
    			set_style(span2, "animation-delay", ".7s");
    			attr_dev(span2, "class", "animate-right svelte-le6abr");
    			add_location(span2, file$3, 49, 2, 991);
    			attr_dev(div0, "class", "control svelte-le6abr");
    			add_location(div0, file$3, 40, 1, 671);
    			attr_dev(span3, "class", "animate-down svelte-le6abr");
    			set_style(span3, "animation-delay", "0");
    			add_location(span3, file$3, 55, 2, 1171);
    			attr_dev(h1, "class", "animate-up svelte-le6abr");
    			set_style(h1, "animation-delay", ".2s");
    			add_location(h1, file$3, 56, 2, 1280);
    			attr_dev(hr, "class", "animate-right svelte-le6abr");
    			add_location(hr, file$3, 57, 2, 1349);
    			attr_dev(h2, "class", "animate-down svelte-le6abr");
    			set_style(h2, "animation-delay", ".4s");
    			add_location(h2, file$3, 58, 2, 1378);
    			attr_dev(div1, "class", "verse svelte-le6abr");
    			add_location(div1, file$3, 54, 1, 1149);
    			attr_dev(input, "type", "text");
    			input.value = /*verse*/ ctx[3];
    			attr_dev(input, "class", "svelte-le6abr");
    			add_location(input, file$3, 61, 1, 1458);
    			attr_dev(section, "class", "svelte-le6abr");
    			add_location(section, file$3, 31, 0, 514);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, section, anchor);
    			if (if_block0) if_block0.m(section, null);
    			append_dev(section, t0);
    			if (if_block1) if_block1.m(section, null);
    			append_dev(section, t1);
    			append_dev(section, div0);
    			append_dev(div0, span0);
    			append_dev(span0, img0);
    			append_dev(div0, t2);
    			append_dev(div0, span1);
    			append_dev(span1, img1);
    			append_dev(div0, t3);
    			append_dev(div0, span2);
    			append_dev(span2, img2);
    			append_dev(section, t4);
    			append_dev(section, div1);
    			append_dev(div1, span3);
    			append_dev(div1, t6);
    			append_dev(div1, h1);
    			append_dev(div1, t8);
    			append_dev(div1, hr);
    			append_dev(div1, t9);
    			append_dev(div1, h2);
    			append_dev(section, t11);
    			append_dev(section, input);
    			/*input_binding*/ ctx[10](input);
    			current = true;

    			dispose = [
    				listen_dev(span0, "click", /*exportVerse*/ ctx[7], false, false, false),
    				listen_dev(span1, "click", /*copyVerse*/ ctx[5], false, false, false),
    				listen_dev(span2, "click", /*reloadVerse*/ ctx[6], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*exported*/ ctx[0]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    					transition_in(if_block0, 1);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(section, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*copied*/ ctx[1]) {
    				if (!if_block1) {
    					if_block1 = create_if_block(ctx);
    					if_block1.c();
    					if_block1.m(section, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			/*input_binding*/ ctx[10](null);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { verse, detail } = getContext("currentVerse");
    	let emit = createEventDispatcher();
    	let exported = false;
    	let copied = false;
    	let copyText;

    	function copyVerse() {
    		copyText.select();
    		$$invalidate(1, copied = true);
    		document.execCommand("copy");

    		setTimeout(
    			function () {
    				$$invalidate(1, copied = false);
    			},
    			1000
    		);
    	}

    	function reloadVerse() {
    		emit("shuffle");
    	}

    	function exportVerse() {
    		$$invalidate(0, exported = true);
    	}

    	const close_handler = () => $$invalidate(0, exported = false);

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			$$invalidate(2, copyText = $$value);
    		});
    	}

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("verse" in $$props) $$invalidate(3, verse = $$props.verse);
    		if ("detail" in $$props) $$invalidate(4, detail = $$props.detail);
    		if ("emit" in $$props) emit = $$props.emit;
    		if ("exported" in $$props) $$invalidate(0, exported = $$props.exported);
    		if ("copied" in $$props) $$invalidate(1, copied = $$props.copied);
    		if ("copyText" in $$props) $$invalidate(2, copyText = $$props.copyText);
    	};

    	return [
    		exported,
    		copied,
    		copyText,
    		verse,
    		detail,
    		copyVerse,
    		reloadVerse,
    		exportVerse,
    		emit,
    		close_handler,
    		input_binding
    	];
    }

    class TheVerse extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$3, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "TheVerse",
    			options,
    			id: create_fragment$3.name
    		});
    	}
    }

    /* src/components/Explication.svelte generated by Svelte v3.18.1 */
    const file$4 = "src/components/Explication.svelte";

    function create_fragment$4(ctx) {
    	let aside;
    	let ul;
    	let li0;
    	let span0;
    	let t1;
    	let li1;
    	let span1;
    	let t3;
    	let hr;
    	let t4;
    	let section;
    	let p;
    	let t6;
    	let span2;
    	let t7;
    	let strong;
    	let section_hidden_value;
    	let t9;
    	let table;
    	let tbody;
    	let tr0;
    	let td0;
    	let t11;
    	let td1;
    	let t13;
    	let tr1;
    	let td2;
    	let t15;
    	let td3;
    	let t17;
    	let tr2;
    	let td4;
    	let t19;
    	let td5;
    	let t21;
    	let tr3;
    	let td6;
    	let t23;
    	let td7;
    	let t25;
    	let tr4;
    	let td8;
    	let t27;
    	let td9;
    	let t29;
    	let tr5;
    	let td10;
    	let t31;
    	let td11;
    	let t33;
    	let tr6;
    	let td12;
    	let t35;
    	let td13;
    	let table_hidden_value;
    	let dispose;

    	const block = {
    		c: function create() {
    			aside = element("aside");
    			ul = element("ul");
    			li0 = element("li");
    			span0 = element("span");
    			span0.textContent = "تفسيــر الأية";
    			t1 = space();
    			li1 = element("li");
    			span1 = element("span");
    			span1.textContent = "توثــــــيق السورة";
    			t3 = space();
    			hr = element("hr");
    			t4 = space();
    			section = element("section");
    			p = element("p");
    			p.textContent = `${/*explication*/ ctx[1]}`;
    			t6 = space();
    			span2 = element("span");
    			t7 = text("المفســـر: ");
    			strong = element("strong");
    			strong.textContent = `${/*interpreter*/ ctx[2]}`;
    			t9 = space();
    			table = element("table");
    			tbody = element("tbody");
    			tr0 = element("tr");
    			td0 = element("td");
    			td0.textContent = "الســـورة :";
    			t11 = space();
    			td1 = element("td");
    			td1.textContent = `${/*name*/ ctx[3]}`;
    			t13 = space();
    			tr1 = element("tr");
    			td2 = element("td");
    			td2.textContent = "نـــوعــــــــها :";
    			t15 = space();
    			td3 = element("td");
    			td3.textContent = `${/*type*/ ctx[4]}`;
    			t17 = space();
    			tr2 = element("tr");
    			td4 = element("td");
    			td4.textContent = "ترتيبها في القرآن :";
    			t19 = space();
    			td5 = element("td");
    			td5.textContent = `${/*order*/ ctx[5]}`;
    			t21 = space();
    			tr3 = element("tr");
    			td6 = element("td");
    			td6.textContent = "السورة السابقة :";
    			t23 = space();
    			td7 = element("td");
    			td7.textContent = `${/*prevSuret*/ ctx[8]}`;
    			t25 = space();
    			tr4 = element("tr");
    			td8 = element("td");
    			td8.textContent = "السورة التالية :";
    			t27 = space();
    			td9 = element("td");
    			td9.textContent = `${/*nextSuret*/ ctx[9]}`;
    			t29 = space();
    			tr5 = element("tr");
    			td10 = element("td");
    			td10.textContent = "عـــدد الايــــات :";
    			t31 = space();
    			td11 = element("td");
    			td11.textContent = `${/*numVerses*/ ctx[6]}`;
    			t33 = space();
    			tr6 = element("tr");
    			td12 = element("td");
    			td12.textContent = "عـــدد الكلمـــات :";
    			t35 = space();
    			td13 = element("td");
    			td13.textContent = `${/*numWords*/ ctx[7]}`;
    			attr_dev(span0, "class", "svelte-5j9yxr");
    			add_location(span0, file$4, 16, 3, 438);
    			attr_dev(li0, "class", "animate-left svelte-5j9yxr");
    			set_style(li0, "animation-delay", ".1s");
    			toggle_class(li0, "active", /*tab*/ ctx[0] == "explication");
    			add_location(li0, file$4, 11, 2, 287);
    			attr_dev(span1, "class", "svelte-5j9yxr");
    			add_location(span1, file$4, 24, 3, 633);
    			attr_dev(li1, "class", "animate-left svelte-5j9yxr");
    			set_style(li1, "animation-delay", ".2s");
    			toggle_class(li1, "active", /*tab*/ ctx[0] == "documentation");
    			add_location(li1, file$4, 19, 2, 478);
    			attr_dev(ul, "class", "svelte-5j9yxr");
    			add_location(ul, file$4, 10, 1, 280);
    			attr_dev(hr, "class", "svelte-5j9yxr");
    			add_location(hr, file$4, 28, 1, 682);
    			attr_dev(p, "class", "animate-left svelte-5j9yxr");
    			set_style(p, "animation-delay", ".1s");
    			add_location(p, file$4, 31, 2, 733);
    			attr_dev(strong, "class", "svelte-5j9yxr");
    			add_location(strong, file$4, 33, 14, 879);
    			attr_dev(span2, "class", "animate-left svelte-5j9yxr");
    			set_style(span2, "animation-delay", ".2s");
    			add_location(span2, file$4, 32, 2, 808);
    			section.hidden = section_hidden_value = /*tab*/ ctx[0] != "explication";
    			attr_dev(section, "class", "svelte-5j9yxr");
    			add_location(section, file$4, 30, 1, 689);
    			attr_dev(td0, "class", "svelte-5j9yxr");
    			add_location(td0, file$4, 40, 4, 1050);
    			attr_dev(td1, "class", "svelte-5j9yxr");
    			add_location(td1, file$4, 41, 4, 1075);
    			attr_dev(tr0, "class", "animate-left svelte-5j9yxr");
    			set_style(tr0, "animation-delay", ".1s");
    			add_location(tr0, file$4, 39, 3, 991);
    			attr_dev(td2, "class", "svelte-5j9yxr");
    			add_location(td2, file$4, 45, 4, 1168);
    			attr_dev(td3, "class", "svelte-5j9yxr");
    			add_location(td3, file$4, 46, 4, 1200);
    			attr_dev(tr1, "class", "animate-left svelte-5j9yxr");
    			set_style(tr1, "animation-delay", ".2s");
    			add_location(tr1, file$4, 44, 3, 1109);
    			attr_dev(td4, "class", "svelte-5j9yxr");
    			add_location(td4, file$4, 50, 4, 1290);
    			attr_dev(td5, "class", "svelte-5j9yxr");
    			add_location(td5, file$4, 51, 4, 1323);
    			attr_dev(tr2, "class", "animate-left svelte-5j9yxr");
    			set_style(tr2, "animation-delay", ".3s");
    			add_location(tr2, file$4, 49, 3, 1231);
    			attr_dev(td6, "class", "svelte-5j9yxr");
    			add_location(td6, file$4, 55, 4, 1417);
    			attr_dev(td7, "class", "svelte-5j9yxr");
    			add_location(td7, file$4, 56, 4, 1447);
    			attr_dev(tr3, "class", "animate-left svelte-5j9yxr");
    			set_style(tr3, "animation-delay", ".4s");
    			add_location(tr3, file$4, 54, 3, 1358);
    			attr_dev(td8, "class", "svelte-5j9yxr");
    			add_location(td8, file$4, 60, 4, 1542);
    			attr_dev(td9, "class", "svelte-5j9yxr");
    			add_location(td9, file$4, 61, 4, 1572);
    			attr_dev(tr4, "class", "animate-left svelte-5j9yxr");
    			set_style(tr4, "animation-delay", ".5s");
    			add_location(tr4, file$4, 59, 3, 1483);
    			attr_dev(td10, "class", "svelte-5j9yxr");
    			add_location(td10, file$4, 65, 4, 1667);
    			attr_dev(td11, "class", "svelte-5j9yxr");
    			add_location(td11, file$4, 66, 4, 1700);
    			attr_dev(tr5, "class", "animate-left svelte-5j9yxr");
    			set_style(tr5, "animation-delay", ".6s");
    			add_location(tr5, file$4, 64, 3, 1608);
    			attr_dev(td12, "class", "svelte-5j9yxr");
    			add_location(td12, file$4, 70, 4, 1795);
    			attr_dev(td13, "class", "svelte-5j9yxr");
    			add_location(td13, file$4, 71, 4, 1828);
    			attr_dev(tr6, "class", "animate-left svelte-5j9yxr");
    			set_style(tr6, "animation-delay", ".7s");
    			add_location(tr6, file$4, 69, 3, 1736);
    			add_location(tbody, file$4, 38, 2, 980);
    			table.hidden = table_hidden_value = /*tab*/ ctx[0] != "documentation";
    			attr_dev(table, "class", "svelte-5j9yxr");
    			add_location(table, file$4, 37, 1, 936);
    			attr_dev(aside, "class", "svelte-5j9yxr");
    			add_location(aside, file$4, 9, 0, 271);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, aside, anchor);
    			append_dev(aside, ul);
    			append_dev(ul, li0);
    			append_dev(li0, span0);
    			append_dev(ul, t1);
    			append_dev(ul, li1);
    			append_dev(li1, span1);
    			append_dev(aside, t3);
    			append_dev(aside, hr);
    			append_dev(aside, t4);
    			append_dev(aside, section);
    			append_dev(section, p);
    			append_dev(section, t6);
    			append_dev(section, span2);
    			append_dev(span2, t7);
    			append_dev(span2, strong);
    			append_dev(aside, t9);
    			append_dev(aside, table);
    			append_dev(table, tbody);
    			append_dev(tbody, tr0);
    			append_dev(tr0, td0);
    			append_dev(tr0, t11);
    			append_dev(tr0, td1);
    			append_dev(tbody, t13);
    			append_dev(tbody, tr1);
    			append_dev(tr1, td2);
    			append_dev(tr1, t15);
    			append_dev(tr1, td3);
    			append_dev(tbody, t17);
    			append_dev(tbody, tr2);
    			append_dev(tr2, td4);
    			append_dev(tr2, t19);
    			append_dev(tr2, td5);
    			append_dev(tbody, t21);
    			append_dev(tbody, tr3);
    			append_dev(tr3, td6);
    			append_dev(tr3, t23);
    			append_dev(tr3, td7);
    			append_dev(tbody, t25);
    			append_dev(tbody, tr4);
    			append_dev(tr4, td8);
    			append_dev(tr4, t27);
    			append_dev(tr4, td9);
    			append_dev(tbody, t29);
    			append_dev(tbody, tr5);
    			append_dev(tr5, td10);
    			append_dev(tr5, t31);
    			append_dev(tr5, td11);
    			append_dev(tbody, t33);
    			append_dev(tbody, tr6);
    			append_dev(tr6, td12);
    			append_dev(tr6, t35);
    			append_dev(tr6, td13);

    			dispose = [
    				listen_dev(li0, "click", /*click_handler*/ ctx[11], false, false, false),
    				listen_dev(li1, "click", /*click_handler_1*/ ctx[12], false, false, false)
    			];
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*tab*/ 1) {
    				toggle_class(li0, "active", /*tab*/ ctx[0] == "explication");
    			}

    			if (dirty & /*tab*/ 1) {
    				toggle_class(li1, "active", /*tab*/ ctx[0] == "documentation");
    			}

    			if (dirty & /*tab*/ 1 && section_hidden_value !== (section_hidden_value = /*tab*/ ctx[0] != "explication")) {
    				prop_dev(section, "hidden", section_hidden_value);
    			}

    			if (dirty & /*tab*/ 1 && table_hidden_value !== (table_hidden_value = /*tab*/ ctx[0] != "documentation")) {
    				prop_dev(table, "hidden", table_hidden_value);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(aside);
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { explication, interpreter, documentation } = getContext("currentVerse");
    	let { name, type, order, numVerses, numWords, prevSuret, nextSuret } = documentation;
    	let tab = "explication";
    	const click_handler = () => $$invalidate(0, tab = "explication");
    	const click_handler_1 = () => $$invalidate(0, tab = "documentation");

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("explication" in $$props) $$invalidate(1, explication = $$props.explication);
    		if ("interpreter" in $$props) $$invalidate(2, interpreter = $$props.interpreter);
    		if ("documentation" in $$props) documentation = $$props.documentation;
    		if ("name" in $$props) $$invalidate(3, name = $$props.name);
    		if ("type" in $$props) $$invalidate(4, type = $$props.type);
    		if ("order" in $$props) $$invalidate(5, order = $$props.order);
    		if ("numVerses" in $$props) $$invalidate(6, numVerses = $$props.numVerses);
    		if ("numWords" in $$props) $$invalidate(7, numWords = $$props.numWords);
    		if ("prevSuret" in $$props) $$invalidate(8, prevSuret = $$props.prevSuret);
    		if ("nextSuret" in $$props) $$invalidate(9, nextSuret = $$props.nextSuret);
    		if ("tab" in $$props) $$invalidate(0, tab = $$props.tab);
    	};

    	return [
    		tab,
    		explication,
    		interpreter,
    		name,
    		type,
    		order,
    		numVerses,
    		numWords,
    		prevSuret,
    		nextSuret,
    		documentation,
    		click_handler,
    		click_handler_1
    	];
    }

    class Explication extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$4, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Explication",
    			options,
    			id: create_fragment$4.name
    		});
    	}
    }

    let verses = [{
    	verse: "وَإِذَا مَرِضْتُ فَهُوَ يَشْفِينِ",
    	detail: "سورة الشعراء - الآية 80",
    	explication: "إذا وقعت في مرض فإنه لا يقدر على شفائي أحد غيره ، بما يقدر من الأسباب الموصلة إليه .",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "الشعراء",
    		type: "مكية",
    		order: "26",
    		numVerses: "227",
    		prevSuret: "الفرقان",
    		nextSuret: "النمل",
    		numWords: "1322"
    	}
    },{
    	verse: "وَعَسَىٰ أَن تُحِبُّوا شَيْئًا وَهُوَ شَرٌّ لَّكُمْ",
    	detail: "سورة البقرة - الآية 216",
    	explication: "هذا عام في الأمور كلها ، قد يحب المرء شيئا ، وليس له فيه خيرة ولا مصلحة . ومن ذلك القعود عن القتال ، قد يعقبه استيلاء العدو على البلاد والحكم .",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "إِلَّا مَنْ أَتَى اللَّهَ بِقَلْبٍ سَلِيمٍ",
    	detail: "سورة الشعراء - الآية 89",
    	explication: "القلب السليم معناه الذي سلم من الشرك والشك ومحبة الشر والإصرار على البدعة والذنوب ويلزم من سلامته مما ذكر اتصافه بأضدادها من الإخلاص والعلم واليقين ومحبة الخير وتزيينه في قلبه وأن تكون إرادته ومحبته تابعة لمحبة الله وهواه تابعا لما جاء عن الله",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الشعراء",
    		type: "مكية",
    		order: "26",
    		numVerses: "227",
    		prevSuret: "الفرقان",
    		nextSuret: "النمل",
    		numWords: "1322"
    	}
    },{
    	verse: "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ",
    	detail: "سورة الرعد - الآية 28",
    	explication: "حقيق بها وحريٌّ أن لا تطمئن لشيء سوى ذكره، فإنه لا شيء ألذ للقلوب ولا أشهى ولا أحلى من محبة خالقها، والأنس به ومعرفته، وعلى قدر معرفتها بالله ومحبتها له، يكون ذكرها له، هذا على القول بأن ذكر الله، ذكر العبد لربه، من تسبيح وتهليل وتكبير وغير ذلك.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الرعد",
    		type: "مدنية",
    		order: "13",
    		numVerses: "43",
    		prevSuret: "يوسف",
    		nextSuret: "إبراهيم",
    		numWords: "854"
    	}
    },{
    	verse: "وَرَبُّكَ الْغَفُورُ ذُو الرَّحْمَةِ",
    	detail: "سورة الكهف - الآية 58",
    	explication: "ثم أخبر تعالى عن سعة مغفرته ورحمته، وأنه يغفر الذنوب، ويتوب الله على من يتوب، فيتغمده برحمته، ويشمله بإحسانه، وأنه لو آخذ العباد على ما قدمت أيديهم من الذنوب، لعجل لهم العذاب، ولكنه تعالى حليم لا يعجل بالعقوبة، بل يمهل ولا يهمل، والذنوب لا بد من وقوع آثارها، وإن تأخرت عنها مدة طويلة.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الكهف",
    		type: "مكية",
    		order: "18",
    		numVerses: "110",
    		prevSuret: "الإسراء",
    		nextSuret: "مريم",
    		numWords: "1583"
    	}
    },{
    	verse: "فَقُلْتُ اسْتَغْـــــفِرُوا رَبَّكُــمْ إِنَّهُ كَانَ غَـــفَّارًا",
    	detail: "سورة نوح - الآية 10",
    	explication: "{{ فَقُلْتُ اسْتَغْفِرُوا رَبَّكُمْ }} أي: اتركوا ما أنتم عليه من الذنوب، واستغفروا الله منها. {{ إِنَّهُ كَانَ غَفَّارًا }} كثير المغفرة لمن تاب واستغفر، فرغبهم بمغفرة الذنوب، وما يترتب عليها من حصول الثواب، واندفاع العقاب.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "نوح",
    		type: "مكية",
    		order: "71",
    		numVerses: "28",
    		prevSuret: "المعارج",
    		nextSuret: "الجن	",
    		numWords: "227"
    	}
    },{
    	verse: "وَاتَّقُوا اللَّهَ إِنَّ اللَّهَ خَبِــــيرٌ بِمَا تَعْمَلُـــــونَ",
    	detail: "سورة الحشر - الآية 18",
    	explication: "يا أيها الذين صدّقوا الله ووحدوه، اتقوا الله بأداء فرائضه، واجتناب معاصيه. {{ إِنَّ اللَّهَ خَبِيرٌ بِمَا تَعْمَلُونَ }} يقول: إن الله ذو خبرة وعلم بأعمالكم خيرها وشرّها، لا يخفى عليه منها شيء، وهو مجازيكم على جميعها.",
    	interpreter: "الطبري",
    	documentation: {
    		name: "الحشر",
    		type: "مكية",
    		order: "94",
    		numVerses: "8",
    		prevSuret: "المجادلة",
    		nextSuret: "الممتحنة	",
    		numWords: "27"
    	}
    },{
    	verse: "إِنّ مَعَ الْعُــسْرِ يُــــسْراً",
    	detail: "سورة الشرح - الآية 5",
    	explication: "بشارة عظيمة، أنه كلما وجد عسر وصعوبة، فإن اليسر يقارنه ويصاحبه، حتى لو دخل العسر جحر ضب لدخل عليه اليسر",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الشرح",
    		type: "مكية",
    		order: "	94",
    		numVerses: "8",
    		prevSuret: "الضحى",
    		nextSuret: "التين",
    		numWords: "27"
    	}
    },{
    	verse: "إِنَّ أَكْرَمَكُمْ عِــندَ اللَّــــــهِ أَتْقَاكُـــمْ",
    	detail: "سورة الحجرات - الآية 13",
    	explication: "إن أكرمكم أيها الناس عند ربكم, أشدّكم اتقاء له بأداء فرائضه واجتناب معاصيه, لا أعظمكم بيتا ولا أكثركم عشيرة.",
    	interpreter: "الطبري",
    	documentation: {
    		name: "الحجرات",
    		type: "مدنية",
    		order: "49",
    		numVerses: "18",
    		prevSuret: "الفتح",
    		nextSuret: "ق",
    		numWords: "353"
    	}
    },{
    	verse: "وَتَوَكَّلْ عَلَى اللَّهِ وَكَـــفَىٰ بِاللَّــهِ وَكِيــــلًا",
    	detail: "سورة الأحزاب - الآية 3",
    	explication: "{{ وتوكل على الله }} أي : في جميع أمورك وأحوالك ، {{ وكفى بالله وكيلا }} أي : وكفى به وكيلا لمن توكل عليه وأناب إليه .",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "الأحزاب",
    		type: "مدنية",
    		order: "33",
    		numVerses: "73",
    		prevSuret: "السجدة",
    		nextSuret: "سبأ	",
    		numWords: "1303"
    	}
    },{
    	verse: "سَيَجْعَـلُ اللَّـهُ بَعْــدَ عُــسْـرٍ يُسْــــــرًا",
    	detail: "سورة الطلاق - الآية 7",
    	explication: "هذه بشارة للمعسرين، أن الله تعالى سيزيل عنهم الشدة، ويرفع عنهم المشقة، {{ فَإِنَّ مَعَ الْعُسْرِ يُسْرًا إِنَّ مَعَ الْعُسْرِ يُسْرًا }}",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الطلاق",
    		type: "مدنية",
    		order: "65",
    		numVerses: "12",
    		prevSuret: "التغابن",
    		nextSuret: "التحريم",
    		numWords: "279"
    	}
    },{
    	verse: "وَلَا يَغُرَّنَّـكُم بِاللَّهِ الْغَرُورُ",
    	detail: "سورة فاطر - الآية 5",
    	explication: "{{ ولا يغرنكم بالله الغرور }} وهو الشيطان . قاله ابن عباس . أي : لا يفتننكم الشيطان ويصرفنكم عن اتباع رسل الله وتصديق كلماته فإنه غرار كذاب أفاك",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "فاطر",
    		type: "مكية",
    		order: "35",
    		numVerses: "45",
    		prevSuret: "سبأ",
    		nextSuret: "يس",
    		numWords: "780"
    	}
    },{
    	verse: "يَا أَيُّـهَا النَّـــاسُ إِنَّ وَعْـــدَ اللَّــهِ حَــقٌّ",
    	detail: "سورة فاطر - الآية 5",
    	explication: "يقول تعالى: {{ يَا أَيُّهَا النَّاسُ إِنَّ وَعْدَ اللَّهِ }} بالبعث والجزاء على الأعمال، {{ حَقٌّ }} أي: لا شك فيه، ولا مرية، ولا تردد، قد دلت على ذلك الأدلة السمعية والبراهين العقلية، فإذا كان وعده حقا، فتهيئوا له، وبادروا أوقاتكم الشريفة بالأعمال الصالحة، ولا يقطعكم عن ذلك قاطع",
    	interpreter: "السعدي",
    	documentation: {
    		name: "فاطر",
    		type: "مكية",
    		order: "35",
    		numVerses: "45",
    		prevSuret: "سبأ",
    		nextSuret: "يس",
    		numWords: "780"
    	}
    },{
    	verse: "وَإِذْ تَــأَذَّنَ رَبُّــــكُمْ لَئِــــن شَكَرْتُــمْ لَأَزِيدَنَّـــــكُمْ",
    	detail: "سورة إبراهيم - الآية 7",
    	explication: " لئن شكرتم ربَّكم ، بطاعتكم إياه فيما أمركم ونهاكم ، لأزيدنكم في أياديه عندكم ونعمهِ عليكم ، على ما قد أعطاكم من النجاة من آل فرعون والخلاص مِنْ عذابهم.",
    	interpreter: "الطبري",
    	documentation: {
    		name: "إبراهيم",
    		type: "مكية",
    		order: "14",
    		numVerses: "52",
    		prevSuret: "الرعد",
    		nextSuret: "الحجر",
    		numWords: "831"
    	}
    },{
    	verse: "وَقَـالَ رَبُّكُـــــمُ ادْعُونِــي أَسْتَجِــــبْ لَكُـمْ",
    	detail: "سورة غافر - الآية 60",
    	explication: "ويقول ربكم أيها الناس لكم ادعوني: يقول: اعبدوني وأخلصوا لي العبادة دون من تعبدون من دوني من الأوثان والأصنام وغير ذلك {{ أَسْتَجِبْ لَكُمْ }} يقول: أُجِبْ دعاءكم فأعفو عنكم وأرحمكم",
    	interpreter: "الطبري",
    	documentation: {
    		name: "غافر",
    		type: "مكية",
    		order: "40",
    		numVerses: "85",
    		prevSuret: "الزمر",
    		nextSuret: "فصلت",
    		numWords: "1228"
    	}
    },{
    	verse: "نُّورٌ عَلَىٰ نُورٍ ۗ يَهْدِي اللَّهُ لِنُـورِهِ مَـن يَشَــاءُ",
    	detail: "سورة النور - الآية 35",
    	explication: "نور على نور يعني أن القرآن نور من الله تعالى لخلقه ، مع ما أقام لهم من الدلائل والإعلام قبل نزول القرآن ، فازدادوا بذلك نورا على نور . يهدي الله لنوره من يشاء ويضرب الله الأمثال للناس ثم أخبر أن هذا النور المذكور عزيز وأنه لا يناله إلا من أراد الله هداه فقال : يهدي الله لنوره من يشاء ويضرب الله الأمثال للناس أي يبين الأشباه تقريبا إلى الأفهام",
    	interpreter: "القرطبي",
    	documentation: {
    		name: "النور",
    		type: "مدنية",
    		order: "24",
    		numVerses: "64",
    		prevSuret: "المؤمنون",
    		nextSuret: "الفرقان",
    		numWords: "1317"
    	}
    },{
    	verse: "ذَلِكَ الْكِتَابُ لَا رَيْبَ فِيهِ هُدًى لِلْمُتَّقِينَ",
    	detail: "سورة البقرة - الآية 2",
    	explication: "أي هذا الكتاب العظيم الذي هو الكتاب على الحقيقة, المشتمل على ما لم تشتمل عليه كتب المتقدمين والمتأخرين من العلم العظيم, والحق المبين. فـ { لَا رَيْبَ فِيهِ } ولا شك بوجه من الوجوه، ونفي الريب عنه, يستلزم ضده, إذ ضد الريب والشك اليقين، فهذا الكتاب مشتمل على علم اليقين المزيل للشك والريب",
    	interpreter: "السعدي",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "سَلَامٌ عَلَيْكُمْ بِمَا صَبَرْتُمْ فَنِعْمَ عُقْبَى الدَّارِ",
    	detail: "سورة الرعد - الآية 24",
    	explication: "{{ سَلَامٌ عَلَيْكُمْ }} أي: حلت عليكم السلامة والتحية من الله وحصلت لكم، وذلك متضمن لزوال كل مكروه، ومستلزم لحصول كل محبوب. {{ بِمَا صَبَرْتُمْ }} أي: صبركم هو الذي أوصلكم إلى هذه المنازل العالية، والجنان الغالية، { فَنِعْمَ عُقْبَى الدَّارِ } فحقيق بمن نصح نفسه وكان لها عنده قيمة، أن يجاهدها، لعلها تأخذ من أوصاف أولي الألباب بنصيب، لعلها تحظى بهذه الدار، التي هي منية النفوس،",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الرعد",
    		type: "مدنية",
    		order: "13",
    		numVerses: "43",
    		prevSuret: "يوسف",
    		nextSuret: "إبراهيم",
    		numWords: "854"
    	}
    },{
    	verse: "لَا تَدْرِي لَعَلَّ اللَّهَ يُحْدِثُ بَعْدَ ذَلِكَ أَمْرًا",
    	detail: "سورة الطلاق - الآية 1",
    	explication: "شرع الله العدة، وحدد الطلاق بها، لحكم عظيمة: فمنها: أنه لعل الله يحدث في قلب المطلق الرحمة والمودة، فيراجع من طلقها، ويستأنف عشرتها، فيتمكن من ذلك مدة العدة، أولعله يطلقها لسبب منها، فيزول ذلك السبب في مدة العدة، فيراجعها لانتفاء سبب الطلاق.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الطلاق",
    		type: "مدنية",
    		order: "65",
    		numVerses: "12",
    		prevSuret: "التغابن",
    		nextSuret: "التحريم",
    		numWords: "279"
    	}
    },{
    	verse: "وَالَّذِينَ آمَنُوا أَشَدُّ حُبًّا لِلَّهِ",
    	detail: "سورة البقرة - الآية 165",
    	explication: "أي من أهل الأنداد لأندادهم, لأنهم أخلصوا محبتهم له, وهؤلاء أشركوا بها، ولأنهم أحبوا من يستحق المحبة على الحقيقة, الذي محبته هي عين صلاح العبد وسعادته وفوزه، والمشركون أحبوا من لا يستحق من الحب شيئا, ومحبته عين شقاء العبد وفساده, وتشتت أمره.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "إِنَّ اللَّهَ فَــالِقُ الْحَـبِّ وَالنَّوَىٰ",
    	detail: "سورة الأنعام - الآية 95",
    	explication: "معناه يشق الحبة عن السنبلة والنواة عن النخلة فيخرجها منها ، والحب جمع الحبة ، وهي اسم لجميع البذور والحبوب من البر والشعير والذرة ، وكل ما لم يكن له نوى",
    	interpreter: "البغوي",
    	documentation: {
    		name: "الأنعام",
    		type: "مكية",
    		order: "6",
    		numVerses: "165",
    		prevSuret: "المائدة",
    		nextSuret: "الأعراف",
    		numWords: "3055"
    	}
    },{
    	verse: "وَلَا تَعْتَدُوا إِنَّ اللَّهَ لَا يُحِبُّ الْمُعْتَدِينَ",
    	detail: "سورة البقرة - الآية 190",
    	explication: "قاتلوا في سبيل الله ولا تعتدوا في ذلك ويدخل في ذلك ارتكاب المناهي كما قاله الحسن البصري من المثلة ، والغلول ، وقتل النساء والصبيان والشيوخ الذين لا رأي لهم ولا قتال فيهم ، والرهبان وأصحاب الصوامع ، وتحريق الأشجار وقتل الحيوان لغير مصلحة ، كما قال ذلك ابن عباس ، وعمر بن عبد العزيز ، ومقاتل بن حيان ، وغيرهم",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "وَأَحْسِنُوا إِنَّ اللَّهَ يُحِبُّ الْمُحْسِنِينَ",
    	detail: "سورة البقرة - الآية 195",
    	explication: "الأمر بالإنفاق في سبيل الله في سائر وجوه القربات ووجوه الطاعات ، وخاصة صرف الأموال في قتال الأعداء ، وبذلها فيما يقوى به المسلمون على عدوهم ، والإخبار عن ترك فعل ذلك بأنه هلاك ودمار إن لزمه واعتاده . ثم عطف بالأمر بالإحسان ، وهو أعلى مقامات الطاعة",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "فَإِنْ تَوَلَّوْا فَإِنَّ اللَّهَ لَا يُحِبُّ الْكَافِرِينَ",
    	detail: "سورة آل عمران - الآية 32",
    	explication: " أي : خالفوا عن أمره {{ فإن الله لا يحب الكافرين }} فدل على أن مخالفته في الطريقة كفر ، والله لا يحب من اتصف بذلك ، وإن ادعى وزعم في نفسه أنه يحب لله ويتقرب إليه ، حتى يتابع الرسول النبي الأمي خاتم الرسل ، ورسول الله إلى جميع الثقلين الجن والإنس الذي لو كان الأنبياء في زمانه لما وسعهم إلا اتباعه ، والدخول في طاعته ، واتباع شريعته",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "آل عمران",
    		type: "مدنية",
    		order: "3",
    		numVerses: "200",
    		prevSuret: "البقرة",
    		nextSuret: "النساء",
    		numWords: "3503"
    	}
    },{
    	verse: "لَنْ تَنَالُوا الْبِرَّ حَتَّىٰ تُنْفِقُوا مِمَّا تُحِبُّونَ",
    	detail: "سورة آل عمران - الآية 92",
    	explication: "{{ لن تنالوا }} أي: تدركوا وتبلغوا البر الذي هو كل خير من أنواع الطاعات وأنواع المثوبات الموصل لصاحبه إلى الجنة، {{ حتى تنفقوا مما تحبون }} أي: من أموالكم النفيسة التي تحبها نفوسكم، فإنكم إذا قدمتم محبة الله على محبة الأموال فبذلتموها في مرضاته، دل ذلك على إيمانكم الصادق وبر قلوبكم ويقين تقواكم، فيدخل في ذلك إنفاق نفائس الأموال",
    	interpreter: "السعدي",
    	documentation: {
    		name: "آل عمران",
    		type: "مدنية",
    		order: "3",
    		numVerses: "200",
    		prevSuret: "البقرة",
    		nextSuret: "النساء",
    		numWords: "3503"
    	}
    },{
    	verse: "إِنَّ اللَّــهَ مَــعَ الصَّابِرِيــنَ",
    	detail: "سورة البقرة - الآية 153",
    	explication: "أن الصبر محتاج إليه العبد, بل مضطر إليه في كل حالة من أحواله، فلهذا أمر الله تعالى به, وأخبر أنه { مَعَ الصَّابِرِينَ } أي: مع من كان الصبر لهم خلقا, وصفة, وملكة بمعونته وتوفيقه, وتسديده، فهانت عليهم بذلك, المشاق والمكاره, وسهل عليهم كل عظيم, وزالت عنهم كل صعوبة، وهذه معية خاصة, تقتضي محبته ومعونته, ونصره وقربه",
    	interpreter: "السعدي",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "وَذَكِّرْ فَإِنَّ الذِّكْرَى تَنْفَـــــع الْمُؤْمِنِينَ",
    	detail: "سورة الذاريات - الآية 55",
    	explication: "والتذكير نوعان: تذكير بما لم يعرف تفصيله، مما عرف مجمله بالفطر والعقول فإن الله فطر العقول على محبة الخير وإيثاره، وكراهة الشر والزهد فيه، وشرعه موافق لذلك، فكل أمر ونهي من الشرع، فإنه من التذكير، وتمام التذكير،  والنوع الثاني من التذكير: تذكير بما هو معلوم للمؤمنين، ولكن انسحبت عليه الغفلة والذهول، فيذكرون بذلك، ويكرر عليهم ليرسخ في أذهانهم، وينتبهوا ويعملوا بما تذكروه",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الذاريات",
    		type: "مكية",
    		order: "51",
    		numVerses: "60",
    		prevSuret: "ق",
    		nextSuret: "الطور",
    		numWords: "360"
    	}
    },{
    	verse: "الَّــذِي خَلَقَنِــي فَهُوَ يَهْدِيــنِ",
    	detail: "سورة الشعراء - الآية 78",
    	explication: "أي هو الخالق الذي قدر قدرا وهدى الخلائق إليه فكل يجري على ما قدر له وهو الذي يهدي من يشاء ويضل من يشاء.",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "الشعراء",
    		type: "مكية",
    		order: "26",
    		numVerses: "227",
    		prevSuret: "الفرقان",
    		nextSuret: "النمل",
    		numWords: "1322"
    	}
    },{
    	verse: "وَمِمَّا رَزَقْنَاهُمْ يُنفِـقُونَ",
    	detail: "سورة البقرة - الآية 3",
    	explication: "يدخل فيه النفقات الواجبة كالزكاة, والنفقة على الزوجات والأقارب, والمماليك ونحو ذلك. والنفقات المستحبة بجميع طرق الخير. ولم يذكر المنفق عليهم, لكثرة أسبابه وتنوع أهله, ولأن النفقة من حيث هي, قربة إلى الله، وأتى بـ [ من ] الدالة على التبعيض, لينبههم أنه لم يرد منهم إلا جزءا يسيرا من أموالهم, غير ضار لهم ولا مثقل, بل ينتفعون هم بإنفاقه, وينتفع به إخوانهم.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "وَاللَّــهُ يُحِــبُّ الصَّابِرِيـــنَ",
    	detail: "سورة آل عمران - الآية 146",
    	explication: "{{ وكأين من نبي }} أي: وكم من نبي {{ قاتل معه ربيون كثير }} أي: جماعات كثيرون من أتباعهم، الذين قد ربتهم الأنبياء بالإيمان والأعمال الصالحة، فأصابهم قتل وجراح وغير ذلك. {{ فما وهنوا لما أصابهم في سبيل الله وما ضعفوا وما استكانوا }} أي: ما ضعفت قلوبهم، ولا وهنت أبدانهم، ولا استكانوا، أي: ذلوا لعدوهم، بل صبروا وثبتوا، وشجعوا أنفسهم، ولهذا قال: {{ والله يحب الصابرين }}",
    	interpreter: "السعدي",
    	documentation: {
    		name: "آل عمران",
    		type: "مدنية",
    		order: "3",
    		numVerses: "200",
    		prevSuret: "البقرة",
    		nextSuret: "النساء",
    		numWords: "3503"
    	}
    },{
    	verse: "وَاصْبِرْ فَإِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ",
    	detail: "سورة هود - الآية 115",
    	explication: "{{ وَاصْبِرْ }} أي: احبس نفسك على طاعة الله، وعن معصيته، وإلزامها لذلك، واستمر ولا تضجر. {{ فَإِنَّ اللَّهَ لَا يُضِيعُ أَجْرَ الْمُحْسِنِينَ }} بل يتقبل الله عنهم أحسن الذي عملوا، ويجزيهم أجرهم، بأحسن ما كانوا يعملون، وفي هذا ترغيب عظيم، للزوم الصبر، بتشويق النفس الضعيفة إلى ثواب الله، كلما ونت وفترت.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "هود",
    		type: "مكية",
    		order: "11",
    		numVerses: "123",
    		prevSuret: "يونس",
    		nextSuret: "يوسف",
    		numWords: "1947"
    	}
    },{
    	verse: "وَاسْتَغْــفِرِ اللَّــهَ إِنَّ اللَّهَ كَانَ غَفُورًا رَحِيمًا",
    	detail: "سورة النساء - الآية 106",
    	explication: "{{ وَاسْتَغْفِرِ اللَّهَ }} مما صدر منك إن صدر. {{ إِنَّ اللَّهَ كَانَ غَفُورًا رَحِيمًا }} أي: يغفر الذنب العظيم لمن استغفره، وتاب إليه وأناب ويوفقه للعمل الصالح بعد ذلك الموجِب لثوابه وزوال عقابه.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "النساء",
    		type: "مدنية",
    		order: "4",
    		numVerses: "176",
    		prevSuret: "آل عمران",
    		nextSuret: "المائدة",
    		numWords: "3745"
    	}
    },{
    	verse: "فَإِنِّي قَرِيبٌ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ",
    	detail: "سورة البقرة - الآية 186",
    	explication: "{{ وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ }} لأنه تعالى, الرقيب الشهيد, المطلع على السر وأخفى, يعلم خائنة الأعين وما تخفي الصدور, فهو قريب أيضا من داعيه, بالإجابة، ولهذا قال: {{ أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ }} والدعاء نوعان: دعاء عبادة, ودعاء مسألة. والقرب نوعان: قرب بعلمه من كل خلقه, وقرب من عابديه وداعيه بالإجابة والمعونة والتوفيق.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا",
    	detail: "سورة البقرة - الآية 286",
    	explication: "لا يكلف أحدا فوق طاقته ، وهذا من لطفه تعالى بخلقه ورأفته بهم وإحسانه إليهم ، وهذه هي الناسخة الرافعة لما كان أشفق منه الصحابة ، في قوله : {{ وإن تبدوا ما في أنفسكم أو تخفوه يحاسبكم به الله }} أي : هو وإن حاسب وسأل لكن لا يعذب إلا بما يملك الشخص دفعه ، فأما ما لا يمكن دفعه من وسوسة النفس وحديثها ، فهذا لا يكلف به الإنسان ، وكراهية الوسوسة السيئة من الإيمان ",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِيـــنَا أَوْ أَخْطَأْنَا",
    	detail: "سورة البقرة - الآية 286",
    	explication: "أي : إن تركنا فرضا على جهة النسيان ، أو فعلنا حراما كذلك ، {{ أو أخطأنا }} أي : الصواب في العمل ، جهلا منا بوجهه الشرعي .",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "البقرة",
    		type: "مدنية",
    		order: "2",
    		numVerses: "286",
    		prevSuret: "الفاتحة",
    		nextSuret: "آل عمران",
    		numWords: "6144"
    	}
    },{
    	verse: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا",
    	detail: "سورة آل عمران - الآية 9",
    	explication: "أي: لا تملها عن الحق جهلا وعنادا منا، بل اجعلنا مستقيمين هادين مهتدين، فثبتنا على هدايتك وعافنا مما ابتليت به الزائغين {{ وهب لنا من لدنك رحمة }} أي: عظيمة توفقنا بها للخيرات وتعصمنا بها من المنكرات {{ إنك أنت الوهاب }} أي: واسع العطايا والهبات، كثير الإحسان الذي عم جودك جميع البريات.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "آل عمران",
    		type: "مدنية",
    		order: "3",
    		numVerses: "200",
    		prevSuret: "البقرة",
    		nextSuret: "النساء",
    		numWords: "3503"
    	}
    },{
    	verse: "وَلَا تُفْسِدُوا فِي الْأَرْضِ بَعْدَ إِصْلَاحِهَا",
    	detail: "سورة الأعراف - الآية 56",
    	explication: "نهى تعالى عن الإفساد في الأرض ، وما أضره بعد الإصلاح ! فإنه إذا كانت الأمور ماشية على السداد ، ثم وقع الإفساد بعد ذلك ، كان أضر ما يكون على العباد . فنهى الله تعالى عن ذلك ، وأمر بعبادته ودعائه والتضرع إليه والتذلل لديه",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "الأعراف",
    		type: "مكية",
    		order: "7",
    		numVerses: "206",
    		prevSuret: "الأنعام",
    		nextSuret: "الأنفال",
    		numWords: "3344"
    	}
    },{
    	verse: "وَاخْفِضْ لَهُمَا جَنَاحَ الذُّلِّ مِنَ الرَّحْمَةِ",
    	detail: "سورة الإسراء - الآية 24",
    	explication: " واخفض لهما جناح الذل من الرحمة هذه استعارة في الشفقة والرحمة بهما ، والتذلل لهما تذلل الرعية للأمير والعبيد للسادة ; كما أشار إليه سعيد بن المسيب . وضرب خفض الجناح ونصبه مثلا لجناح الطائر حين ينتصب بجناحه لولده . والذل : هو اللين . وقراءة الجمهور بضم الذال ، من ذل يذل ذلا وذلة ومذلة فهو ذال وذليل",
    	interpreter: "القرطبي",
    	documentation: {
    		name: "الإسراء",
    		type: "مكية",
    		order: "17",
    		numVerses: "111",
    		prevSuret: "النحل",
    		nextSuret: "الكهف",
    		numWords: "1556"
    	}
    },{
    	verse: "وَقُلْ رَبِّ ارْحَمْهُمَا كَمَا رَبَّيَانِي صَغِيرًا",
    	detail: "سورة الإسراء - الآية 24",
    	explication: "أي: ادع لهما بالرحمة أحياء وأمواتا، جزاء على تربيتهما إياك صغيرا. وفهم من هذا أنه كلما ازدادت التربية ازداد الحق، وكذلك من تولى تربية الإنسان في دينه ودنياه تربية صالحة غير الأبوين فإن له على من رباه حق التربية.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الإسراء",
    		type: "مكية",
    		order: "17",
    		numVerses: "111",
    		prevSuret: "النحل",
    		nextSuret: "الكهف",
    		numWords: "1556"
    	}
    },{
    	verse: "سَبَّـــحَ لِلَّــهِ مَـا فِـي السَّمَوَاتِ وَالْأَرْضِ",
    	detail: "سورة الحديد - الآية 1",
    	explication: "يخبر تعالى عن عظمته وجلاله وسعة سلطانه، أن جميع ما في السماوات والأرض من الحيوانات الناطقة والصامتة وغيرها، [والجوامد] تسبح بحمد ربها، وتنزهه عما لا يليق بجلاله، وأنها قانتة لربها، منقادة لعزته، قد ظهرت فيها آثار حكمته",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الحديد",
    		type: "مدنية",
    		order: "57",
    		numVerses: "575",
    		prevSuret: "الواقعة",
    		nextSuret: "المجادلة",
    		numWords: "575"
    	}
    },{
    	verse: "وَهُــوَ مَعَكُـمْ أَيْنَ مَــا كُنْتُمْ",
    	detail: "سورة الحديد - الآية 4",
    	explication: "رقيب عليكم ، شهيد على أعمالكم حيث أنتم ، وأين كنتم ، من بر أو بحر ، في ليل أو نهار ، في البيوت أو القفار ، الجميع في علمه على السواء ، وتحت بصره وسمعه ، فيسمع كلامكم ويرى مكانكم ، ويعلم سركم ونجواكم",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "الحديد",
    		type: "مدنية",
    		order: "57",
    		numVerses: "575",
    		prevSuret: "الواقعة",
    		nextSuret: "المجادلة",
    		numWords: "575"
    	}
    },{
    	verse: "إِنَّ رَبِّـي قَرِيـبٌ مُّجِيبٌ",
    	detail: "سورة هود - الآية 61",
    	explication: "قريب ممن دعاه دعاء مسألة، أو دعاء عبادة، يجيبه بإعطائه سؤله، وقبول عبادته، وإثابته عليها، أجل الثواب، واعلم أن قربه تعالى نوعان: عام، وخاص، فالقرب العام: قربه بعلمه، من جميع الخلق",
    	interpreter: "السعدي",
    	documentation: {
    		name: "هود",
    		type: "مكية",
    		order: "11",
    		numVerses: "123",
    		prevSuret: "يونس",
    		nextSuret: "يوسف",
    		numWords: "1947"
    	}
    },{
    	verse: "وَنَحْنُ أَقْرَبُ إِلَيْهِ مِنْ حَبْلِ الْوَرِيدِ",
    	detail: "سورة ق - الآية 16",
    	explication: "{{ ونحن أقرب إليه }} أعلم به {{ من حبل الوريد }} لأن أبعاضه وأجزاءه يحجب بعضها بعضا ، ولا يحجب علم الله شيء ، و 'حبل الوريد' : عرق العنق ، وهو عرق بين الحلقوم والعلباوين ، يتفرق في البدن ، والحبل هو الوريد ، فأضيف إلى نفسه لاختلاف اللفظين ",
    	interpreter: "البغوي",
    	documentation: {
    		name: "ق",
    		type: "مكية",
    		order: "50",
    		numVerses: "45",
    		prevSuret: "الحجرات",
    		nextSuret: "الذاريات",
    		numWords: "373"
    	}
    },{
    	verse: "نَبِّئْ عِبَــادِي أَنِّـي أَنَا الْغَفُورُ الرَّحِيــمُ",
    	detail: "سورة الحجر - الآية 49",
    	explication: "يقول تعالى ذكره لنبيه محمد صلى الله عليه وسلم: أخبر عبادي يا محمد، أني أنا الذي أستر على ذنوبهم إذا تابوا منها وأنابوا، بترك فضيحتهم بها وعقوبتهم عليها، الرحيم بهم أن أعذّبهم بعد توبتهم منها عليها.",
    	interpreter: "الطبري",
    	documentation: {
    		name: "الحجر",
    		type: "مكية",
    		order: "15",
    		numVerses: "99",
    		prevSuret: "إبراهيم",
    		nextSuret: "النحل",
    		numWords: "658"
    	}
    },{
    	verse: "إِذْ يَقُولُ لِصَاحِبِهِ لَا تَحْزَنْ إِنَّ اللَّهَ مَعَنَا",
    	detail: "سورة التوبة - الآية 40",
    	explication: "{{ إذ يقول لصاحبه }} ، يقول: إذ يقول رسول الله لصاحبه أبي بكر، {{ لا تحزن }}، وذلك أنه خافَ من الطَّلَب أن يعلموا بمكانهما, فجزع من ذلك, فقال له رسول الله صلى الله عليه وسلم: [ لا تحزن ]، لأن الله معنا والله ناصرنا, فلن يعلم المشركون بنا ولن يصلوا إلينا.",
    	interpreter: "الطبري",
    	documentation: {
    		name: "التوبة",
    		type: "مدنية",
    		order: "9",
    		numVerses: "129",
    		prevSuret: "الأنفال",
    		nextSuret: "يونس",
    		numWords: "2506"
    	}
    },{
    	verse: "وَمَا مِن دَابَّةٍ فِي الْأَرْضِ إِلَّا عَلَى اللَّهِ رِزْقُهَا",
    	detail: "سورة هود - الآية 6",
    	explication: "أخبر تعالى أنه متكفل بأرزاق المخلوقات ، من سائر دواب الأرض ، صغيرها وكبيرها ، بحريها ، وبريها ، وأنه ( يعلم مستقرها ومستودعها ) أي : يعلم أين منتهى سيرها في الأرض ، وأين تأوي إليه من وكرها ، وهو مستودعها .",
    	interpreter: "ابن كثير",
    	documentation: {
    		name: "هود",
    		type: "مكية",
    		order: "11",
    		numVerses: "123",
    		prevSuret: "يونس",
    		nextSuret: "يوسف",
    		numWords: "1947"
    	}
    },{
    	verse: "قُل لَّن يُصِيبَنَا إِلَّا مَا كَتَــبَ اللَّهُ لَنَا",
    	detail: "سورة هود - الآية 51",
    	explication: "قل لن يصيبنا إلا ما كتب الله لنا قيل : في اللوح المحفوظ . وقيل : ما أخبرنا به في كتابه من أنا إما أن نظفر فيكون الظفر حسنى لنا ، وإما أن نقتل فتكون الشهادة أعظم حسنى لنا",
    	interpreter: "القرطبي",
    	documentation: {
    		name: "هود",
    		type: "مكية",
    		order: "11",
    		numVerses: "123",
    		prevSuret: "يونس",
    		nextSuret: "يوسف",
    		numWords: "1947"
    	}
    },{
    	verse: "قُلِ اللَّهُ يُنَجِّيكُم مِّنْهَا وَ مِــن كُلِّ كَرْبٍ",
    	detail: "سورة الأنعام - الآية 64",
    	explication: "{{ قُلِ اللَّهُ يُنَجِّيكُمْ مِنْهَا وَمِنْ كُلِّ كَرْبٍ }} أي: من هذه الشدة الخاصة، ومن جميع الكروب العامة. {{ ثُمَّ أَنْتُمْ تُشْرِكُونَ }} لا تفون لله بما قلتم، وتنسون نعمه عليكم، فأي برهان أوضح من هذا على بطلان الشرك، وصحة التوحيد",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الأنعام",
    		type: "مكية",
    		order: "6",
    		numVerses: "165",
    		prevSuret: "المائدة",
    		nextSuret: "الأعراف",
    		numWords: "3055"
    	}
    },{
    	verse: "وَعَاشِرُوهُنَّ بِالْمَعْرُوفِ",
    	detail: "سورة النساء - الآية 19",
    	explication: "وهذا يشمل المعاشرة القولية والفعلية، فعلى الزوج أن يعاشر زوجته بالمعروف، من الصحبة الجميلة، وكف الأذى وبذل الإحسان، وحسن المعاملة، ويدخل في ذلك النفقة والكسوة ونحوهما، فيجب على الزوج لزوجته المعروف من مثله لمثلها في ذلك الزمان والمكان، وهذا يتفاوت بتفاوت الأحوال.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "النساء",
    		type: "مدنية",
    		order: "4",
    		numVerses: "176",
    		prevSuret: "آل عمران",
    		nextSuret: "المائدة",
    		numWords: "3745"
    	}
    },{
    	verse: "وَبِالْوَالِدَيْـــــنِ إِحْـــــــسَانًا",
    	detail: "سورة الإسراء - الآية 23",
    	explication: "أحسنوا إليهما بجميع وجوه الإحسان القولي والفعلي لأنهما سبب وجود العبد ولهما من المحبة للولد والإحسان إليه والقرب ما يقتضي تأكد الحق ووجوب البر.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الإسراء",
    		type: "مكية",
    		order: "17",
    		numVerses: "111",
    		prevSuret: "النحل",
    		nextSuret: "الكهف",
    		numWords: "1556"
    	}
    },{
    	verse: "وَلَا تَنْهَرْهُـــــــــمَا وَ قُــل لَّهُمَا قَوْلًا كَرِيمًا",
    	detail: "سورة الإسراء - الآية 23",
    	explication: "{{ وَلَا تَنْهَرْهُمَا }} أي: تزجرهما وتتكلم لهما كلاما خشنا، {{ وَقُلْ لَهُمَا قَوْلًا كَرِيمًا }} بلفظ يحبانه وتأدب وتلطف بكلام لين حسن يلذ على قلوبهما وتطمئن به نفوسهما، وذلك يختلف باختلاف الأحوال والعوائد والأزمان.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الإسراء",
    		type: "مكية",
    		order: "17",
    		numVerses: "111",
    		prevSuret: "النحل",
    		nextSuret: "الكهف",
    		numWords: "1556"
    	}
    },{
    	verse: "وَبَرًّا بِوَالِدَيْـــهِ وَ لَمْ يَكُـــن جَبَّـــــارًا عَصِيًّا",
    	detail: "سورة مريم - الآية 14",
    	explication: "لم يكن عاقا، ولا مسيئا إلى أبويه، بل كان محسنا إليهما بالقول والفعل.{{ وَلَمْ يَكُنْ جَبَّارًا عَصِيًّا }} أي: لم يكن متجبرا متكبرا عن عبادة الله، ولا مترفعا على عباد الله، ولا على والديه، بل كان متواضعا، متذللا، مطيعا، أوابا لله على الدوام، فجمع بين القيام بحق الله، وحق خلقه، ولهذا حصلت له السلامة من الله، في جميع أحواله، مبادئها وعواقبها",
    	interpreter: "السعدي",
    	documentation: {
    		name: "مريم",
    		type: "مكية",
    		order: "19",
    		numVerses: "98",
    		prevSuret: "الكهف",
    		nextSuret: "طه",
    		numWords: "972"
    	}
    },{
    	verse: "فَصَبْرٌ جَمِيلٌ وَاللَّهُ الْمُسْتَعَانُ",
    	detail: "سورة يوسف - الآية 18",
    	explication: "{{ فَصَبْرٌ جَمِيلٌ وَاللَّهُ الْمُسْتَعَانُ عَلَى مَا تَصِفُونَ }} أي: أما أنا فوظيفتي سأحرص على القيام بها، وهي أني أصبر على هذه المحنة صبرا جميلا سالما من السخط والتَّشكِّي إلى الخلق، وأستعين الله على ذلك، لا على حولي وقوتي، فوعد من نفسه هذا الأمر وشكى إلى خالقه",
    	interpreter: "السعدي",
    	documentation: {
    		name: "يوسف",
    		type: "مكية",
    		order: "12",
    		numVerses: "111",
    		prevSuret: "هود",
    		nextSuret: "الرعد",
    		numWords: "1795"
    	}
    },{
    	verse: "فَمَا ظَنُّكُـــمْ بِرَبِّ الْعَالَمِينَ",
    	detail: "سورة الصافات - الآية 87",
    	explication: "وما الذي ظننتم برب العالمين، من النقص حتى جعلتم له أندادا وشركاء. فأراد عليه السلام، أن يكسر أصنامهم، ويتمكن من ذلك، فانتهز الفرصة في حين غفلة منهم، لما ذهبوا إلى عيد من أعيادهم، فخرج معهم.",
    	interpreter: "السعدي",
    	documentation: {
    		name: "الصافات",
    		type: "مكية",
    		order: "37",
    		numVerses: "182",
    		prevSuret: "يس",
    		nextSuret: "ص",
    		numWords: "865"
    	}
    }];

    /* src/App.svelte generated by Svelte v3.18.1 */
    const file$5 = "src/App.svelte";

    // (39:3) {#if changed}
    function create_if_block$1(ctx) {
    	let t;
    	let current;
    	const theverse = new TheVerse({ $$inline: true });
    	theverse.$on("shuffle", /*shuffle*/ ctx[1]);
    	const explication = new Explication({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(theverse.$$.fragment);
    			t = space();
    			create_component(explication.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(theverse, target, anchor);
    			insert_dev(target, t, anchor);
    			mount_component(explication, target, anchor);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(theverse.$$.fragment, local);
    			transition_in(explication.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(theverse.$$.fragment, local);
    			transition_out(explication.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(theverse, detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(explication, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(39:3) {#if changed}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let main;
    	let t0;
    	let section;
    	let div;
    	let t1;
    	let current;
    	const header = new Header({ $$inline: true });
    	let if_block = /*changed*/ ctx[0] && create_if_block$1(ctx);
    	const footer = new Footer({ $$inline: true });

    	const block = {
    		c: function create() {
    			main = element("main");
    			create_component(header.$$.fragment);
    			t0 = space();
    			section = element("section");
    			div = element("div");
    			if (if_block) if_block.c();
    			t1 = space();
    			create_component(footer.$$.fragment);
    			attr_dev(div, "class", "container svelte-18liw4m");
    			add_location(div, file$5, 37, 2, 800);
    			attr_dev(section, "class", "backdrop svelte-18liw4m");
    			add_location(section, file$5, 36, 1, 771);
    			attr_dev(main, "class", "svelte-18liw4m");
    			add_location(main, file$5, 33, 0, 749);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			mount_component(header, main, null);
    			append_dev(main, t0);
    			append_dev(main, section);
    			append_dev(section, div);
    			if (if_block) if_block.m(div, null);
    			append_dev(main, t1);
    			mount_component(footer, main, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*changed*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    					transition_in(if_block, 1);
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(if_block);
    			transition_in(footer.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(if_block);
    			transition_out(footer.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(header);
    			if (if_block) if_block.d();
    			destroy_component(footer);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let currentVerse = verses[Math.floor(Math.random() * verses.length)];

    	// let currentVerse = verses[53]
    	let changed = false;

    	function shuffle() {
    		currentVerse = verses[Math.floor(Math.random() * verses.length)];
    		$$invalidate(0, changed = false);

    		setTimeout(
    			function () {
    				$$invalidate(0, changed = true);
    			},
    			0
    		);
    	}

    	onMount(function () {
    		$$invalidate(0, changed = true);
    	});

    	afterUpdate(function () {
    		setContext("currentVerse", currentVerse);
    	});

    	$$self.$capture_state = () => {
    		return {};
    	};

    	$$self.$inject_state = $$props => {
    		if ("currentVerse" in $$props) currentVerse = $$props.currentVerse;
    		if ("changed" in $$props) $$invalidate(0, changed = $$props.changed);
    	};

    	return [changed, shuffle];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$5, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$5.name
    		});
    	}
    }

    const app = new App({
    	target: document.body
    });

    return app;

}());
