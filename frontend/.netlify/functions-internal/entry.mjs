import * as adapter from '@astrojs/netlify/netlify-functions.js';
import React, { createElement } from 'react';
import ReactDOM from 'react-dom/server';
import { escape } from 'html-escaper';
import { jsx, jsxs } from 'react/jsx-runtime';
import 'mime';
import 'cookie';
import 'kleur/colors';
import 'string-width';
import 'path-browserify';
import { compile } from 'path-to-regexp';

const opts = {
						experimentalReactChildren: false
					};

const contexts = new WeakMap();

const ID_PREFIX = 'r';

function getContext(rendererContextResult) {
	if (contexts.has(rendererContextResult)) {
		return contexts.get(rendererContextResult);
	}
	const ctx = {
		currentIndex: 0,
		get id() {
			return ID_PREFIX + this.currentIndex.toString();
		},
	};
	contexts.set(rendererContextResult, ctx);
	return ctx;
}

function incrementId(rendererContextResult) {
	const ctx = getContext(rendererContextResult);
	const id = ctx.id;
	ctx.currentIndex++;
	return id;
}

/**
 * Astro passes `children` as a string of HTML, so we need
 * a wrapper `div` to render that content as VNodes.
 *
 * As a bonus, we can signal to React that this subtree is
 * entirely static and will never change via `shouldComponentUpdate`.
 */
const StaticHtml = ({ value, name, hydrate = true }) => {
	if (!value) return null;
	const tagName = hydrate ? 'astro-slot' : 'astro-static-slot';
	return createElement(tagName, {
		name,
		suppressHydrationWarning: true,
		dangerouslySetInnerHTML: { __html: value },
	});
};

/**
 * This tells React to opt-out of re-rendering this subtree,
 * In addition to being a performance optimization,
 * this also allows other frameworks to attach to `children`.
 *
 * See https://preactjs.com/guide/v8/external-dom-mutations
 */
StaticHtml.shouldComponentUpdate = () => false;

const slotName$1 = (str) => str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
const reactTypeof = Symbol.for('react.element');

async function check$1(Component, props, children) {
	// Note: there are packages that do some unholy things to create "components".
	// Checking the $$typeof property catches most of these patterns.
	if (typeof Component === 'object') {
		return Component['$$typeof'].toString().slice('Symbol('.length).startsWith('react');
	}
	if (typeof Component !== 'function') return false;
	if (Component.name === 'QwikComponent') return false;

	// Preact forwarded-ref components can be functions, which React does not support
	if (typeof Component === 'function' && Component['$$typeof'] === Symbol.for('react.forward_ref'))
		return false;

	if (Component.prototype != null && typeof Component.prototype.render === 'function') {
		return React.Component.isPrototypeOf(Component) || React.PureComponent.isPrototypeOf(Component);
	}

	let isReactComponent = false;
	function Tester(...args) {
		try {
			const vnode = Component(...args);
			if (vnode && vnode['$$typeof'] === reactTypeof) {
				isReactComponent = true;
			}
		} catch {}

		return React.createElement('div');
	}

	await renderToStaticMarkup$1(Tester, props, children, {});

	return isReactComponent;
}

async function getNodeWritable() {
	let nodeStreamBuiltinModuleName = 'node:stream';
	let { Writable } = await import(/* @vite-ignore */ nodeStreamBuiltinModuleName);
	return Writable;
}

function needsHydration(metadata) {
	// Adjust how this is hydrated only when the version of Astro supports `astroStaticSlot`
	return metadata.astroStaticSlot ? !!metadata.hydrate : true;
}

async function renderToStaticMarkup$1(Component, props, { default: children, ...slotted }, metadata) {
	let prefix;
	if (this && this.result) {
		prefix = incrementId(this.result);
	}
	const attrs = { prefix };

	delete props['class'];
	const slots = {};
	for (const [key, value] of Object.entries(slotted)) {
		const name = slotName$1(key);
		slots[name] = React.createElement(StaticHtml, {
			hydrate: needsHydration(metadata),
			value,
			name,
		});
	}
	// Note: create newProps to avoid mutating `props` before they are serialized
	const newProps = {
		...props,
		...slots,
	};
	const newChildren = children ?? props.children;
	if (children && opts.experimentalReactChildren) {
		attrs['data-react-children'] = true;
		const convert = await import('./chunks/vnode-children.9f8ac639.mjs').then((mod) => mod.default);
		newProps.children = convert(children);
	} else if (newChildren != null) {
		newProps.children = React.createElement(StaticHtml, {
			hydrate: needsHydration(metadata),
			value: newChildren,
		});
	}
	const formState = this ? await getFormState(this) : undefined;
	if (formState) {
		attrs['data-action-result'] = JSON.stringify(formState[0]);
		attrs['data-action-key'] = formState[1];
		attrs['data-action-name'] = formState[2];
	}
	const vnode = React.createElement(Component, newProps);
	const renderOptions = {
		identifierPrefix: prefix,
		formState,
	};
	let html;
	if ('renderToReadableStream' in ReactDOM) {
		html = await renderToReadableStreamAsync(vnode, renderOptions);
	} else {
		html = await renderToPipeableStreamAsync(vnode, renderOptions);
	}
	return { html, attrs };
}

/**
 * @returns {Promise<[actionResult: any, actionKey: string, actionName: string] | undefined>}
 */
async function getFormState({ result }) {
	const { request, actionResult } = result;

	if (!actionResult) return undefined;
	if (!isFormRequest(request.headers.get('content-type'))) return undefined;

	const { searchParams } = new URL(request.url);
	const formData = await request.clone().formData();
	/**
	 * The key generated by React to identify each `useActionState()` call.
	 * @example "k511f74df5a35d32e7cf266450d85cb6c"
	 */
	const actionKey = formData.get('$ACTION_KEY')?.toString();
	/**
	 * The action name returned by an action's `toString()` property.
	 * This matches the endpoint path.
	 * @example "/_actions/blog.like"
	 */
	const actionName =
		searchParams.get('_astroAction') ??
		/* Legacy. TODO: remove for stable */ formData
			.get('_astroAction')
			?.toString();

	if (!actionKey || !actionName) return undefined;

	return [actionResult, actionKey, actionName];
}

async function renderToPipeableStreamAsync(vnode, options) {
	const Writable = await getNodeWritable();
	let html = '';
	return new Promise((resolve, reject) => {
		let error = undefined;
		let stream = ReactDOM.renderToPipeableStream(vnode, {
			...options,
			onError(err) {
				error = err;
				reject(error);
			},
			onAllReady() {
				stream.pipe(
					new Writable({
						write(chunk, _encoding, callback) {
							html += chunk.toString('utf-8');
							callback();
						},
						destroy() {
							resolve(html);
						},
					}),
				);
			},
		});
	});
}

/**
 * Use a while loop instead of "for await" due to cloudflare and Vercel Edge issues
 * See https://github.com/facebook/react/issues/24169
 */
async function readResult(stream) {
	const reader = stream.getReader();
	let result = '';
	const decoder = new TextDecoder('utf-8');
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			if (value) {
				result += decoder.decode(value);
			} else {
				// This closes the decoder
				decoder.decode(new Uint8Array());
			}

			return result;
		}
		result += decoder.decode(value, { stream: true });
	}
}

async function renderToReadableStreamAsync(vnode, options) {
	return await readResult(await ReactDOM.renderToReadableStream(vnode, options));
}

const formContentTypes = ['application/x-www-form-urlencoded', 'multipart/form-data'];

function isFormRequest(contentType) {
	// Split off parameters like charset or boundary
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type#content-type_in_html_forms
	const type = contentType?.split(';')[0].toLowerCase();

	return formContentTypes.some((t) => type === t);
}

const _renderer1 = {
	name: '@astrojs/react',
	check: check$1,
	renderToStaticMarkup: renderToStaticMarkup$1,
	supportsAstroStaticSlot: true,
};

function baseCreateComponent(cb, moduleId) {
  cb.isAstroComponentFactory = true;
  cb.moduleId = moduleId;
  return cb;
}
function createComponentWithOptions(opts) {
  const cb = baseCreateComponent(opts.factory, opts.moduleId);
  cb.propagation = opts.propagation;
  return cb;
}
function createComponent(arg1, moduleId) {
  if (typeof arg1 === "function") {
    return baseCreateComponent(arg1, moduleId);
  } else {
    return createComponentWithOptions(arg1);
  }
}

const ASTRO_VERSION = "1.9.2";

function createDeprecatedFetchContentFn() {
  return () => {
    throw new Error("Deprecated: Astro.fetchContent() has been replaced with Astro.glob().");
  };
}
function createAstroGlobFn() {
  const globHandler = (importMetaGlobResult, globValue) => {
    let allEntries = [...Object.values(importMetaGlobResult)];
    if (allEntries.length === 0) {
      throw new Error(`Astro.glob(${JSON.stringify(globValue())}) - no matches found.`);
    }
    return Promise.all(allEntries.map((fn) => fn()));
  };
  return globHandler;
}
function createAstro(filePathname, _site, projectRootStr) {
  const site = _site ? new URL(_site) : void 0;
  const referenceURL = new URL(filePathname, `http://localhost`);
  const projectRoot = new URL(projectRootStr);
  return {
    site,
    generator: `Astro v${ASTRO_VERSION}`,
    fetchContent: createDeprecatedFetchContentFn(),
    glob: createAstroGlobFn(),
    resolve(...segments) {
      let resolved = segments.reduce((u, segment) => new URL(segment, u), referenceURL).pathname;
      if (resolved.startsWith(projectRoot.pathname)) {
        resolved = "/" + resolved.slice(projectRoot.pathname.length);
      }
      return resolved;
    }
  };
}

const escapeHTML = escape;
class HTMLString extends String {
  get [Symbol.toStringTag]() {
    return "HTMLString";
  }
}
const markHTMLString = (value) => {
  if (value instanceof HTMLString) {
    return value;
  }
  if (typeof value === "string") {
    return new HTMLString(value);
  }
  return value;
};
function isHTMLString(value) {
  return Object.prototype.toString.call(value) === "[object HTMLString]";
}

var idle_prebuilt_default = `(self.Astro=self.Astro||{}).idle=t=>{const e=async()=>{await(await t())()};"requestIdleCallback"in window?window.requestIdleCallback(e):setTimeout(e,200)},window.dispatchEvent(new Event("astro:idle"));`;

var load_prebuilt_default = `(self.Astro=self.Astro||{}).load=a=>{(async()=>await(await a())())()},window.dispatchEvent(new Event("astro:load"));`;

var media_prebuilt_default = `(self.Astro=self.Astro||{}).media=(s,a)=>{const t=async()=>{await(await s())()};if(a.value){const e=matchMedia(a.value);e.matches?t():e.addEventListener("change",t,{once:!0})}},window.dispatchEvent(new Event("astro:media"));`;

var only_prebuilt_default = `(self.Astro=self.Astro||{}).only=t=>{(async()=>await(await t())())()},window.dispatchEvent(new Event("astro:only"));`;

var visible_prebuilt_default = `(self.Astro=self.Astro||{}).visible=(s,c,n)=>{const r=async()=>{await(await s())()};let i=new IntersectionObserver(e=>{for(const t of e)if(!!t.isIntersecting){i.disconnect(),r();break}});for(let e=0;e<n.children.length;e++){const t=n.children[e];i.observe(t)}},window.dispatchEvent(new Event("astro:visible"));`;

var astro_island_prebuilt_default = `var l;{const c={0:t=>t,1:t=>JSON.parse(t,o),2:t=>new RegExp(t),3:t=>new Date(t),4:t=>new Map(JSON.parse(t,o)),5:t=>new Set(JSON.parse(t,o)),6:t=>BigInt(t),7:t=>new URL(t),8:t=>new Uint8Array(JSON.parse(t)),9:t=>new Uint16Array(JSON.parse(t)),10:t=>new Uint32Array(JSON.parse(t))},o=(t,s)=>{if(t===""||!Array.isArray(s))return s;const[e,n]=s;return e in c?c[e](n):void 0};customElements.get("astro-island")||customElements.define("astro-island",(l=class extends HTMLElement{constructor(){super(...arguments);this.hydrate=()=>{if(!this.hydrator||this.parentElement&&this.parentElement.closest("astro-island[ssr]"))return;const s=this.querySelectorAll("astro-slot"),e={},n=this.querySelectorAll("template[data-astro-template]");for(const r of n){const i=r.closest(this.tagName);!i||!i.isSameNode(this)||(e[r.getAttribute("data-astro-template")||"default"]=r.innerHTML,r.remove())}for(const r of s){const i=r.closest(this.tagName);!i||!i.isSameNode(this)||(e[r.getAttribute("name")||"default"]=r.innerHTML)}const a=this.hasAttribute("props")?JSON.parse(this.getAttribute("props"),o):{};this.hydrator(this)(this.Component,a,e,{client:this.getAttribute("client")}),this.removeAttribute("ssr"),window.removeEventListener("astro:hydrate",this.hydrate),window.dispatchEvent(new CustomEvent("astro:hydrate"))}}connectedCallback(){!this.hasAttribute("await-children")||this.firstChild?this.childrenConnectedCallback():new MutationObserver((s,e)=>{e.disconnect(),this.childrenConnectedCallback()}).observe(this,{childList:!0})}async childrenConnectedCallback(){window.addEventListener("astro:hydrate",this.hydrate);let s=this.getAttribute("before-hydration-url");s&&await import(s),this.start()}start(){const s=JSON.parse(this.getAttribute("opts")),e=this.getAttribute("client");if(Astro[e]===void 0){window.addEventListener(\`astro:\${e}\`,()=>this.start(),{once:!0});return}Astro[e](async()=>{const n=this.getAttribute("renderer-url"),[a,{default:r}]=await Promise.all([import(this.getAttribute("component-url")),n?import(n):()=>()=>{}]),i=this.getAttribute("component-export")||"default";if(!i.includes("."))this.Component=a[i];else{this.Component=a;for(const d of i.split("."))this.Component=this.Component[d]}return this.hydrator=r,this.hydrate},s,this)}attributeChangedCallback(){this.hydrator&&this.hydrate()}},l.observedAttributes=["props"],l))}`;

function determineIfNeedsHydrationScript(result) {
  if (result._metadata.hasHydrationScript) {
    return false;
  }
  return result._metadata.hasHydrationScript = true;
}
const hydrationScripts = {
  idle: idle_prebuilt_default,
  load: load_prebuilt_default,
  only: only_prebuilt_default,
  media: media_prebuilt_default,
  visible: visible_prebuilt_default
};
function determinesIfNeedsDirectiveScript(result, directive) {
  if (result._metadata.hasDirectives.has(directive)) {
    return false;
  }
  result._metadata.hasDirectives.add(directive);
  return true;
}
function getDirectiveScriptText(directive) {
  if (!(directive in hydrationScripts)) {
    throw new Error(`Unknown directive: ${directive}`);
  }
  const directiveScriptText = hydrationScripts[directive];
  return directiveScriptText;
}
function getPrescripts(type, directive) {
  switch (type) {
    case "both":
      return `<style>astro-island,astro-slot{display:contents}</style><script>${getDirectiveScriptText(directive) + astro_island_prebuilt_default}<\/script>`;
    case "directive":
      return `<script>${getDirectiveScriptText(directive)}<\/script>`;
  }
  return "";
}

const headAndContentSym = Symbol.for("astro.headAndContent");
function isHeadAndContent(obj) {
  return typeof obj === "object" && !!obj[headAndContentSym];
}

function serializeListValue(value) {
  const hash = {};
  push(value);
  return Object.keys(hash).join(" ");
  function push(item) {
    if (item && typeof item.forEach === "function")
      item.forEach(push);
    else if (item === Object(item))
      Object.keys(item).forEach((name) => {
        if (item[name])
          push(name);
      });
    else {
      item = item === false || item == null ? "" : String(item).trim();
      if (item) {
        item.split(/\s+/).forEach((name) => {
          hash[name] = true;
        });
      }
    }
  }
}
function isPromise(value) {
  return !!value && typeof value === "object" && typeof value.then === "function";
}

var _a$2;
const renderTemplateResultSym = Symbol.for("astro.renderTemplateResult");
class RenderTemplateResult {
  constructor(htmlParts, expressions) {
    this[_a$2] = true;
    this.htmlParts = htmlParts;
    this.error = void 0;
    this.expressions = expressions.map((expression) => {
      if (isPromise(expression)) {
        return Promise.resolve(expression).catch((err) => {
          if (!this.error) {
            this.error = err;
            throw err;
          }
        });
      }
      return expression;
    });
  }
  get [(_a$2 = renderTemplateResultSym, Symbol.toStringTag)]() {
    return "AstroComponent";
  }
  async *[Symbol.asyncIterator]() {
    const { htmlParts, expressions } = this;
    for (let i = 0; i < htmlParts.length; i++) {
      const html = htmlParts[i];
      const expression = expressions[i];
      yield markHTMLString(html);
      yield* renderChild(expression);
    }
  }
}
function isRenderTemplateResult(obj) {
  return typeof obj === "object" && !!obj[renderTemplateResultSym];
}
async function* renderAstroTemplateResult(component) {
  for await (const value of component) {
    if (value || value === 0) {
      for await (const chunk of renderChild(value)) {
        switch (chunk.type) {
          case "directive": {
            yield chunk;
            break;
          }
          default: {
            yield markHTMLString(chunk);
            break;
          }
        }
      }
    }
  }
}
function renderTemplate(htmlParts, ...expressions) {
  return new RenderTemplateResult(htmlParts, expressions);
}

function isAstroComponentFactory(obj) {
  return obj == null ? false : obj.isAstroComponentFactory === true;
}
async function renderToString(result, componentFactory, props, children) {
  const factoryResult = await componentFactory(result, props, children);
  if (factoryResult instanceof Response) {
    const response = factoryResult;
    throw response;
  }
  let parts = new HTMLParts();
  const templateResult = isHeadAndContent(factoryResult) ? factoryResult.content : factoryResult;
  for await (const chunk of renderAstroTemplateResult(templateResult)) {
    parts.append(chunk, result);
  }
  return parts.toString();
}
function isAPropagatingComponent(result, factory) {
  let hint = factory.propagation || "none";
  if (factory.moduleId && result.propagation.has(factory.moduleId) && hint === "none") {
    hint = result.propagation.get(factory.moduleId);
  }
  return hint === "in-tree" || hint === "self";
}

const defineErrors = (errs) => errs;
const AstroErrorData = defineErrors({
  UnknownCompilerError: {
    title: "Unknown compiler error.",
    code: 1e3
  },
  StaticRedirectNotAvailable: {
    title: "`Astro.redirect` is not available in static mode.",
    code: 3001,
    message: "Redirects are only available when using `output: 'server'`. Update your Astro config if you need SSR features.",
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/#enabling-ssr-in-your-project for more information on how to enable SSR."
  },
  ClientAddressNotAvailable: {
    title: "`Astro.clientAddress` is not available in current adapter.",
    code: 3002,
    message: (adapterName) => `\`Astro.clientAddress\` is not available in the \`${adapterName}\` adapter. File an issue with the adapter to add support.`
  },
  StaticClientAddressNotAvailable: {
    title: "`Astro.clientAddress` is not available in static mode.",
    code: 3003,
    message: "`Astro.clientAddress` is only available when using `output: 'server'`. Update your Astro config if you need SSR features.",
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/#enabling-ssr-in-your-project for more information on how to enable SSR."
  },
  NoMatchingStaticPathFound: {
    title: "No static path found for requested path.",
    code: 3004,
    message: (pathName) => `A \`getStaticPaths()\` route pattern was matched, but no matching static path was found for requested path \`${pathName}\`.`,
    hint: (possibleRoutes) => `Possible dynamic routes being matched: ${possibleRoutes.join(", ")}.`
  },
  OnlyResponseCanBeReturned: {
    title: "Invalid type returned by Astro page.",
    code: 3005,
    message: (route, returnedValue) => `Route \`${route ? route : ""}\` returned a \`${returnedValue}\`. Only a [Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) can be returned from Astro files.`,
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/#response for more information."
  },
  MissingMediaQueryDirective: {
    title: "Missing value for `client:media` directive.",
    code: 3006,
    message: 'Media query not provided for `client:media` directive. A media query similar to `client:media="(max-width: 600px)"` must be provided'
  },
  NoMatchingRenderer: {
    title: "No matching renderer found.",
    code: 3007,
    message: (componentName, componentExtension, plural, validRenderersCount) => `Unable to render \`${componentName}\`.

${validRenderersCount > 0 ? `There ${plural ? "are." : "is."} ${validRenderersCount} renderer${plural ? "s." : ""} configured in your \`astro.config.mjs\` file,
but ${plural ? "none were." : "it was not."} able to server-side render \`${componentName}\`.` : `No valid renderer was found ${componentExtension ? `for the \`.${componentExtension}\` file extension.` : `for this file extension.`}`}`,
    hint: (probableRenderers) => `Did you mean to enable the ${probableRenderers} integration?

See https://docs.astro.build/en/core-concepts/framework-components/ for more information on how to install and configure integrations.`
  },
  NoClientEntrypoint: {
    title: "No client entrypoint specified in renderer.",
    code: 3008,
    message: (componentName, clientDirective, rendererName) => `\`${componentName}\` component has a \`client:${clientDirective}\` directive, but no client entrypoint was provided by \`${rendererName}\`.`,
    hint: "See https://docs.astro.build/en/reference/integrations-reference/#addrenderer-option for more information on how to configure your renderer."
  },
  NoClientOnlyHint: {
    title: "Missing hint on client:only directive.",
    code: 3009,
    message: (componentName) => `Unable to render \`${componentName}\`. When using the \`client:only\` hydration strategy, Astro needs a hint to use the correct renderer.`,
    hint: (probableRenderers) => `Did you mean to pass \`client:only="${probableRenderers}"\`? See https://docs.astro.build/en/reference/directives-reference/#clientonly for more information on client:only`
  },
  InvalidGetStaticPathParam: {
    title: "Invalid value returned by a `getStaticPaths` path.",
    code: 3010,
    message: (paramType) => `Invalid params given to \`getStaticPaths\` path. Expected an \`object\`, got \`${paramType}\``,
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  InvalidGetStaticPathsReturn: {
    title: "Invalid value returned by getStaticPaths.",
    code: 3011,
    message: (returnType) => `Invalid type returned by \`getStaticPaths\`. Expected an \`array\`, got \`${returnType}\``,
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  GetStaticPathsRemovedRSSHelper: {
    title: "getStaticPaths RSS helper is not available anymore.",
    code: 3012,
    message: "The RSS helper has been removed from `getStaticPaths`. Try the new @astrojs/rss package instead.",
    hint: "See https://docs.astro.build/en/guides/rss/ for more information."
  },
  GetStaticPathsExpectedParams: {
    title: "Missing params property on `getStaticPaths` route.",
    code: 3013,
    message: "Missing or empty required `params` property on `getStaticPaths` route.",
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  GetStaticPathsInvalidRouteParam: {
    title: "Invalid value for `getStaticPaths` route parameter.",
    code: 3014,
    message: (key, value, valueType) => `Invalid getStaticPaths route parameter for \`${key}\`. Expected undefined, a string or a number, received \`${valueType}\` (\`${value}\`)`,
    hint: "See https://docs.astro.build/en/reference/api-reference/#getstaticpaths for more information on getStaticPaths."
  },
  GetStaticPathsRequired: {
    title: "`getStaticPaths()` function required for dynamic routes.",
    code: 3015,
    message: "`getStaticPaths()` function is required for dynamic routes. Make sure that you `export` a `getStaticPaths` function from your dynamic route.",
    hint: `See https://docs.astro.build/en/core-concepts/routing/#dynamic-routes for more information on dynamic routes.

Alternatively, set \`output: "server"\` in your Astro config file to switch to a non-static server build.
See https://docs.astro.build/en/guides/server-side-rendering/ for more information on non-static rendering.`
  },
  ReservedSlotName: {
    title: "Invalid slot name.",
    code: 3016,
    message: (slotName) => `Unable to create a slot named \`${slotName}\`. \`${slotName}\` is a reserved slot name. Please update the name of this slot.`
  },
  NoAdapterInstalled: {
    title: "Cannot use Server-side Rendering without an adapter.",
    code: 3017,
    message: `Cannot use \`output: 'server'\` without an adapter. Please install and configure the appropriate server adapter for your final deployment.`,
    hint: "See https://docs.astro.build/en/guides/server-side-rendering/ for more information."
  },
  NoMatchingImport: {
    title: "No import found for component.",
    code: 3018,
    message: (componentName) => `Could not render \`${componentName}\`. No matching import has been found for \`${componentName}\`.`,
    hint: "Please make sure the component is properly imported."
  },
  InvalidPrerenderExport: {
    title: "Invalid prerender export.",
    code: 3019,
    message: (prefix, suffix) => {
      let msg = `A \`prerender\` export has been detected, but its value cannot be statically analyzed.`;
      if (prefix !== "const")
        msg += `
Expected \`const\` declaration but got \`${prefix}\`.`;
      if (suffix !== "true")
        msg += `
Expected \`true\` value but got \`${suffix}\`.`;
      return msg;
    },
    hint: "Mutable values declared at runtime are not supported. Please make sure to use exactly `export const prerender = true`."
  },
  UnknownViteError: {
    title: "Unknown Vite Error.",
    code: 4e3
  },
  FailedToLoadModuleSSR: {
    title: "Could not import file.",
    code: 4001,
    message: (importName) => `Could not import \`${importName}\`.`,
    hint: "This is often caused by a typo in the import path. Please make sure the file exists."
  },
  InvalidGlob: {
    title: "Invalid glob pattern.",
    code: 4002,
    message: (globPattern) => `Invalid glob pattern: \`${globPattern}\`. Glob patterns must start with './', '../' or '/'.`,
    hint: "See https://docs.astro.build/en/guides/imports/#glob-patterns for more information on supported glob patterns."
  },
  UnknownCSSError: {
    title: "Unknown CSS Error.",
    code: 5e3
  },
  CSSSyntaxError: {
    title: "CSS Syntax Error.",
    code: 5001
  },
  UnknownMarkdownError: {
    title: "Unknown Markdown Error.",
    code: 6e3
  },
  MarkdownFrontmatterParseError: {
    title: "Failed to parse Markdown frontmatter.",
    code: 6001
  },
  MarkdownContentSchemaValidationError: {
    title: "Content collection frontmatter invalid.",
    code: 6002,
    message: (collection, entryId, error) => {
      return [
        `${String(collection)} \u2192 ${String(entryId)} frontmatter does not match collection schema.`,
        ...error.errors.map((zodError) => zodError.message)
      ].join("\n");
    },
    hint: "See https://docs.astro.build/en/guides/content-collections/ for more information on content schemas."
  },
  UnknownConfigError: {
    title: "Unknown configuration error.",
    code: 7e3
  },
  ConfigNotFound: {
    title: "Specified configuration file not found.",
    code: 7001,
    message: (configFile) => `Unable to resolve \`--config "${configFile}"\`. Does the file exist?`
  },
  ConfigLegacyKey: {
    title: "Legacy configuration detected.",
    code: 7002,
    message: (legacyConfigKey) => `Legacy configuration detected: \`${legacyConfigKey}\`.`,
    hint: "Please update your configuration to the new format.\nSee https://astro.build/config for more information."
  },
  UnknownCLIError: {
    title: "Unknown CLI Error.",
    code: 8e3
  },
  GenerateContentTypesError: {
    title: "Failed to generate content types.",
    code: 8001,
    message: "`astro sync` command failed to generate content collection types.",
    hint: "Check your `src/content/config.*` file for typos."
  },
  UnknownError: {
    title: "Unknown Error.",
    code: 99999
  }
});

function normalizeLF(code) {
  return code.replace(/\r\n|\r(?!\n)|\n/g, "\n");
}
function getErrorDataByCode(code) {
  const entry = Object.entries(AstroErrorData).find((data) => data[1].code === code);
  if (entry) {
    return {
      name: entry[0],
      data: entry[1]
    };
  }
}

function codeFrame(src, loc) {
  if (!loc || loc.line === void 0 || loc.column === void 0) {
    return "";
  }
  const lines = normalizeLF(src).split("\n").map((ln) => ln.replace(/\t/g, "  "));
  const visibleLines = [];
  for (let n = -2; n <= 2; n++) {
    if (lines[loc.line + n])
      visibleLines.push(loc.line + n);
  }
  let gutterWidth = 0;
  for (const lineNo of visibleLines) {
    let w = `> ${lineNo}`;
    if (w.length > gutterWidth)
      gutterWidth = w.length;
  }
  let output = "";
  for (const lineNo of visibleLines) {
    const isFocusedLine = lineNo === loc.line - 1;
    output += isFocusedLine ? "> " : "  ";
    output += `${lineNo + 1} | ${lines[lineNo]}
`;
    if (isFocusedLine)
      output += `${Array.from({ length: gutterWidth }).join(" ")}  | ${Array.from({
        length: loc.column
      }).join(" ")}^
`;
  }
  return output;
}

class AstroError extends Error {
  constructor(props, ...params) {
    var _a;
    super(...params);
    this.type = "AstroError";
    const { code, name, title, message, stack, location, hint, frame } = props;
    this.errorCode = code;
    if (name && name !== "Error") {
      this.name = name;
    } else {
      this.name = ((_a = getErrorDataByCode(this.errorCode)) == null ? void 0 : _a.name) ?? "UnknownError";
    }
    this.title = title;
    if (message)
      this.message = message;
    this.stack = stack ? stack : this.stack;
    this.loc = location;
    this.hint = hint;
    this.frame = frame;
  }
  setErrorCode(errorCode) {
    this.errorCode = errorCode;
  }
  setLocation(location) {
    this.loc = location;
  }
  setName(name) {
    this.name = name;
  }
  setMessage(message) {
    this.message = message;
  }
  setHint(hint) {
    this.hint = hint;
  }
  setFrame(source, location) {
    this.frame = codeFrame(source, location);
  }
  static is(err) {
    return err.type === "AstroError";
  }
}

const PROP_TYPE = {
  Value: 0,
  JSON: 1,
  RegExp: 2,
  Date: 3,
  Map: 4,
  Set: 5,
  BigInt: 6,
  URL: 7,
  Uint8Array: 8,
  Uint16Array: 9,
  Uint32Array: 10
};
function serializeArray(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = value.map((v) => {
    return convertToSerializedForm(v, metadata, parents);
  });
  parents.delete(value);
  return serialized;
}
function serializeObject(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  if (parents.has(value)) {
    throw new Error(`Cyclic reference detected while serializing props for <${metadata.displayName} client:${metadata.hydrate}>!

Cyclic references cannot be safely serialized for client-side usage. Please remove the cyclic reference.`);
  }
  parents.add(value);
  const serialized = Object.fromEntries(
    Object.entries(value).map(([k, v]) => {
      return [k, convertToSerializedForm(v, metadata, parents)];
    })
  );
  parents.delete(value);
  return serialized;
}
function convertToSerializedForm(value, metadata = {}, parents = /* @__PURE__ */ new WeakSet()) {
  const tag = Object.prototype.toString.call(value);
  switch (tag) {
    case "[object Date]": {
      return [PROP_TYPE.Date, value.toISOString()];
    }
    case "[object RegExp]": {
      return [PROP_TYPE.RegExp, value.source];
    }
    case "[object Map]": {
      return [
        PROP_TYPE.Map,
        JSON.stringify(serializeArray(Array.from(value), metadata, parents))
      ];
    }
    case "[object Set]": {
      return [
        PROP_TYPE.Set,
        JSON.stringify(serializeArray(Array.from(value), metadata, parents))
      ];
    }
    case "[object BigInt]": {
      return [PROP_TYPE.BigInt, value.toString()];
    }
    case "[object URL]": {
      return [PROP_TYPE.URL, value.toString()];
    }
    case "[object Array]": {
      return [PROP_TYPE.JSON, JSON.stringify(serializeArray(value, metadata, parents))];
    }
    case "[object Uint8Array]": {
      return [PROP_TYPE.Uint8Array, JSON.stringify(Array.from(value))];
    }
    case "[object Uint16Array]": {
      return [PROP_TYPE.Uint16Array, JSON.stringify(Array.from(value))];
    }
    case "[object Uint32Array]": {
      return [PROP_TYPE.Uint32Array, JSON.stringify(Array.from(value))];
    }
    default: {
      if (value !== null && typeof value === "object") {
        return [PROP_TYPE.Value, serializeObject(value, metadata, parents)];
      } else {
        return [PROP_TYPE.Value, value];
      }
    }
  }
}
function serializeProps(props, metadata) {
  const serialized = JSON.stringify(serializeObject(props, metadata));
  return serialized;
}

const HydrationDirectivesRaw = ["load", "idle", "media", "visible", "only"];
const HydrationDirectives = new Set(HydrationDirectivesRaw);
const HydrationDirectiveProps = new Set(HydrationDirectivesRaw.map((n) => `client:${n}`));
function extractDirectives(displayName, inputProps) {
  let extracted = {
    isPage: false,
    hydration: null,
    props: {}
  };
  for (const [key, value] of Object.entries(inputProps)) {
    if (key.startsWith("server:")) {
      if (key === "server:root") {
        extracted.isPage = true;
      }
    }
    if (key.startsWith("client:")) {
      if (!extracted.hydration) {
        extracted.hydration = {
          directive: "",
          value: "",
          componentUrl: "",
          componentExport: { value: "" }
        };
      }
      switch (key) {
        case "client:component-path": {
          extracted.hydration.componentUrl = value;
          break;
        }
        case "client:component-export": {
          extracted.hydration.componentExport.value = value;
          break;
        }
        case "client:component-hydration": {
          break;
        }
        case "client:display-name": {
          break;
        }
        default: {
          extracted.hydration.directive = key.split(":")[1];
          extracted.hydration.value = value;
          if (!HydrationDirectives.has(extracted.hydration.directive)) {
            throw new Error(
              `Error: invalid hydration directive "${key}". Supported hydration methods: ${Array.from(
                HydrationDirectiveProps
              ).join(", ")}`
            );
          }
          if (extracted.hydration.directive === "media" && typeof extracted.hydration.value !== "string") {
            throw new AstroError(AstroErrorData.MissingMediaQueryDirective);
          }
          break;
        }
      }
    } else if (key === "class:list") {
      if (value) {
        extracted.props[key.slice(0, -5)] = serializeListValue(value);
      }
    } else {
      extracted.props[key] = value;
    }
  }
  for (const sym of Object.getOwnPropertySymbols(inputProps)) {
    extracted.props[sym] = inputProps[sym];
  }
  return extracted;
}
async function generateHydrateScript(scriptOptions, metadata) {
  const { renderer, result, astroId, props, attrs } = scriptOptions;
  const { hydrate, componentUrl, componentExport } = metadata;
  if (!componentExport.value) {
    throw new Error(
      `Unable to resolve a valid export for "${metadata.displayName}"! Please open an issue at https://astro.build/issues!`
    );
  }
  const island = {
    children: "",
    props: {
      uid: astroId
    }
  };
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      island.props[key] = escapeHTML(value);
    }
  }
  island.props["component-url"] = await result.resolve(decodeURI(componentUrl));
  if (renderer.clientEntrypoint) {
    island.props["component-export"] = componentExport.value;
    island.props["renderer-url"] = await result.resolve(decodeURI(renderer.clientEntrypoint));
    island.props["props"] = escapeHTML(serializeProps(props, metadata));
  }
  island.props["ssr"] = "";
  island.props["client"] = hydrate;
  let beforeHydrationUrl = await result.resolve("astro:scripts/before-hydration.js");
  if (beforeHydrationUrl.length) {
    island.props["before-hydration-url"] = beforeHydrationUrl;
  }
  island.props["opts"] = escapeHTML(
    JSON.stringify({
      name: metadata.displayName,
      value: metadata.hydrateArgs || ""
    })
  );
  return island;
}

var _a$1;
const astroComponentInstanceSym = Symbol.for("astro.componentInstance");
class AstroComponentInstance {
  constructor(result, props, slots, factory) {
    this[_a$1] = true;
    this.result = result;
    this.props = props;
    this.factory = factory;
    this.slotValues = {};
    for (const name in slots) {
      this.slotValues[name] = slots[name]();
    }
  }
  async init() {
    this.returnValue = this.factory(this.result, this.props, this.slotValues);
    return this.returnValue;
  }
  async *render() {
    if (this.returnValue === void 0) {
      await this.init();
    }
    let value = this.returnValue;
    if (isPromise(value)) {
      value = await value;
    }
    if (isHeadAndContent(value)) {
      yield* value.content;
    } else {
      yield* renderChild(value);
    }
  }
}
_a$1 = astroComponentInstanceSym;
function validateComponentProps(props, displayName) {
  if (props != null) {
    for (const prop of Object.keys(props)) {
      if (HydrationDirectiveProps.has(prop)) {
        console.warn(
          `You are attempting to render <${displayName} ${prop} />, but ${displayName} is an Astro component. Astro components do not render in the client and should not have a hydration directive. Please use a framework component for client rendering.`
        );
      }
    }
  }
}
function createAstroComponentInstance(result, displayName, factory, props, slots = {}) {
  validateComponentProps(props, displayName);
  const instance = new AstroComponentInstance(result, props, slots, factory);
  if (isAPropagatingComponent(result, factory) && !result.propagators.has(factory)) {
    result.propagators.set(factory, instance);
  }
  return instance;
}
function isAstroComponentInstance(obj) {
  return typeof obj === "object" && !!obj[astroComponentInstanceSym];
}

async function* renderChild(child) {
  child = await child;
  if (child instanceof SlotString) {
    if (child.instructions) {
      yield* child.instructions;
    }
    yield child;
  } else if (isHTMLString(child)) {
    yield child;
  } else if (Array.isArray(child)) {
    for (const value of child) {
      yield markHTMLString(await renderChild(value));
    }
  } else if (typeof child === "function") {
    yield* renderChild(child());
  } else if (typeof child === "string") {
    yield markHTMLString(escapeHTML(child));
  } else if (!child && child !== 0) ; else if (isRenderTemplateResult(child)) {
    yield* renderAstroTemplateResult(child);
  } else if (isAstroComponentInstance(child)) {
    yield* child.render();
  } else if (ArrayBuffer.isView(child)) {
    yield child;
  } else if (typeof child === "object" && (Symbol.asyncIterator in child || Symbol.iterator in child)) {
    yield* child;
  } else {
    yield child;
  }
}

const slotString = Symbol.for("astro:slot-string");
class SlotString extends HTMLString {
  constructor(content, instructions) {
    super(content);
    this.instructions = instructions;
    this[slotString] = true;
  }
}
function isSlotString(str) {
  return !!str[slotString];
}
async function renderSlot(_result, slotted, fallback) {
  if (slotted) {
    let iterator = renderChild(slotted);
    let content = "";
    let instructions = null;
    for await (const chunk of iterator) {
      if (chunk.type === "directive") {
        if (instructions === null) {
          instructions = [];
        }
        instructions.push(chunk);
      } else {
        content += chunk;
      }
    }
    return markHTMLString(new SlotString(content, instructions));
  }
  return fallback;
}
async function renderSlots(result, slots = {}) {
  let slotInstructions = null;
  let children = {};
  if (slots) {
    await Promise.all(
      Object.entries(slots).map(
        ([key, value]) => renderSlot(result, value).then((output) => {
          if (output.instructions) {
            if (slotInstructions === null) {
              slotInstructions = [];
            }
            slotInstructions.push(...output.instructions);
          }
          children[key] = output;
        })
      )
    );
  }
  return { slotInstructions, children };
}

const Fragment = Symbol.for("astro:fragment");
const Renderer = Symbol.for("astro:renderer");
const encoder = new TextEncoder();
const decoder = new TextDecoder();
function stringifyChunk(result, chunk) {
  switch (chunk.type) {
    case "directive": {
      const { hydration } = chunk;
      let needsHydrationScript = hydration && determineIfNeedsHydrationScript(result);
      let needsDirectiveScript = hydration && determinesIfNeedsDirectiveScript(result, hydration.directive);
      let prescriptType = needsHydrationScript ? "both" : needsDirectiveScript ? "directive" : null;
      if (prescriptType) {
        let prescripts = getPrescripts(prescriptType, hydration.directive);
        return markHTMLString(prescripts);
      } else {
        return "";
      }
    }
    default: {
      if (isSlotString(chunk)) {
        let out = "";
        const c = chunk;
        if (c.instructions) {
          for (const instr of c.instructions) {
            out += stringifyChunk(result, instr);
          }
        }
        out += chunk.toString();
        return out;
      }
      return chunk.toString();
    }
  }
}
class HTMLParts {
  constructor() {
    this.parts = "";
  }
  append(part, result) {
    if (ArrayBuffer.isView(part)) {
      this.parts += decoder.decode(part);
    } else {
      this.parts += stringifyChunk(result, part);
    }
  }
  toString() {
    return this.parts;
  }
  toArrayBuffer() {
    return encoder.encode(this.parts);
  }
}

const ClientOnlyPlaceholder = "astro-client-only";
class Skip {
  constructor(vnode) {
    this.vnode = vnode;
    this.count = 0;
  }
  increment() {
    this.count++;
  }
  haveNoTried() {
    return this.count === 0;
  }
  isCompleted() {
    return this.count > 2;
  }
}
Skip.symbol = Symbol("astro:jsx:skip");
let originalConsoleError;
let consoleFilterRefs = 0;
async function renderJSX(result, vnode) {
  switch (true) {
    case vnode instanceof HTMLString:
      if (vnode.toString().trim() === "") {
        return "";
      }
      return vnode;
    case typeof vnode === "string":
      return markHTMLString(escapeHTML(vnode));
    case typeof vnode === "function":
      return vnode;
    case (!vnode && vnode !== 0):
      return "";
    case Array.isArray(vnode):
      return markHTMLString(
        (await Promise.all(vnode.map((v) => renderJSX(result, v)))).join("")
      );
  }
  let skip;
  if (vnode.props) {
    if (vnode.props[Skip.symbol]) {
      skip = vnode.props[Skip.symbol];
    } else {
      skip = new Skip(vnode);
    }
  } else {
    skip = new Skip(vnode);
  }
  return renderJSXVNode(result, vnode, skip);
}
async function renderJSXVNode(result, vnode, skip) {
  if (isVNode(vnode)) {
    switch (true) {
      case !vnode.type: {
        throw new Error(`Unable to render ${result._metadata.pathname} because it contains an undefined Component!
Did you forget to import the component or is it possible there is a typo?`);
      }
      case vnode.type === Symbol.for("astro:fragment"):
        return renderJSX(result, vnode.props.children);
      case vnode.type.isAstroComponentFactory: {
        let props = {};
        let slots = {};
        for (const [key, value] of Object.entries(vnode.props ?? {})) {
          if (key === "children" || value && typeof value === "object" && value["$$slot"]) {
            slots[key === "children" ? "default" : key] = () => renderJSX(result, value);
          } else {
            props[key] = value;
          }
        }
        return markHTMLString(await renderToString(result, vnode.type, props, slots));
      }
      case (!vnode.type && vnode.type !== 0):
        return "";
      case (typeof vnode.type === "string" && vnode.type !== ClientOnlyPlaceholder):
        return markHTMLString(await renderElement$1(result, vnode.type, vnode.props ?? {}));
    }
    if (vnode.type) {
      let extractSlots2 = function(child) {
        if (Array.isArray(child)) {
          return child.map((c) => extractSlots2(c));
        }
        if (!isVNode(child)) {
          _slots.default.push(child);
          return;
        }
        if ("slot" in child.props) {
          _slots[child.props.slot] = [..._slots[child.props.slot] ?? [], child];
          delete child.props.slot;
          return;
        }
        _slots.default.push(child);
      };
      if (typeof vnode.type === "function" && vnode.type["astro:renderer"]) {
        skip.increment();
      }
      if (typeof vnode.type === "function" && vnode.props["server:root"]) {
        const output2 = await vnode.type(vnode.props ?? {});
        return await renderJSX(result, output2);
      }
      if (typeof vnode.type === "function") {
        if (skip.haveNoTried() || skip.isCompleted()) {
          useConsoleFilter();
          try {
            const output2 = await vnode.type(vnode.props ?? {});
            let renderResult;
            if (output2 && output2[AstroJSX]) {
              renderResult = await renderJSXVNode(result, output2, skip);
              return renderResult;
            } else if (!output2) {
              renderResult = await renderJSXVNode(result, output2, skip);
              return renderResult;
            }
          } catch (e) {
            if (skip.isCompleted()) {
              throw e;
            }
            skip.increment();
          } finally {
            finishUsingConsoleFilter();
          }
        } else {
          skip.increment();
        }
      }
      const { children = null, ...props } = vnode.props ?? {};
      const _slots = {
        default: []
      };
      extractSlots2(children);
      for (const [key, value] of Object.entries(props)) {
        if (value["$$slot"]) {
          _slots[key] = value;
          delete props[key];
        }
      }
      const slotPromises = [];
      const slots = {};
      for (const [key, value] of Object.entries(_slots)) {
        slotPromises.push(
          renderJSX(result, value).then((output2) => {
            if (output2.toString().trim().length === 0)
              return;
            slots[key] = () => output2;
          })
        );
      }
      await Promise.all(slotPromises);
      props[Skip.symbol] = skip;
      let output;
      if (vnode.type === ClientOnlyPlaceholder && vnode.props["client:only"]) {
        output = await renderComponentToIterable(
          result,
          vnode.props["client:display-name"] ?? "",
          null,
          props,
          slots
        );
      } else {
        output = await renderComponentToIterable(
          result,
          typeof vnode.type === "function" ? vnode.type.name : vnode.type,
          vnode.type,
          props,
          slots
        );
      }
      if (typeof output !== "string" && Symbol.asyncIterator in output) {
        let parts = new HTMLParts();
        for await (const chunk of output) {
          parts.append(chunk, result);
        }
        return markHTMLString(parts.toString());
      } else {
        return markHTMLString(output);
      }
    }
  }
  return markHTMLString(`${vnode}`);
}
async function renderElement$1(result, tag, { children, ...props }) {
  return markHTMLString(
    `<${tag}${spreadAttributes(props)}${markHTMLString(
      (children == null || children == "") && voidElementNames.test(tag) ? `/>` : `>${children == null ? "" : await renderJSX(result, children)}</${tag}>`
    )}`
  );
}
function useConsoleFilter() {
  consoleFilterRefs++;
  if (!originalConsoleError) {
    originalConsoleError = console.error;
    try {
      console.error = filteredConsoleError;
    } catch (error) {
    }
  }
}
function finishUsingConsoleFilter() {
  consoleFilterRefs--;
}
function filteredConsoleError(msg, ...rest) {
  if (consoleFilterRefs > 0 && typeof msg === "string") {
    const isKnownReactHookError = msg.includes("Warning: Invalid hook call.") && msg.includes("https://reactjs.org/link/invalid-hook-call");
    if (isKnownReactHookError)
      return;
  }
  originalConsoleError(msg, ...rest);
}

/**
 * shortdash - https://github.com/bibig/node-shorthash
 *
 * @license
 *
 * (The MIT License)
 *
 * Copyright (c) 2013 Bibig <bibig@me.com>
 *
 * Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation
 * files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use,
 * copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following
 * conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 * OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 * OTHER DEALINGS IN THE SOFTWARE.
 */
const dictionary = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXY";
const binary = dictionary.length;
function bitwise(str) {
  let hash = 0;
  if (str.length === 0)
    return hash;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = (hash << 5) - hash + ch;
    hash = hash & hash;
  }
  return hash;
}
function shorthash(text) {
  let num;
  let result = "";
  let integer = bitwise(text);
  const sign = integer < 0 ? "Z" : "";
  integer = Math.abs(integer);
  while (integer >= binary) {
    num = integer % binary;
    integer = Math.floor(integer / binary);
    result = dictionary[num] + result;
  }
  if (integer > 0) {
    result = dictionary[integer] + result;
  }
  return sign + result;
}

const voidElementNames = /^(area|base|br|col|command|embed|hr|img|input|keygen|link|meta|param|source|track|wbr)$/i;
const htmlBooleanAttributes = /^(allowfullscreen|async|autofocus|autoplay|controls|default|defer|disabled|disablepictureinpicture|disableremoteplayback|formnovalidate|hidden|loop|nomodule|novalidate|open|playsinline|readonly|required|reversed|scoped|seamless|itemscope)$/i;
const htmlEnumAttributes = /^(contenteditable|draggable|spellcheck|value)$/i;
const svgEnumAttributes = /^(autoReverse|externalResourcesRequired|focusable|preserveAlpha)$/i;
const STATIC_DIRECTIVES = /* @__PURE__ */ new Set(["set:html", "set:text"]);
const toIdent = (k) => k.trim().replace(/(?:(?!^)\b\w|\s+|[^\w]+)/g, (match, index) => {
  if (/[^\w]|\s/.test(match))
    return "";
  return index === 0 ? match : match.toUpperCase();
});
const toAttributeString = (value, shouldEscape = true) => shouldEscape ? String(value).replace(/&/g, "&#38;").replace(/"/g, "&#34;") : value;
const kebab = (k) => k.toLowerCase() === k ? k : k.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
const toStyleString = (obj) => Object.entries(obj).map(([k, v]) => `${kebab(k)}:${v}`).join(";");
function defineScriptVars(vars) {
  let output = "";
  for (const [key, value] of Object.entries(vars)) {
    output += `const ${toIdent(key)} = ${JSON.stringify(value)};
`;
  }
  return markHTMLString(output);
}
function formatList(values) {
  if (values.length === 1) {
    return values[0];
  }
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}
function addAttribute(value, key, shouldEscape = true) {
  if (value == null) {
    return "";
  }
  if (value === false) {
    if (htmlEnumAttributes.test(key) || svgEnumAttributes.test(key)) {
      return markHTMLString(` ${key}="false"`);
    }
    return "";
  }
  if (STATIC_DIRECTIVES.has(key)) {
    console.warn(`[astro] The "${key}" directive cannot be applied dynamically at runtime. It will not be rendered as an attribute.

Make sure to use the static attribute syntax (\`${key}={value}\`) instead of the dynamic spread syntax (\`{...{ "${key}": value }}\`).`);
    return "";
  }
  if (key === "class:list") {
    const listValue = toAttributeString(serializeListValue(value), shouldEscape);
    if (listValue === "") {
      return "";
    }
    return markHTMLString(` ${key.slice(0, -5)}="${listValue}"`);
  }
  if (key === "style" && !(value instanceof HTMLString) && typeof value === "object") {
    return markHTMLString(` ${key}="${toAttributeString(toStyleString(value), shouldEscape)}"`);
  }
  if (key === "className") {
    return markHTMLString(` class="${toAttributeString(value, shouldEscape)}"`);
  }
  if (value === true && (key.startsWith("data-") || htmlBooleanAttributes.test(key))) {
    return markHTMLString(` ${key}`);
  } else {
    return markHTMLString(` ${key}="${toAttributeString(value, shouldEscape)}"`);
  }
}
function internalSpreadAttributes(values, shouldEscape = true) {
  let output = "";
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, shouldEscape);
  }
  return markHTMLString(output);
}
function renderElement(name, { props: _props, children = "" }, shouldEscape = true) {
  const { lang: _, "data-astro-id": astroId, "define:vars": defineVars, ...props } = _props;
  if (defineVars) {
    if (name === "style") {
      delete props["is:global"];
      delete props["is:scoped"];
    }
    if (name === "script") {
      delete props.hoist;
      children = defineScriptVars(defineVars) + "\n" + children;
    }
  }
  if ((children == null || children == "") && voidElementNames.test(name)) {
    return `<${name}${internalSpreadAttributes(props, shouldEscape)} />`;
  }
  return `<${name}${internalSpreadAttributes(props, shouldEscape)}>${children}</${name}>`;
}

function componentIsHTMLElement(Component) {
  return typeof HTMLElement !== "undefined" && HTMLElement.isPrototypeOf(Component);
}
async function renderHTMLElement(result, constructor, props, slots) {
  const name = getHTMLElementName(constructor);
  let attrHTML = "";
  for (const attr in props) {
    attrHTML += ` ${attr}="${toAttributeString(await props[attr])}"`;
  }
  return markHTMLString(
    `<${name}${attrHTML}>${await renderSlot(result, slots == null ? void 0 : slots.default)}</${name}>`
  );
}
function getHTMLElementName(constructor) {
  const definedName = customElements.getName(constructor);
  if (definedName)
    return definedName;
  const assignedName = constructor.name.replace(/^HTML|Element$/g, "").replace(/[A-Z]/g, "-$&").toLowerCase().replace(/^-/, "html-");
  return assignedName;
}

const rendererAliases = /* @__PURE__ */ new Map([["solid", "solid-js"]]);
function guessRenderers(componentUrl) {
  const extname = componentUrl == null ? void 0 : componentUrl.split(".").pop();
  switch (extname) {
    case "svelte":
      return ["@astrojs/svelte"];
    case "vue":
      return ["@astrojs/vue"];
    case "jsx":
    case "tsx":
      return ["@astrojs/react", "@astrojs/preact", "@astrojs/solid", "@astrojs/vue (jsx)"];
    default:
      return [
        "@astrojs/react",
        "@astrojs/preact",
        "@astrojs/solid",
        "@astrojs/vue",
        "@astrojs/svelte"
      ];
  }
}
function isFragmentComponent(Component) {
  return Component === Fragment;
}
function isHTMLComponent(Component) {
  return Component && typeof Component === "object" && Component["astro:html"];
}
async function renderFrameworkComponent(result, displayName, Component, _props, slots = {}) {
  var _a, _b;
  if (!Component && !_props["client:only"]) {
    throw new Error(
      `Unable to render ${displayName} because it is ${Component}!
Did you forget to import the component or is it possible there is a typo?`
    );
  }
  const { renderers } = result._metadata;
  const metadata = { displayName };
  const { hydration, isPage, props } = extractDirectives(displayName, _props);
  let html = "";
  let attrs = void 0;
  if (hydration) {
    metadata.hydrate = hydration.directive;
    metadata.hydrateArgs = hydration.value;
    metadata.componentExport = hydration.componentExport;
    metadata.componentUrl = hydration.componentUrl;
  }
  const probableRendererNames = guessRenderers(metadata.componentUrl);
  const validRenderers = renderers.filter((r) => r.name !== "astro:jsx");
  const { children, slotInstructions } = await renderSlots(result, slots);
  let renderer;
  if (metadata.hydrate !== "only") {
    let isTagged = false;
    try {
      isTagged = Component && Component[Renderer];
    } catch {
    }
    if (isTagged) {
      const rendererName = Component[Renderer];
      renderer = renderers.find(({ name }) => name === rendererName);
    }
    if (!renderer) {
      let error;
      for (const r of renderers) {
        try {
          if (await r.ssr.check.call({ result }, Component, props, children)) {
            renderer = r;
            break;
          }
        } catch (e) {
          error ?? (error = e);
        }
      }
      if (!renderer && error) {
        throw error;
      }
    }
    if (!renderer && typeof HTMLElement === "function" && componentIsHTMLElement(Component)) {
      const output = renderHTMLElement(result, Component, _props, slots);
      return output;
    }
  } else {
    if (metadata.hydrateArgs) {
      const passedName = metadata.hydrateArgs;
      const rendererName = rendererAliases.has(passedName) ? rendererAliases.get(passedName) : passedName;
      renderer = renderers.find(
        ({ name }) => name === `@astrojs/${rendererName}` || name === rendererName
      );
    }
    if (!renderer && validRenderers.length === 1) {
      renderer = validRenderers[0];
    }
    if (!renderer) {
      const extname = (_a = metadata.componentUrl) == null ? void 0 : _a.split(".").pop();
      renderer = renderers.filter(
        ({ name }) => name === `@astrojs/${extname}` || name === extname
      )[0];
    }
  }
  if (!renderer) {
    if (metadata.hydrate === "only") {
      throw new AstroError({
        ...AstroErrorData.NoClientOnlyHint,
        message: AstroErrorData.NoClientOnlyHint.message(metadata.displayName),
        hint: AstroErrorData.NoClientOnlyHint.hint(
          probableRendererNames.map((r) => r.replace("@astrojs/", "")).join("|")
        )
      });
    } else if (typeof Component !== "string") {
      const matchingRenderers = validRenderers.filter(
        (r) => probableRendererNames.includes(r.name)
      );
      const plural = validRenderers.length > 1;
      if (matchingRenderers.length === 0) {
        throw new AstroError({
          ...AstroErrorData.NoMatchingRenderer,
          message: AstroErrorData.NoMatchingRenderer.message(
            metadata.displayName,
            (_b = metadata == null ? void 0 : metadata.componentUrl) == null ? void 0 : _b.split(".").pop(),
            plural,
            validRenderers.length
          ),
          hint: AstroErrorData.NoMatchingRenderer.hint(
            formatList(probableRendererNames.map((r) => "`" + r + "`"))
          )
        });
      } else if (matchingRenderers.length === 1) {
        renderer = matchingRenderers[0];
        ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call(
          { result },
          Component,
          props,
          children,
          metadata
        ));
      } else {
        throw new Error(`Unable to render ${metadata.displayName}!

This component likely uses ${formatList(probableRendererNames)},
but Astro encountered an error during server-side rendering.

Please ensure that ${metadata.displayName}:
1. Does not unconditionally access browser-specific globals like \`window\` or \`document\`.
   If this is unavoidable, use the \`client:only\` hydration directive.
2. Does not conditionally return \`null\` or \`undefined\` when rendered on the server.

If you're still stuck, please open an issue on GitHub or join us at https://astro.build/chat.`);
      }
    }
  } else {
    if (metadata.hydrate === "only") {
      html = await renderSlot(result, slots == null ? void 0 : slots.fallback);
    } else {
      ({ html, attrs } = await renderer.ssr.renderToStaticMarkup.call(
        { result },
        Component,
        props,
        children,
        metadata
      ));
    }
  }
  if (renderer && !renderer.clientEntrypoint && renderer.name !== "@astrojs/lit" && metadata.hydrate) {
    throw new AstroError({
      ...AstroErrorData.NoClientEntrypoint,
      message: AstroErrorData.NoClientEntrypoint.message(
        displayName,
        metadata.hydrate,
        renderer.name
      )
    });
  }
  if (!html && typeof Component === "string") {
    const Tag = sanitizeElementName(Component);
    const childSlots = Object.values(children).join("");
    const iterable = renderAstroTemplateResult(
      await renderTemplate`<${Tag}${internalSpreadAttributes(props)}${markHTMLString(
        childSlots === "" && voidElementNames.test(Tag) ? `/>` : `>${childSlots}</${Tag}>`
      )}`
    );
    html = "";
    for await (const chunk of iterable) {
      html += chunk;
    }
  }
  if (!hydration) {
    return async function* () {
      if (slotInstructions) {
        yield* slotInstructions;
      }
      if (isPage || (renderer == null ? void 0 : renderer.name) === "astro:jsx") {
        yield html;
      } else {
        yield markHTMLString(html.replace(/\<\/?astro-slot\>/g, ""));
      }
    }();
  }
  const astroId = shorthash(
    `<!--${metadata.componentExport.value}:${metadata.componentUrl}-->
${html}
${serializeProps(
      props,
      metadata
    )}`
  );
  const island = await generateHydrateScript(
    { renderer, result, astroId, props, attrs },
    metadata
  );
  let unrenderedSlots = [];
  if (html) {
    if (Object.keys(children).length > 0) {
      for (const key of Object.keys(children)) {
        if (!html.includes(key === "default" ? `<astro-slot>` : `<astro-slot name="${key}">`)) {
          unrenderedSlots.push(key);
        }
      }
    }
  } else {
    unrenderedSlots = Object.keys(children);
  }
  const template = unrenderedSlots.length > 0 ? unrenderedSlots.map(
    (key) => `<template data-astro-template${key !== "default" ? `="${key}"` : ""}>${children[key]}</template>`
  ).join("") : "";
  island.children = `${html ?? ""}${template}`;
  if (island.children) {
    island.props["await-children"] = "";
  }
  async function* renderAll() {
    if (slotInstructions) {
      yield* slotInstructions;
    }
    yield { type: "directive", hydration, result };
    yield markHTMLString(renderElement("astro-island", island, false));
  }
  return renderAll();
}
function sanitizeElementName(tag) {
  const unsafe = /[&<>'"\s]+/g;
  if (!unsafe.test(tag))
    return tag;
  return tag.trim().split(unsafe)[0].trim();
}
async function renderFragmentComponent(result, slots = {}) {
  const children = await renderSlot(result, slots == null ? void 0 : slots.default);
  if (children == null) {
    return children;
  }
  return markHTMLString(children);
}
async function renderHTMLComponent(result, Component, _props, slots = {}) {
  const { slotInstructions, children } = await renderSlots(result, slots);
  const html = Component.render({ slots: children });
  const hydrationHtml = slotInstructions ? slotInstructions.map((instr) => stringifyChunk(result, instr)).join("") : "";
  return markHTMLString(hydrationHtml + html);
}
function renderComponent(result, displayName, Component, props, slots = {}) {
  if (isPromise(Component)) {
    return Promise.resolve(Component).then((Unwrapped) => {
      return renderComponent(result, displayName, Unwrapped, props, slots);
    });
  }
  if (isFragmentComponent(Component)) {
    return renderFragmentComponent(result, slots);
  }
  if (isHTMLComponent(Component)) {
    return renderHTMLComponent(result, Component, props, slots);
  }
  if (isAstroComponentFactory(Component)) {
    return createAstroComponentInstance(result, displayName, Component, props, slots);
  }
  return renderFrameworkComponent(result, displayName, Component, props, slots);
}
function renderComponentToIterable(result, displayName, Component, props, slots = {}) {
  const renderResult = renderComponent(result, displayName, Component, props, slots);
  if (isAstroComponentInstance(renderResult)) {
    return renderResult.render();
  }
  return renderResult;
}

const uniqueElements = (item, index, all) => {
  const props = JSON.stringify(item.props);
  const children = item.children;
  return index === all.findIndex((i) => JSON.stringify(i.props) === props && i.children == children);
};
async function* renderExtraHead(result, base) {
  yield base;
  for (const part of result.extraHead) {
    yield* renderChild(part);
  }
}
function renderAllHeadContent(result) {
  const styles = Array.from(result.styles).filter(uniqueElements).map((style) => renderElement("style", style));
  result.styles.clear();
  const scripts = Array.from(result.scripts).filter(uniqueElements).map((script, i) => {
    return renderElement("script", script, false);
  });
  const links = Array.from(result.links).filter(uniqueElements).map((link) => renderElement("link", link, false));
  const baseHeadContent = markHTMLString(links.join("\n") + styles.join("\n") + scripts.join("\n"));
  if (result.extraHead.length > 0) {
    return renderExtraHead(result, baseHeadContent);
  } else {
    return baseHeadContent;
  }
}
function createRenderHead(result) {
  result._metadata.hasRenderedHead = true;
  return renderAllHeadContent.bind(null, result);
}
const renderHead = createRenderHead;
async function* maybeRenderHead(result) {
  if (result._metadata.hasRenderedHead) {
    return;
  }
  yield createRenderHead(result)();
}

typeof process === "object" && Object.prototype.toString.call(process) === "[object process]";

function spreadAttributes(values, _name, { class: scopedClassName } = {}) {
  let output = "";
  if (scopedClassName) {
    if (typeof values.class !== "undefined") {
      values.class += ` ${scopedClassName}`;
    } else if (typeof values["class:list"] !== "undefined") {
      values["class:list"] = [values["class:list"], scopedClassName];
    } else {
      values.class = scopedClassName;
    }
  }
  for (const [key, value] of Object.entries(values)) {
    output += addAttribute(value, key, true);
  }
  return markHTMLString(output);
}

const AstroJSX = "astro:jsx";
const Empty = Symbol("empty");
const toSlotName = (slotAttr) => slotAttr;
function isVNode(vnode) {
  return vnode && typeof vnode === "object" && vnode[AstroJSX];
}
function transformSlots(vnode) {
  if (typeof vnode.type === "string")
    return vnode;
  const slots = {};
  if (isVNode(vnode.props.children)) {
    const child = vnode.props.children;
    if (!isVNode(child))
      return;
    if (!("slot" in child.props))
      return;
    const name = toSlotName(child.props.slot);
    slots[name] = [child];
    slots[name]["$$slot"] = true;
    delete child.props.slot;
    delete vnode.props.children;
  }
  if (Array.isArray(vnode.props.children)) {
    vnode.props.children = vnode.props.children.map((child) => {
      if (!isVNode(child))
        return child;
      if (!("slot" in child.props))
        return child;
      const name = toSlotName(child.props.slot);
      if (Array.isArray(slots[name])) {
        slots[name].push(child);
      } else {
        slots[name] = [child];
        slots[name]["$$slot"] = true;
      }
      delete child.props.slot;
      return Empty;
    }).filter((v) => v !== Empty);
  }
  Object.assign(vnode.props, slots);
}
function markRawChildren(child) {
  if (typeof child === "string")
    return markHTMLString(child);
  if (Array.isArray(child))
    return child.map((c) => markRawChildren(c));
  return child;
}
function transformSetDirectives(vnode) {
  if (!("set:html" in vnode.props || "set:text" in vnode.props))
    return;
  if ("set:html" in vnode.props) {
    const children = markRawChildren(vnode.props["set:html"]);
    delete vnode.props["set:html"];
    Object.assign(vnode.props, { children });
    return;
  }
  if ("set:text" in vnode.props) {
    const children = vnode.props["set:text"];
    delete vnode.props["set:text"];
    Object.assign(vnode.props, { children });
    return;
  }
}
function createVNode(type, props) {
  const vnode = {
    [Renderer]: "astro:jsx",
    [AstroJSX]: true,
    type,
    props: props ?? {}
  };
  transformSetDirectives(vnode);
  transformSlots(vnode);
  return vnode;
}

const slotName = (str) => str.trim().replace(/[-_]([a-z])/g, (_, w) => w.toUpperCase());
async function check(Component, props, { default: children = null, ...slotted } = {}) {
  if (typeof Component !== "function")
    return false;
  const slots = {};
  for (const [key, value] of Object.entries(slotted)) {
    const name = slotName(key);
    slots[name] = value;
  }
  try {
    const result = await Component({ ...props, ...slots, children });
    return result[AstroJSX];
  } catch (e) {
  }
  return false;
}
async function renderToStaticMarkup(Component, props = {}, { default: children = null, ...slotted } = {}) {
  const slots = {};
  for (const [key, value] of Object.entries(slotted)) {
    const name = slotName(key);
    slots[name] = value;
  }
  const { result } = this;
  const html = await renderJSX(result, createVNode(Component, { ...props, ...slots, children }));
  return { html };
}
var server_default = {
  check,
  renderToStaticMarkup
};

const $$Astro$g = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/MenuItem.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$MenuItem = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$g, $$props, $$slots);
  Astro2.self = $$MenuItem;
  const { name, link, active = false } = Astro2.props;
  return renderTemplate`<!--begin::Menu item-->${maybeRenderHead($$result)}<div${addAttribute(`menu-item mx-2 ${active && "here menu-here-bg"}`, "class")}>
  <a${addAttribute(link, "href")} class="menu-link">
    <span class="menu-title">${name}</span>
  </a>
</div>
<!--end::Menu item-->`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/MenuItem.astro");

const $$Astro$f = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Menu.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Menu = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$f, $$props, $$slots);
  Astro2.self = $$Menu;
  const menuLinks = [
    { name: "Home", link: "/" },
    { name: "Products", link: "/products" }
  ];
  return renderTemplate`${maybeRenderHead($$result)}<div class="app-header-menu align-items-stretch">
  <!--begin::Menu Items-->
  <div id="kt_app_header_menu" class="menu menu-rounded my-5 align-items-stretch fw-semibold px-2 px-lg-0">
    ${menuLinks.map((link) => renderTemplate`${renderComponent($$result, "MenuItem", $$MenuItem, { "name": link.name, "link": link.link })}`)}
  </div>
  <!--end::Menu Items-->
</div>`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Menu.astro");

const $$Astro$e = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Nav/NavItem.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$NavItem = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$e, $$props, $$slots);
  Astro2.self = $$NavItem;
  const { icon, name, email = "" } = Astro2.props;
  return renderTemplate`${maybeRenderHead($$result)}<div class="app-navbar-item ms-1 ms-lg-3"${addAttribute(`${!email && "cart"}`, "id")}>
    <!--begin::Button-->
    <div class="btn btn-icon btn-custom btn-active-light btn-active-color-primary w-35px h-35px w-md-40px h-md-40px" data-kt-menu-trigger="{default: 'click', lg: 'hover'}" data-kt-menu-attach="parent" data-kt-menu-placement="bottom-end">
        <i${addAttribute(`bi bi-${icon} fs-2 text-gray-700`, "class")}></i>

    </div>
    <!--end::Button-->
    <!--begin::Dropdown-->
    <div class="menu menu-sub menu-sub-dropdown menu-column w-100 w-sm-350px p-4" data-kt-menu="true">
        <!--begin::Title-->
        <div class="d-flex flex-column">
            <div class="fw-bold d-flex align-items-center fs-5">${name}</div>
            <div class="fw-semibold text-muted fs-7">${email}</div>
        </div>
        <!--end::Title-->
        <!--end::Separator-->
        <div class="separator my-2"></div>
        <!--end::Separator-->
        <!--end::Content-->
        ${renderSlot($$result, $$slots["default"])}
        <!--end::Content-->
    </div>
    <!--end::Dropdown-->
</div>`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Nav/NavItem.astro");

const $$Astro$d = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Nav/CartItem.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$CartItem = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$d, $$props, $$slots);
  Astro2.self = $$CartItem;
  const { cartItem } = Astro2.props;
  return renderTemplate`<!--begin::Cart Item-->${maybeRenderHead($$result)}<div class="d-flex align-items-center justify-content-between py-2">
    <!--begin::Item Info-->
    <div class="d-flex align-items-center">
        <a${addAttribute(`/products/${cartItem.id}`, "href")} class="symbol symbox-50px" aria-label="go to product page">
            <img${addAttribute(`${"http://localhost:1337"}${cartItem.image}`, "src")}${addAttribute(cartItem.title, "alt")}>
        </a>
        <div class="ms-4">
        <a${addAttribute(`/products/${cartItem.id}`, "href")} class="text-gray-700 text-hover-primary fs-5 fw-bold">${cartItem.title}</a>
        </div>
    </div>
    <!--end::Item Info-->
    <!--begin::Delete item-->
    <button type="button" aria-label="delete cart item" class="btn btn-icon btn-custom btn-icon-muted btn-active-light btn-active-color-primary">
        <i${addAttribute(cartItem.id, "data-id")} class="bi bi-trash fs-2 text-gray-700 delete_btn"></i>
    </button>
    <!--end::Delete item-->
</div>
<!--end::Cart Item-->`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Nav/CartItem.astro");

const $$Astro$c = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Nav/Nav.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Nav = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$c, $$props, $$slots);
  Astro2.self = $$Nav;
  let user = { name: "Stranger", email: "Unknown", cart: [] };
  if (user.name === "Stranger" && Astro2.cookies.get("jwt_token").value) {
    console.log("fetching user");
    const response = await fetch(`${"http://localhost:1337"}/api/users/me/?populate[cart][populate][0]=image`, {
      headers: new Headers({
        "Authorization": `Bearer ${Astro2.cookies.get("jwt_token").value}`,
        "Content-Type": "application/x-www-form-urlencoded"
      })
    });
    const data = await response.json();
    user.name = data.username;
    user.email = data.email;
    user.cart = data.cart.map((cartItem) => {
      return {
        id: cartItem.id,
        title: cartItem.title,
        prie: cartItem.price,
        image: cartItem.image?.url
      };
    });
  }
  return renderTemplate`${maybeRenderHead($$result)}<div class="app-navbar flex-shrink-0">
  <!--begin::Nav Item-->
  ${renderComponent($$result, "NavItem", $$NavItem, { "icon": "bag", "name": "Your cart" }, { "default": () => renderTemplate`${user.name !== "Stranger" && (user?.cart?.length !== 0 ? user?.cart?.map((cartItem) => {
    return renderTemplate`${renderComponent($$result, "CartItem", $$CartItem, { "cartItem": cartItem })}`;
  }) : renderTemplate`<div class="fw-semibold text-muted fs-7">Cart is empty</div>`)}${user.name === "Stranger" && renderTemplate`<div class="fw-semibold text-muted fs-7">Sign in to see you cart items</div>`}` })}
  <!--end::Nav Item-->
  <!--begin::Nav Item-->
  ${renderComponent($$result, "NavItem", $$NavItem, { "icon": "person-circle", "name": user.name, "email": user.email }, { "default": () => renderTemplate`<div class="menu-item">
      ${user.name !== "Stranger" && renderTemplate`<button type="button" class="btn btn-light-primary w-100" id="sign_out">Sign out</button>`}
      ${user.name === "Stranger" && renderTemplate`<a href="/auth/signin" class="btn btn-light-primary w-100" id="sign_out">Sign in</a>`}
    </div>` })}
   <!--end::Nav Item-->
</div>`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Nav/Nav.astro");

const $$Astro$b = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Header.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Header = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$b, $$props, $$slots);
  Astro2.self = $$Header;
  return renderTemplate`${maybeRenderHead($$result)}<div id="kt_app_header" class="app-header">
  <div id="kt_app_header_container" class="app-container container d-flex align-items-stretch justify-content-between">
    <div id="kt_app_header_wrapper" class="d-flex align-items-stretch justify-content-between flex-grow-1">
      <!--begin::Menu-->
      ${renderComponent($$result, "Menu", $$Menu, {})}
      <!--end::Menu-->
      <!--begin::User Nav-->
      ${renderComponent($$result, "Nav", $$Nav, {})}
      <!--end::User Nav-->
    </div>
  </div>
</div>

${maybeRenderHead($$result)}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/header/Header.astro");

const $$Astro$a = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/Toast.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Toast = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$a, $$props, $$slots);
  Astro2.self = $$Toast;
  return renderTemplate`${maybeRenderHead($$result)}<div class="toast hide" role="alert" aria-live="assertive" aria-atomic="true"${addAttribute("position:fixed;right:5%;top:5%;", "style")}>
    <div class="toast-header">
        <i class="bi bi-bell me-2 fs-4"></i>
        <strong class="me-auto fs-2"></strong>
        <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
    <div class="toast-body fs-6 text-gray-700"></div>
</div>`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/Toast.astro");

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(raw || cooked.slice()) }));
var _a;
const $$Astro$9 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/layouts/Layout.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Layout = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$9, $$props, $$slots);
  Astro2.self = $$Layout;
  return renderTemplate(_a || (_a = __template(['<html lang="en">\n  <head>\n    <meta charset="UTF-8">\n    <meta http-equiv="X-UA-Compatible" content="IE=edge">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <link rel="icon" type="image/png" href="/icons/icon-48x48.png">\n    <link rel="manifest" href="/manifest.json">\n    <!--ios support-->\n    <link rel="apple-touch-icon" href="/icons/icon-96x96.png">\n    <meta name="apple-mobile-web-app-status-bar" content="#aa7700">\n    <meta name="theme-color" content="#ffffff">\n    <!--begin::Fonts-->\n    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Poppins:300,400,500,600,700">\n    <!--end::Fonts-->\n    <!--begin::Global Stylesheets Bundle(used by all pages)-->\n    <link href="/assets/plugins/global/plugins.bundle.css" rel="stylesheet" type="text/css">\n    <link href="/assets/css/style.bundle.css" rel="stylesheet" type="text/css">\n    <!--end::Global Stylesheets Bundle-->\n    <title>Astro SSR Test App</title>\n  ', '</head>\n  <body id="kt_body" class="bg-body">\n    <div class="d-flex flex-column flex-root app-root" id="kt_app_root">\n      <div class="app-page flex-column flex-column-fluid" id="kt_app_page">\n        <!--begin::Header-->\n        ', '\n        <!--end::Header-->\n        <!--begin::Main content-->\n        <div class="d-flex flex-column flex-column-fluid" id="main_content">\n          ', "\n        </div>\n        <!--end::Main content-->\n        <!--begin::Toast-->\n        ", '\n        <!--end::Toast-->\n      </div>\n    </div>\n    <!--begin::Global Javascript Bundle-->\n    <script src="/assets/plugins/global/plugins.bundle.js"><\/script>\n    <script src="/assets/js/scripts.bundle.js"><\/script>\n    <script src="/app.js"><\/script>\n    <!--end::Global Javascript Bundle-->\n  </body></html>'])), renderHead($$result), renderComponent($$result, "Header", $$Header, {}), renderSlot($$result, $$slots["default"]), renderComponent($$result, "Toast", $$Toast, {}));
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/layouts/Layout.astro");

const $$Astro$8 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/index.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Index$1 = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$8, $$props, $$slots);
  Astro2.self = $$Index$1;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": () => renderTemplate`${maybeRenderHead($$result)}<div class="d-flex flex-column flex-column-fluid justify-content-center text-center p-10 py-lg-15">
    <div class="pt-lg-10 mb-10">
      <h1 class="fw-bolder fs-2qx text-gray-800 mb-7">Welcome!</h1>
      <div class="text-center">
        <a href="auth/signup" class="btn btn-lg btn-primary fw-bolder">Sign up</a>
      </div>
    </div>
  </div>` })}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/index.astro");

const $$file$5 = "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/index.astro";
const $$url$5 = "";

const _page0 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Index$1,
	file: $$file$5,
	url: $$url$5
}, Symbol.toStringTag, { value: 'Module' }));

const $$Astro$7 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/fallback.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Fallback = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$7, $$props, $$slots);
  Astro2.self = $$Fallback;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": () => renderTemplate`${maybeRenderHead($$result)}<div class="d-flex flex-column flex-column-fluid justify-content-center text-center p-10 py-lg-15">
    <div class="pt-lg-10 mb-10">
      <h1 class="fw-bolder fs-2qx text-gray-800 mb-7">OOPS :( No internet connection 😬</h1>
    </div>
  </div>` })}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/fallback.astro");

const $$file$4 = "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/fallback.astro";
const $$url$4 = "/fallback";

const _page1 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Fallback,
	file: $$file$4,
	url: $$url$4
}, Symbol.toStringTag, { value: 'Module' }));

function ProductCard({ product, fullScreen = false }) {
  let { id, title, price, image } = product;
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: `${fullScreen ? "flex-column-fluid" : "col-md-6 col-xl-4 mb-5"}`,
      id: "product_card",
      children: /* @__PURE__ */ jsxs("div", { className: "card-xl-stretch me-md-6 shadow-sm card-rounded", children: [
        !fullScreen && /* @__PURE__ */ jsxs(
          "a",
          {
            className: "d-block overlay mb-4",
            "data-fslightbox": "lightbox-hot-sales",
            href: `/products/${id}`,
            children: [
              /* @__PURE__ */ jsx(
                "div",
                {
                  className: `overlay-wrapper bgi-no-repeat bgi-position-center bgi-size-cover card-rounded ${fullScreen ? "min-h-400px" : "min-h-200px"}`,
                  style: {
                    backgroundImage: `url(${"http://localhost:1337"}${image})`
                  }
                }
              ),
              /* @__PURE__ */ jsx("div", { className: "overlay-layer bg-dark card-rounded bg-opacity-25", children: /* @__PURE__ */ jsx("i", { className: "bi bi-eye-fill fs-2x text-white" }) })
            ]
          }
        ),
        fullScreen && /* @__PURE__ */ jsx(
          "div",
          {
            className: `overlay-wrapper bgi-no-repeat bgi-position-center bgi-size-cover card-rounded ${fullScreen ? "min-h-400px" : "min-h-200px"}`,
            style: {
              backgroundImage: `url(${"http://localhost:1337"}${image})`
            }
          }
        ),
        /* @__PURE__ */ jsxs("div", { className: "m-0 p-5", children: [
          /* @__PURE__ */ jsx(
            "a",
            {
              href: `/products/${id}`,
              className: "fs-4 text-gray-700 fw-bold text-hover-primary lh-base",
              children: title
            }
          ),
          /* @__PURE__ */ jsxs("div", { className: "d-flex align-items-center justify-content-between mt-5", children: [
            /* @__PURE__ */ jsxs("div", { className: "text-gray-700 fw-lighter fs-1 fw-200", children: [
              "$",
              price
            ] }),
            /* @__PURE__ */ jsx("div", { className: "d-flex align-items-center gap-2 gap-lg-3", children: /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                "aria-label": "add to cart",
                className: "btn btn-icon btn-custom btn-icon-muted btn-active-light btn-active-color-primary",
                children: /* @__PURE__ */ jsx(
                  "i",
                  {
                    "data-id": id,
                    className: "bi bi-bag fs-2 text-gray-700 add_btn"
                  }
                )
              }
            ) })
          ] })
        ] })
      ] })
    }
  );
}

const $$Astro$6 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/products/index.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Index = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$6, $$props, $$slots);
  Astro2.self = $$Index;
  const response = await fetch(`${"http://localhost:1337"}/api/products/?populate=*`);
  const data = await response.json();
  const products = data.data.map((product) => {
    return {
      id: product.id,
      title: product.attributes.title,
      price: product.attributes.price,
      image: product.attributes.image.data.attributes.url
    };
  });
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": () => renderTemplate`${maybeRenderHead($$result)}<div class="container d-flexflex-column flex-column-fluid p-10 pb-lg-20">
    <!--begin::Products wrapper-->
    <div class="flex-column-fluid">
      <!--begin::Products-->
      <div class="row">
        ${products.map((product) => renderTemplate`${renderComponent($$result, "ProductCard", ProductCard, { "product": product })}`)}
      </div>
      <!--end::Products-->
    </div>
    <!--end::Products wrapper-->
  </div>` })}

${maybeRenderHead($$result)}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/products/index.astro");

const $$file$3 = "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/products/index.astro";
const $$url$3 = "/products";

const _page2 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Index,
	file: $$file$3,
	url: $$url$3
}, Symbol.toStringTag, { value: 'Module' }));

const $$Astro$5 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/products/[product].astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$product = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$5, $$props, $$slots);
  Astro2.self = $$product;
  const id = Astro2.params.product;
  const response = await fetch(`${"http://localhost:1337"}/api/products/${id}/?populate=*`);
  const data = await response.json();
  const product = {
    id: data.data.id,
    title: data.data.attributes.title,
    price: data.data.attributes.price,
    image: data.data.attributes.image.data.attributes.url
  };
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": () => renderTemplate`${maybeRenderHead($$result)}<div class="container d-flex flex-column flex-column-fluid p-10 pb-lg-20">
    ${renderComponent($$result, "ProductCard", ProductCard, { "product": product, "fullScreen": true })}
  </div>` })}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/products/[product].astro");

const $$file$2 = "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/products/[product].astro";
const $$url$2 = "/products/[product]";

const _page3 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$product,
	file: $$file$2,
	url: $$url$2
}, Symbol.toStringTag, { value: 'Module' }));

const post = ({ request }) => {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `jwt_token=${request.headers.get("Authorization")}`
  );
  return new Response(null, {
    status: 200,
    headers
  });
};
const get = ({ params, request }) => {
  const headers = new Headers();
  headers.append(
    "Set-Cookie",
    `jwt_token=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT;`
  );
  return new Response(null, {
    status: 200,
    headers
  });
};

const _page4 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	post,
	get
}, Symbol.toStringTag, { value: 'Module' }));

const $$Astro$4 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/InputTextGroup.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$InputTextGroup = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$4, $$props, $$slots);
  Astro2.self = $$InputTextGroup;
  const {
    title,
    name,
    placeholder = "",
    required = false
  } = Astro2.props;
  return renderTemplate`${maybeRenderHead($$result)}<div class="mb-10 fv-row fv-plugins-icon-container">
  <label${addAttribute(name, "for")}${addAttribute(`${required && "required"} form-label`, "class")}>${title}</label>
  <input${addAttribute(name, "id")} type="text"${addAttribute(name, "name")} class="form-control mb-2"${addAttribute(placeholder, "placeholder")}>
</div>`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/InputTextGroup.astro");

const $$Astro$3 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/InputPasswordGroup.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$InputPasswordGroup = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$3, $$props, $$slots);
  Astro2.self = $$InputPasswordGroup;
  return renderTemplate`<!--begin::Input group-->${maybeRenderHead($$result)}<div class="mb-10 fv-row" data-kt-password-meter="true">
  <!--begin::Wrapper-->
  <div class="mb-1">
    <!--begin::Label-->
    <label for="password" class="form-label required">Password</label>
    <!--end::Label-->
    <!--begin::Input wrapper-->
    <div class="position-relative mb-3">
      <input id="password" class="form-control mb-2" type="password" placeholder="" name="password" autocomplete="off">
      <span class="btn btn-sm btn-icon position-absolute translate-middle top-50 end-0 me-n2" data-kt-password-meter-control="visibility">
        <i class="bi bi-eye-slash fs-2"></i>
        <i class="bi bi-eye fs-2 d-none"></i>
      </span>
    </div>
    <!--end::Input wrapper-->
  </div>
  <!--end::Wrapper-->
</div>
<!--end::Input group=-->`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/InputPasswordGroup.astro");

const $$Astro$2 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/auth/AuthForm.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$AuthForm = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$2, $$props, $$slots);
  Astro2.self = $$AuthForm;
  const { isSigninPage = false } = Astro2.props;
  return renderTemplate`${maybeRenderHead($$result)}<div class="d-flex flex-center flex-column flex-column-fluid p-10 pb-lg-20">
  <!--begin::Greeting-->
  <h1 class="fw-bolder fs-2qx text-primary mb-7">
    ${`${isSigninPage ? "Welcome back!" : "Welcome!"}`}
  </h1>
  <!--end::Greeting-->
  <!--begin::Wrapper-->
  <div class="w-lg-500px bg-body rounded shadow-sm p-10 p-lg-15 mx-auto">
    <!--begin::Form-->
    <form class="form w-100" novalidate="novalidate" id="form">
      <!--begin::Heading-->
      <div class="mb-10 text-center">
        <!--begin::Title-->
        <h1 class="text-gray-700 mb-3">
          ${`${isSigninPage ? "Sign In to Your Account" : "Create an Account"}`}
        </h1>
        <!--end::Title-->
        <!--begin::Link-->
        <div class="text-gray-400 fw-bold fs-4">
          ${`${isSigninPage ? "New Here?" : "Already have an account?"}`}
          <a${addAttribute(`${isSigninPage ? "/auth/signup" : "/auth/signin"}`, "href")} class="link-primary fw-bolder">${`${isSigninPage ? "Create an Account" : "Sign in Here"}`}</a>
        </div>
        <!--end::Link-->
      </div>
      <!--end::Heading-->
      <!--begin::Username input group-->
      ${!isSigninPage && renderTemplate`${renderComponent($$result, "InputTextGroup", $$InputTextGroup, { "title": "Username", "name": "username", "required": true })}`}
      <!--end::Username input group-->
      <!--begin::Email input group-->
      ${isSigninPage ? renderTemplate`${renderComponent($$result, "InputTextGroup", $$InputTextGroup, { "title": "Email", "name": "identifier", "required": true })}` : renderTemplate`${renderComponent($$result, "InputTextGroup", $$InputTextGroup, { "title": "Email", "name": "email", "required": true })}`}
      <!--end::Email input group-->
      <!--begin::Passwword input group-->
      ${renderComponent($$result, "InputPasswordGroup", $$InputPasswordGroup, {})}
      <!--end::Passwword input group-->
      <!--begin::Actions-->
      <div class="text-center">
        <button type="submit" id="kt_sign_up_submit" class="btn btn-lg btn-primary w-100 mb-5">
          <span class="indicator-label">Submit</span>
          <span class="indicator-progress">Please wait...
            <span class="spinner-border spinner-border-sm align-middle ms-2"></span>
          </span>
        </button>
      </div>
      <!--end::Actions-->
    </form>
    <!--end::Form-->
  </div>
  <!--end::Wrapper-->
</div>`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/components/auth/AuthForm.astro");

const $$Astro$1 = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/auth/signin.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Signin = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro$1, $$props, $$slots);
  Astro2.self = $$Signin;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": () => renderTemplate`${renderComponent($$result, "AuthForm", $$AuthForm, { "isSigninPage": true })}` })}

${maybeRenderHead($$result)}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/auth/signin.astro");

const $$file$1 = "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/auth/signin.astro";
const $$url$1 = "/auth/signin";

const _page5 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Signin,
	file: $$file$1,
	url: $$url$1
}, Symbol.toStringTag, { value: 'Module' }));

const $$Astro = createAstro("C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/auth/signup.astro", "", "file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/");
const $$Signup = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Signup;
  return renderTemplate`${renderComponent($$result, "Layout", $$Layout, {}, { "default": () => renderTemplate`${renderComponent($$result, "AuthForm", $$AuthForm, {})}` })}

${maybeRenderHead($$result)}`;
}, "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/auth/signup.astro");

const $$file = "C:/Users/Abuobida/Projects/astro-ssr/frontend/src/pages/auth/signup.astro";
const $$url = "/auth/signup";

const _page6 = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
	__proto__: null,
	default: $$Signup,
	file: $$file,
	url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const pageMap = new Map([["src/pages/index.astro", _page0],["src/pages/fallback.astro", _page1],["src/pages/products/index.astro", _page2],["src/pages/products/[product].astro", _page3],["src/pages/cookie.ts", _page4],["src/pages/auth/signin.astro", _page5],["src/pages/auth/signup.astro", _page6],]);
const renderers = [Object.assign({"name":"astro:jsx","serverEntrypoint":"astro/jsx/server.js","jsxImportSource":"astro"}, { ssr: server_default }),Object.assign({"name":"@astrojs/react","clientEntrypoint":"@astrojs/react/client.js","serverEntrypoint":"@astrojs/react/server.js"}, { ssr: _renderer1 }),];

if (typeof process !== "undefined") {
  if (process.argv.includes("--verbose")) ; else if (process.argv.includes("--silent")) ; else ;
}

const SCRIPT_EXTENSIONS = /* @__PURE__ */ new Set([".js", ".ts"]);
new RegExp(
  `\\.(${Array.from(SCRIPT_EXTENSIONS).map((s) => s.slice(1)).join("|")})($|\\?)`
);

const STYLE_EXTENSIONS = /* @__PURE__ */ new Set([
  ".css",
  ".pcss",
  ".postcss",
  ".scss",
  ".sass",
  ".styl",
  ".stylus",
  ".less"
]);
new RegExp(
  `\\.(${Array.from(STYLE_EXTENSIONS).map((s) => s.slice(1)).join("|")})($|\\?)`
);

function getRouteGenerator(segments, addTrailingSlash) {
  const template = segments.map((segment) => {
    return "/" + segment.map((part) => {
      if (part.spread) {
        return `:${part.content.slice(3)}(.*)?`;
      } else if (part.dynamic) {
        return `:${part.content}`;
      } else {
        return part.content.normalize().replace(/\?/g, "%3F").replace(/#/g, "%23").replace(/%5B/g, "[").replace(/%5D/g, "]").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
    }).join("");
  }).join("");
  let trailing = "";
  if (addTrailingSlash === "always" && segments.length) {
    trailing = "/";
  }
  const toPath = compile(template + trailing);
  return toPath;
}

function deserializeRouteData(rawRouteData) {
  return {
    route: rawRouteData.route,
    type: rawRouteData.type,
    pattern: new RegExp(rawRouteData.pattern),
    params: rawRouteData.params,
    component: rawRouteData.component,
    generate: getRouteGenerator(rawRouteData.segments, rawRouteData._meta.trailingSlash),
    pathname: rawRouteData.pathname || void 0,
    segments: rawRouteData.segments
  };
}

function deserializeManifest(serializedManifest) {
  const routes = [];
  for (const serializedRoute of serializedManifest.routes) {
    routes.push({
      ...serializedRoute,
      routeData: deserializeRouteData(serializedRoute.routeData)
    });
    const route = serializedRoute;
    route.routeData = deserializeRouteData(serializedRoute.routeData);
  }
  const assets = new Set(serializedManifest.assets);
  return {
    ...serializedManifest,
    assets,
    routes
  };
}

const _manifest = Object.assign(deserializeManifest({"adapterName":"@astrojs/netlify/functions","routes":[{"file":"","links":[],"scripts":[{"type":"external","value":"hoisted.117f6f71.js"}],"routeData":{"route":"/","type":"page","pattern":"^\\/$","segments":[],"params":[],"component":"src/pages/index.astro","pathname":"/","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"hoisted.117f6f71.js"}],"routeData":{"route":"/fallback","type":"page","pattern":"^\\/fallback\\/?$","segments":[[{"content":"fallback","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/fallback.astro","pathname":"/fallback","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"hoisted.bdc72ba0.js"}],"routeData":{"route":"/products","type":"page","pattern":"^\\/products\\/?$","segments":[[{"content":"products","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/products/index.astro","pathname":"/products","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"hoisted.117f6f71.js"}],"routeData":{"route":"/products/[product]","type":"page","pattern":"^\\/products\\/([^/]+?)\\/?$","segments":[[{"content":"products","dynamic":false,"spread":false}],[{"content":"product","dynamic":true,"spread":false}]],"params":["product"],"component":"src/pages/products/[product].astro","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[],"routeData":{"route":"/cookie","type":"endpoint","pattern":"^\\/cookie$","segments":[[{"content":"cookie","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/cookie.ts","pathname":"/cookie","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"hoisted.f61ed6df.js"}],"routeData":{"route":"/auth/signin","type":"page","pattern":"^\\/auth\\/signin\\/?$","segments":[[{"content":"auth","dynamic":false,"spread":false}],[{"content":"signin","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/auth/signin.astro","pathname":"/auth/signin","_meta":{"trailingSlash":"ignore"}}},{"file":"","links":[],"scripts":[{"type":"external","value":"hoisted.940a136b.js"}],"routeData":{"route":"/auth/signup","type":"page","pattern":"^\\/auth\\/signup\\/?$","segments":[[{"content":"auth","dynamic":false,"spread":false}],[{"content":"signup","dynamic":false,"spread":false}]],"params":[],"component":"src/pages/auth/signup.astro","pathname":"/auth/signup","_meta":{"trailingSlash":"ignore"}}}],"base":"/","markdown":{"drafts":false,"syntaxHighlight":"shiki","shikiConfig":{"langs":[],"theme":"github-dark","wrap":false},"remarkPlugins":[],"rehypePlugins":[],"remarkRehype":{},"extendDefaultPlugins":false,"isAstroFlavoredMd":false,"isExperimentalContentCollections":false,"contentDir":"file:///C:/Users/Abuobida/Projects/astro-ssr/frontend/src/content/"},"pageMap":null,"renderers":[],"entryModules":{"\u0000@astrojs-ssr-virtual-entry":"entry.mjs","C:/Users/Abuobida/Projects/astro-ssr/frontend/node_modules/@astrojs/react/vnode-children.js":"chunks/vnode-children.9f8ac639.mjs","@astrojs/react/client.js":"client.9bbc0b35.js","/astro/hoisted.js?q=0":"hoisted.bdc72ba0.js","/astro/hoisted.js?q=1":"hoisted.f61ed6df.js","/astro/hoisted.js?q=2":"hoisted.940a136b.js","/astro/hoisted.js?q=3":"hoisted.117f6f71.js","astro:scripts/before-hydration.js":""},"assets":["/app.js","/client.9bbc0b35.js","/favicon.svg","/hoisted.117f6f71.js","/hoisted.940a136b.js","/hoisted.bdc72ba0.js","/hoisted.f61ed6df.js","/manifest.json","/robots.txt","/service-worker.js","/chunks/Header.astro_astro_type_script_index_0_lang.eab26a4e.js","/icons/icon-128x128.png","/icons/icon-144x144.png","/icons/icon-152x152.png","/icons/icon-192x192.png","/icons/icon-384x384.png","/icons/icon-48x48.png","/icons/icon-512x512.png","/icons/icon-72x72.png","/icons/icon-96x96.png","/assets/css/style.bundle.css","/assets/js/scripts.bundle.js","/assets/js/widgets.bundle.js","/assets/media/flags/afghanistan.svg","/assets/media/flags/aland-islands.svg","/assets/media/flags/albania.svg","/assets/media/flags/algeria.svg","/assets/media/flags/american-samoa.svg","/assets/media/flags/andorra.svg","/assets/media/flags/angola.svg","/assets/media/flags/anguilla.svg","/assets/media/flags/antigua-and-barbuda.svg","/assets/media/flags/argentina.svg","/assets/media/flags/armenia.svg","/assets/media/flags/aruba.svg","/assets/media/flags/australia.svg","/assets/media/flags/austria.svg","/assets/media/flags/azerbaijan.svg","/assets/media/flags/azores-islands.svg","/assets/media/flags/bahamas.svg","/assets/media/flags/bahrain.svg","/assets/media/flags/balearic-islands.svg","/assets/media/flags/bangladesh.svg","/assets/media/flags/barbados.svg","/assets/media/flags/basque-country.svg","/assets/media/flags/belarus.svg","/assets/media/flags/belgium.svg","/assets/media/flags/belize.svg","/assets/media/flags/benin.svg","/assets/media/flags/bermuda.svg","/assets/media/flags/bhutan.svg","/assets/media/flags/bolivia.svg","/assets/media/flags/bonaire.svg","/assets/media/flags/bosnia-and-herzegovina.svg","/assets/media/flags/botswana.svg","/assets/media/flags/brazil.svg","/assets/media/flags/british-columbia.svg","/assets/media/flags/british-indian-ocean-territory.svg","/assets/media/flags/british-virgin-islands.svg","/assets/media/flags/brunei.svg","/assets/media/flags/bulgaria.svg","/assets/media/flags/burkina-faso.svg","/assets/media/flags/burundi.svg","/assets/media/flags/cambodia.svg","/assets/media/flags/cameroon.svg","/assets/media/flags/canada.svg","/assets/media/flags/canary-islands.svg","/assets/media/flags/cape-verde.svg","/assets/media/flags/cayman-islands.svg","/assets/media/flags/central-african-republic.svg","/assets/media/flags/ceuta.svg","/assets/media/flags/chad.svg","/assets/media/flags/chile.svg","/assets/media/flags/china.svg","/assets/media/flags/christmas-island.svg","/assets/media/flags/cocos-island.svg","/assets/media/flags/colombia.svg","/assets/media/flags/comoros.svg","/assets/media/flags/cook-islands.svg","/assets/media/flags/corsica.svg","/assets/media/flags/costa-rica.svg","/assets/media/flags/croatia.svg","/assets/media/flags/cuba.svg","/assets/media/flags/curacao.svg","/assets/media/flags/czech-republic.svg","/assets/media/flags/democratic-republic-of-congo.svg","/assets/media/flags/denmark.svg","/assets/media/flags/djibouti.svg","/assets/media/flags/dominica.svg","/assets/media/flags/dominican-republic.svg","/assets/media/flags/east-timor.svg","/assets/media/flags/ecuador.svg","/assets/media/flags/egypt.svg","/assets/media/flags/el-salvador.svg","/assets/media/flags/england.svg","/assets/media/flags/equatorial-guinea.svg","/assets/media/flags/eritrea.svg","/assets/media/flags/estonia.svg","/assets/media/flags/ethiopia.svg","/assets/media/flags/european-union.svg","/assets/media/flags/falkland-islands.svg","/assets/media/flags/fiji.svg","/assets/media/flags/finland.svg","/assets/media/flags/flag.svg","/assets/media/flags/france.svg","/assets/media/flags/french-polynesia.svg","/assets/media/flags/gabon.svg","/assets/media/flags/galapagos-islands.svg","/assets/media/flags/gambia.svg","/assets/media/flags/georgia.svg","/assets/media/flags/germany.svg","/assets/media/flags/ghana.svg","/assets/media/flags/gibraltar.svg","/assets/media/flags/greece.svg","/assets/media/flags/greenland.svg","/assets/media/flags/grenada.svg","/assets/media/flags/guam.svg","/assets/media/flags/guatemala.svg","/assets/media/flags/guernsey.svg","/assets/media/flags/guinea-bissau.svg","/assets/media/flags/guinea.svg","/assets/media/flags/haiti.svg","/assets/media/flags/hawaii.svg","/assets/media/flags/honduras.svg","/assets/media/flags/hong-kong.svg","/assets/media/flags/hungary.svg","/assets/media/flags/iceland.svg","/assets/media/flags/india.svg","/assets/media/flags/indonesia.svg","/assets/media/flags/iran.svg","/assets/media/flags/iraq.svg","/assets/media/flags/ireland.svg","/assets/media/flags/isle-of-man.svg","/assets/media/flags/israel.svg","/assets/media/flags/italy.svg","/assets/media/flags/ivory-coast.svg","/assets/media/flags/jamaica.svg","/assets/media/flags/japan.svg","/assets/media/flags/jersey.svg","/assets/media/flags/jordan.svg","/assets/media/flags/kazakhstan.svg","/assets/media/flags/kenya.svg","/assets/media/flags/kiribati.svg","/assets/media/flags/kosovo.svg","/assets/media/flags/kuwait.svg","/assets/media/flags/kyrgyzstan.svg","/assets/media/flags/laos.svg","/assets/media/flags/latvia.svg","/assets/media/flags/lebanon.svg","/assets/media/flags/lesotho.svg","/assets/media/flags/liberia.svg","/assets/media/flags/libya.svg","/assets/media/flags/liechtenstein.svg","/assets/media/flags/lithuania.svg","/assets/media/flags/luxembourg.svg","/assets/media/flags/macao.svg","/assets/media/flags/madagascar.svg","/assets/media/flags/madeira.svg","/assets/media/flags/malawi.svg","/assets/media/flags/malaysia.svg","/assets/media/flags/maldives.svg","/assets/media/flags/mali.svg","/assets/media/flags/malta.svg","/assets/media/flags/marshall-island.svg","/assets/media/flags/martinique.svg","/assets/media/flags/mauritania.svg","/assets/media/flags/mauritius.svg","/assets/media/flags/melilla.svg","/assets/media/flags/mexico.svg","/assets/media/flags/micronesia.svg","/assets/media/flags/moldova.svg","/assets/media/flags/monaco.svg","/assets/media/flags/mongolia.svg","/assets/media/flags/montenegro.svg","/assets/media/flags/montserrat.svg","/assets/media/flags/morocco.svg","/assets/media/flags/mozambique.svg","/assets/media/flags/myanmar.svg","/assets/media/flags/namibia.svg","/assets/media/flags/nato.svg","/assets/media/flags/nauru.svg","/assets/media/flags/nepal.svg","/assets/media/flags/netherlands.svg","/assets/media/flags/new-zealand.svg","/assets/media/flags/nicaragua.svg","/assets/media/flags/niger.svg","/assets/media/flags/nigeria.svg","/assets/media/flags/niue.svg","/assets/media/flags/norfolk-island.svg","/assets/media/flags/north-korea.svg","/assets/media/flags/northern-cyprus.svg","/assets/media/flags/northern-mariana-islands.svg","/assets/media/flags/norway.svg","/assets/media/flags/oman.svg","/assets/media/flags/ossetia.svg","/assets/media/flags/pakistan.svg","/assets/media/flags/palau.svg","/assets/media/flags/palestine.svg","/assets/media/flags/panama.svg","/assets/media/flags/papua-new-guinea.svg","/assets/media/flags/paraguay.svg","/assets/media/flags/peru.svg","/assets/media/flags/philippines.svg","/assets/media/flags/pitcairn-islands.svg","/assets/media/flags/poland.svg","/assets/media/flags/portugal.svg","/assets/media/flags/puerto-rico.svg","/assets/media/flags/qatar.svg","/assets/media/flags/rapa-nui.svg","/assets/media/flags/republic-of-macedonia.svg","/assets/media/flags/republic-of-the-congo.svg","/assets/media/flags/romania.svg","/assets/media/flags/russia.svg","/assets/media/flags/rwanda.svg","/assets/media/flags/saba-island.svg","/assets/media/flags/sahrawi-arab-democratic-republic.svg","/assets/media/flags/saint-kitts-and-nevis.svg","/assets/media/flags/samoa.svg","/assets/media/flags/san-marino.svg","/assets/media/flags/sao-tome-and-prince.svg","/assets/media/flags/sardinia.svg","/assets/media/flags/saudi-arabia.svg","/assets/media/flags/scotland.svg","/assets/media/flags/senegal.svg","/assets/media/flags/serbia.svg","/assets/media/flags/seychelles.svg","/assets/media/flags/sicily.svg","/assets/media/flags/sierra-leone.svg","/assets/media/flags/singapore.svg","/assets/media/flags/sint-eustatius.svg","/assets/media/flags/sint-maarten.svg","/assets/media/flags/slovakia.svg","/assets/media/flags/slovenia.svg","/assets/media/flags/solomon-islands.svg","/assets/media/flags/somalia.svg","/assets/media/flags/somaliland.svg","/assets/media/flags/south-africa.svg","/assets/media/flags/south-korea.svg","/assets/media/flags/south-sudan.svg","/assets/media/flags/spain.svg","/assets/media/flags/sri-lanka.svg","/assets/media/flags/st-barts.svg","/assets/media/flags/st-lucia.svg","/assets/media/flags/st-vincent-and-the-grenadines.svg","/assets/media/flags/sudan.svg","/assets/media/flags/suriname.svg","/assets/media/flags/swaziland.svg","/assets/media/flags/sweden.svg","/assets/media/flags/switzerland.svg","/assets/media/flags/syria.svg","/assets/media/flags/taiwan.svg","/assets/media/flags/tajikistan.svg","/assets/media/flags/tanzania.svg","/assets/media/flags/thailand.svg","/assets/media/flags/tibet.svg","/assets/media/flags/togo.svg","/assets/media/flags/tokelau.svg","/assets/media/flags/tonga.svg","/assets/media/flags/transnistria.svg","/assets/media/flags/trinidad-and-tobago.svg","/assets/media/flags/tunisia.svg","/assets/media/flags/turkey.svg","/assets/media/flags/turkmenistan.svg","/assets/media/flags/turks-and-caicos.svg","/assets/media/flags/tuvalu-1.svg","/assets/media/flags/tuvalu.svg","/assets/media/flags/uganda.svg","/assets/media/flags/uk.svg","/assets/media/flags/ukraine.svg","/assets/media/flags/united-arab-emirates.svg","/assets/media/flags/united-kingdom.svg","/assets/media/flags/united-nations.svg","/assets/media/flags/united-states.svg","/assets/media/flags/uruguay.svg","/assets/media/flags/uzbekistan.svg","/assets/media/flags/vanuatu.svg","/assets/media/flags/vatican-city.svg","/assets/media/flags/venezuela.svg","/assets/media/flags/vietnam.svg","/assets/media/flags/virgin-islands.svg","/assets/media/flags/wales.svg","/assets/media/flags/yemen.svg","/assets/media/flags/zambia.svg","/assets/media/flags/zimbabwe.svg","/assets/js/custom/landing.js","/assets/js/custom/widgets.js","/assets/plugins/global/plugins.bundle.css","/assets/plugins/global/plugins.bundle.js","/assets/media/plugins/jstree/32px.png","/assets/plugins/custom/datatables/datatables.bundle.css","/assets/plugins/custom/datatables/datatables.bundle.js","/assets/plugins/custom/ckeditor/ckeditor-balloon-block.bundle.js","/assets/plugins/custom/ckeditor/ckeditor-balloon.bundle.js","/assets/plugins/custom/ckeditor/ckeditor-classic.bundle.js","/assets/plugins/custom/ckeditor/ckeditor-document.bundle.js","/assets/plugins/custom/ckeditor/ckeditor-inline.bundle.js","/assets/plugins/custom/draggable/draggable.bundle.js","/assets/plugins/custom/flotcharts/flotcharts.bundle.js","/assets/plugins/custom/cropper/cropper.bundle.css","/assets/plugins/custom/cropper/cropper.bundle.js","/assets/plugins/custom/formrepeater/formrepeater.bundle.js","/assets/plugins/custom/fslightbox/fslightbox.bundle.js","/assets/plugins/custom/fullcalendar/fullcalendar.bundle.css","/assets/plugins/custom/fullcalendar/fullcalendar.bundle.js","/assets/plugins/custom/jkanban/jkanban.bundle.css","/assets/plugins/custom/jkanban/jkanban.bundle.js","/assets/plugins/custom/jstree/jstree.bundle.css","/assets/plugins/custom/jstree/jstree.bundle.js","/assets/plugins/custom/leaflet/leaflet.bundle.css","/assets/plugins/custom/leaflet/leaflet.bundle.js","/assets/plugins/custom/prismjs/prismjs.bundle.css","/assets/plugins/custom/prismjs/prismjs.bundle.js","/assets/plugins/custom/typedjs/typedjs.bundle.js","/assets/plugins/custom/vis-timeline/vis-timeline.bundle.css","/assets/plugins/custom/vis-timeline/vis-timeline.bundle.js","/assets/plugins/custom/tinymce/tinymce.bundle.js","/assets/media/icons/duotune/abstract/abs001.svg","/assets/media/icons/duotune/abstract/abs002.svg","/assets/media/icons/duotune/abstract/abs003.svg","/assets/media/icons/duotune/abstract/abs004.svg","/assets/media/icons/duotune/abstract/abs005.svg","/assets/media/icons/duotune/abstract/abs006.svg","/assets/media/icons/duotune/abstract/abs007.svg","/assets/media/icons/duotune/abstract/abs008.svg","/assets/media/icons/duotune/abstract/abs009.svg","/assets/media/icons/duotune/abstract/abs010.svg","/assets/media/icons/duotune/abstract/abs011.svg","/assets/media/icons/duotune/abstract/abs012.svg","/assets/media/icons/duotune/abstract/abs013.svg","/assets/media/icons/duotune/abstract/abs014.svg","/assets/media/icons/duotune/abstract/abs015.svg","/assets/media/icons/duotune/abstract/abs016.svg","/assets/media/icons/duotune/abstract/abs017.svg","/assets/media/icons/duotune/abstract/abs018.svg","/assets/media/icons/duotune/abstract/abs019.svg","/assets/media/icons/duotune/abstract/abs020.svg","/assets/media/icons/duotune/abstract/abs021.svg","/assets/media/icons/duotune/abstract/abs022.svg","/assets/media/icons/duotune/abstract/abs023.svg","/assets/media/icons/duotune/abstract/abs024.svg","/assets/media/icons/duotune/abstract/abs025.svg","/assets/media/icons/duotune/abstract/abs026.svg","/assets/media/icons/duotune/abstract/abs027.svg","/assets/media/icons/duotune/abstract/abs028.svg","/assets/media/icons/duotune/abstract/abs029.svg","/assets/media/icons/duotune/abstract/abs030.svg","/assets/media/icons/duotune/abstract/abs031.svg","/assets/media/icons/duotune/abstract/abs032.svg","/assets/media/icons/duotune/abstract/abs033.svg","/assets/media/icons/duotune/abstract/abs034.svg","/assets/media/icons/duotune/abstract/abs035.svg","/assets/media/icons/duotune/abstract/abs036.svg","/assets/media/icons/duotune/abstract/abs037.svg","/assets/media/icons/duotune/abstract/abs038.svg","/assets/media/icons/duotune/abstract/abs039.svg","/assets/media/icons/duotune/abstract/abs040.svg","/assets/media/icons/duotune/abstract/abs041.svg","/assets/media/icons/duotune/abstract/abs042.svg","/assets/media/icons/duotune/abstract/abs043.svg","/assets/media/icons/duotune/abstract/abs044.svg","/assets/media/icons/duotune/abstract/abs045.svg","/assets/media/icons/duotune/abstract/abs046.svg","/assets/media/icons/duotune/abstract/abs047.svg","/assets/media/icons/duotune/abstract/abs048.svg","/assets/media/icons/duotune/abstract/abs049.svg","/assets/media/icons/duotune/abstract/abs050.svg","/assets/media/icons/duotune/abstract/abs051.svg","/assets/media/icons/duotune/abstract/abs052.svg","/assets/plugins/global/sourcemaps/tiny-slider.css.map","/assets/media/icons/duotune/coding/cod001.svg","/assets/media/icons/duotune/coding/cod002.svg","/assets/media/icons/duotune/coding/cod003.svg","/assets/media/icons/duotune/coding/cod004.svg","/assets/media/icons/duotune/coding/cod005.svg","/assets/media/icons/duotune/coding/cod006.svg","/assets/media/icons/duotune/coding/cod007.svg","/assets/media/icons/duotune/coding/cod008.svg","/assets/media/icons/duotune/coding/cod009.svg","/assets/media/icons/duotune/coding/cod010.svg","/assets/media/icons/duotune/arrows/arr001.svg","/assets/media/icons/duotune/arrows/arr002.svg","/assets/media/icons/duotune/arrows/arr003.svg","/assets/media/icons/duotune/arrows/arr004.svg","/assets/media/icons/duotune/arrows/arr005.svg","/assets/media/icons/duotune/arrows/arr006.svg","/assets/media/icons/duotune/arrows/arr007.svg","/assets/media/icons/duotune/arrows/arr008.svg","/assets/media/icons/duotune/arrows/arr009.svg","/assets/media/icons/duotune/arrows/arr010.svg","/assets/media/icons/duotune/arrows/arr011.svg","/assets/media/icons/duotune/arrows/arr012.svg","/assets/media/icons/duotune/arrows/arr013.svg","/assets/media/icons/duotune/arrows/arr014.svg","/assets/media/icons/duotune/arrows/arr015.svg","/assets/media/icons/duotune/arrows/arr016.svg","/assets/media/icons/duotune/arrows/arr017.svg","/assets/media/icons/duotune/arrows/arr018.svg","/assets/media/icons/duotune/arrows/arr019.svg","/assets/media/icons/duotune/arrows/arr020.svg","/assets/media/icons/duotune/arrows/arr021.svg","/assets/media/icons/duotune/arrows/arr022.svg","/assets/media/icons/duotune/arrows/arr023.svg","/assets/media/icons/duotune/arrows/arr024.svg","/assets/media/icons/duotune/arrows/arr025.svg","/assets/media/icons/duotune/arrows/arr026.svg","/assets/media/icons/duotune/arrows/arr027.svg","/assets/media/icons/duotune/arrows/arr028.svg","/assets/media/icons/duotune/arrows/arr029.svg","/assets/media/icons/duotune/arrows/arr030.svg","/assets/media/icons/duotune/arrows/arr031.svg","/assets/media/icons/duotune/arrows/arr032.svg","/assets/media/icons/duotune/arrows/arr033.svg","/assets/media/icons/duotune/arrows/arr034.svg","/assets/media/icons/duotune/arrows/arr035.svg","/assets/media/icons/duotune/arrows/arr036.svg","/assets/media/icons/duotune/arrows/arr037.svg","/assets/media/icons/duotune/arrows/arr038.svg","/assets/media/icons/duotune/arrows/arr039.svg","/assets/media/icons/duotune/arrows/arr040.svg","/assets/media/icons/duotune/arrows/arr041.svg","/assets/media/icons/duotune/arrows/arr042.svg","/assets/media/icons/duotune/arrows/arr043.svg","/assets/media/icons/duotune/arrows/arr044.svg","/assets/media/icons/duotune/arrows/arr045.svg","/assets/media/icons/duotune/arrows/arr046.svg","/assets/media/icons/duotune/arrows/arr047.svg","/assets/media/icons/duotune/arrows/arr048.svg","/assets/media/icons/duotune/arrows/arr049.svg","/assets/media/icons/duotune/arrows/arr050.svg","/assets/media/icons/duotune/arrows/arr051.svg","/assets/media/icons/duotune/arrows/arr052.svg","/assets/media/icons/duotune/arrows/arr053.svg","/assets/media/icons/duotune/arrows/arr054.svg","/assets/media/icons/duotune/arrows/arr055.svg","/assets/media/icons/duotune/arrows/arr056.svg","/assets/media/icons/duotune/arrows/arr057.svg","/assets/media/icons/duotune/arrows/arr058.svg","/assets/media/icons/duotune/arrows/arr059.svg","/assets/media/icons/duotune/arrows/arr060.svg","/assets/media/icons/duotune/arrows/arr061.svg","/assets/media/icons/duotune/arrows/arr062.svg","/assets/media/icons/duotune/arrows/arr063.svg","/assets/media/icons/duotune/arrows/arr064.svg","/assets/media/icons/duotune/arrows/arr065.svg","/assets/media/icons/duotune/arrows/arr066.svg","/assets/media/icons/duotune/arrows/arr067.svg","/assets/media/icons/duotune/arrows/arr068.svg","/assets/media/icons/duotune/arrows/arr069.svg","/assets/media/icons/duotune/arrows/arr070.svg","/assets/media/icons/duotune/arrows/arr071.svg","/assets/media/icons/duotune/arrows/arr072.svg","/assets/media/icons/duotune/arrows/arr073.svg","/assets/media/icons/duotune/arrows/arr074.svg","/assets/media/icons/duotune/arrows/arr075.svg","/assets/media/icons/duotune/arrows/arr076.svg","/assets/media/icons/duotune/arrows/arr077.svg","/assets/media/icons/duotune/arrows/arr078.svg","/assets/media/icons/duotune/arrows/arr079.svg","/assets/media/icons/duotune/arrows/arr080.svg","/assets/media/icons/duotune/arrows/arr081.svg","/assets/media/icons/duotune/arrows/arr082.svg","/assets/media/icons/duotune/arrows/arr084.svg","/assets/media/icons/duotune/arrows/arr085.svg","/assets/media/icons/duotune/arrows/arr086.svg","/assets/media/icons/duotune/arrows/arr087.svg","/assets/media/icons/duotune/arrows/arr088.svg","/assets/media/icons/duotune/arrows/arr089.svg","/assets/media/icons/duotune/arrows/arr090.svg","/assets/media/icons/duotune/arrows/arr091.svg","/assets/media/icons/duotune/arrows/arr092.svg","/assets/media/icons/duotune/arrows/arr093.svg","/assets/media/icons/duotune/arrows/arr094.svg","/assets/media/icons/duotune/arrows/arr095.svg","/assets/media/icons/duotune/arrows/arr096.svg","/assets/media/icons/duotune/communication/com001.svg","/assets/media/icons/duotune/communication/com002.svg","/assets/media/icons/duotune/communication/com003.svg","/assets/media/icons/duotune/communication/com004.svg","/assets/media/icons/duotune/communication/com005.svg","/assets/media/icons/duotune/communication/com006.svg","/assets/media/icons/duotune/communication/com007.svg","/assets/media/icons/duotune/communication/com008.svg","/assets/media/icons/duotune/communication/com009.svg","/assets/media/icons/duotune/communication/com010.svg","/assets/media/icons/duotune/communication/com011.svg","/assets/media/icons/duotune/communication/com012.svg","/assets/media/icons/duotune/communication/com013.svg","/assets/media/icons/duotune/communication/com014.svg","/assets/media/icons/duotune/ecommerce/ecm001.svg","/assets/media/icons/duotune/ecommerce/ecm002.svg","/assets/media/icons/duotune/ecommerce/ecm003.svg","/assets/media/icons/duotune/ecommerce/ecm004.svg","/assets/media/icons/duotune/ecommerce/ecm005.svg","/assets/media/icons/duotune/ecommerce/ecm006.svg","/assets/media/icons/duotune/ecommerce/ecm007.svg","/assets/media/icons/duotune/ecommerce/ecm008.svg","/assets/media/icons/duotune/ecommerce/ecm009.svg","/assets/media/icons/duotune/ecommerce/ecm010.svg","/assets/media/icons/duotune/ecommerce/ecm011.svg","/assets/media/icons/duotune/art/art001.svg","/assets/media/icons/duotune/art/art002.svg","/assets/media/icons/duotune/art/art003.svg","/assets/media/icons/duotune/art/art004.svg","/assets/media/icons/duotune/art/art005.svg","/assets/media/icons/duotune/art/art006.svg","/assets/media/icons/duotune/art/art007.svg","/assets/media/icons/duotune/art/art008.svg","/assets/media/icons/duotune/art/art009.svg","/assets/media/icons/duotune/art/art010.svg","/assets/media/icons/duotune/electronics/elc001.svg","/assets/media/icons/duotune/electronics/elc002.svg","/assets/media/icons/duotune/electronics/elc003.svg","/assets/media/icons/duotune/electronics/elc004.svg","/assets/media/icons/duotune/electronics/elc005.svg","/assets/media/icons/duotune/electronics/elc006.svg","/assets/media/icons/duotune/electronics/elc007.svg","/assets/media/icons/duotune/electronics/elc008.svg","/assets/media/icons/duotune/electronics/elc009.svg","/assets/media/icons/duotune/electronics/elc010.svg","/assets/media/icons/duotune/files/fil001.svg","/assets/media/icons/duotune/files/fil002.svg","/assets/media/icons/duotune/files/fil003.svg","/assets/media/icons/duotune/files/fil004.svg","/assets/media/icons/duotune/files/fil005.svg","/assets/media/icons/duotune/files/fil006.svg","/assets/media/icons/duotune/files/fil007.svg","/assets/media/icons/duotune/files/fil008.svg","/assets/media/icons/duotune/files/fil009.svg","/assets/media/icons/duotune/files/fil010.svg","/assets/media/icons/duotune/files/fil011.svg","/assets/media/icons/duotune/files/fil012.svg","/assets/media/icons/duotune/files/fil013.svg","/assets/media/icons/duotune/files/fil014.svg","/assets/media/icons/duotune/files/fil015.svg","/assets/media/icons/duotune/files/fil016.svg","/assets/media/icons/duotune/files/fil017.svg","/assets/media/icons/duotune/files/fil018.svg","/assets/media/icons/duotune/files/fil019.svg","/assets/media/icons/duotune/files/fil020.svg","/assets/media/icons/duotune/files/fil021.svg","/assets/media/icons/duotune/files/fil022.svg","/assets/media/icons/duotune/files/fil023.svg","/assets/media/icons/duotune/files/fil024.svg","/assets/media/icons/duotune/files/fil025.svg","/assets/media/icons/duotune/finance/fin001.svg","/assets/media/icons/duotune/finance/fin002.svg","/assets/media/icons/duotune/finance/fin003.svg","/assets/media/icons/duotune/finance/fin004.svg","/assets/media/icons/duotune/finance/fin005.svg","/assets/media/icons/duotune/finance/fin006.svg","/assets/media/icons/duotune/finance/fin007.svg","/assets/media/icons/duotune/finance/fin008.svg","/assets/media/icons/duotune/finance/fin009.svg","/assets/media/icons/duotune/finance/fin010.svg","/assets/media/icons/duotune/general/gen001.svg","/assets/media/icons/duotune/general/gen002.svg","/assets/media/icons/duotune/general/gen003.svg","/assets/media/icons/duotune/general/gen004.svg","/assets/media/icons/duotune/general/gen005.svg","/assets/media/icons/duotune/general/gen006.svg","/assets/media/icons/duotune/general/gen007.svg","/assets/media/icons/duotune/general/gen008.svg","/assets/media/icons/duotune/general/gen009.svg","/assets/media/icons/duotune/general/gen010.svg","/assets/media/icons/duotune/general/gen011.svg","/assets/media/icons/duotune/general/gen012.svg","/assets/media/icons/duotune/general/gen013.svg","/assets/media/icons/duotune/general/gen014.svg","/assets/media/icons/duotune/general/gen015.svg","/assets/media/icons/duotune/general/gen016.svg","/assets/media/icons/duotune/general/gen017.svg","/assets/media/icons/duotune/general/gen018.svg","/assets/media/icons/duotune/general/gen019.svg","/assets/media/icons/duotune/general/gen020.svg","/assets/media/icons/duotune/general/gen021.svg","/assets/media/icons/duotune/general/gen022.svg","/assets/media/icons/duotune/general/gen023.svg","/assets/media/icons/duotune/general/gen024.svg","/assets/media/icons/duotune/general/gen025.svg","/assets/media/icons/duotune/general/gen026.svg","/assets/media/icons/duotune/general/gen027.svg","/assets/media/icons/duotune/general/gen028.svg","/assets/media/icons/duotune/general/gen029.svg","/assets/media/icons/duotune/general/gen030.svg","/assets/media/icons/duotune/general/gen031.svg","/assets/media/icons/duotune/general/gen032.svg","/assets/media/icons/duotune/general/gen033.svg","/assets/media/icons/duotune/general/gen034.svg","/assets/media/icons/duotune/general/gen035.svg","/assets/media/icons/duotune/general/gen036.svg","/assets/media/icons/duotune/general/gen037.svg","/assets/media/icons/duotune/general/gen038.svg","/assets/media/icons/duotune/general/gen039.svg","/assets/media/icons/duotune/general/gen040.svg","/assets/media/icons/duotune/general/gen041.svg","/assets/media/icons/duotune/general/gen042.svg","/assets/media/icons/duotune/general/gen043.svg","/assets/media/icons/duotune/general/gen044.svg","/assets/media/icons/duotune/general/gen045.svg","/assets/media/icons/duotune/general/gen046.svg","/assets/media/icons/duotune/general/gen047.svg","/assets/media/icons/duotune/general/gen048.svg","/assets/media/icons/duotune/general/gen049.svg","/assets/media/icons/duotune/general/gen050.svg","/assets/media/icons/duotune/general/gen051.svg","/assets/media/icons/duotune/general/gen052.svg","/assets/media/icons/duotune/general/gen053.svg","/assets/media/icons/duotune/general/gen054.svg","/assets/media/icons/duotune/general/gen055.svg","/assets/media/icons/duotune/general/gen056.svg","/assets/media/icons/duotune/general/gen057.svg","/assets/media/icons/duotune/general/gen058.svg","/assets/media/icons/duotune/general/gen059.svg","/assets/media/icons/duotune/general/gen060.svg","/assets/media/icons/duotune/general/gen061.svg","/assets/media/icons/duotune/general/gen062.svg","/assets/media/icons/duotune/graphs/gra001.svg","/assets/media/icons/duotune/graphs/gra002.svg","/assets/media/icons/duotune/graphs/gra003.svg","/assets/media/icons/duotune/graphs/gra004.svg","/assets/media/icons/duotune/graphs/gra005.svg","/assets/media/icons/duotune/graphs/gra006.svg","/assets/media/icons/duotune/graphs/gra007.svg","/assets/media/icons/duotune/graphs/gra008.svg","/assets/media/icons/duotune/graphs/gra009.svg","/assets/media/icons/duotune/graphs/gra010.svg","/assets/media/icons/duotune/graphs/gra011.svg","/assets/media/icons/duotune/graphs/gra012.svg","/assets/media/icons/duotune/layouts/lay001.svg","/assets/media/icons/duotune/layouts/lay002.svg","/assets/media/icons/duotune/layouts/lay003.svg","/assets/media/icons/duotune/layouts/lay004.svg","/assets/media/icons/duotune/layouts/lay005.svg","/assets/media/icons/duotune/layouts/lay006.svg","/assets/media/icons/duotune/layouts/lay007.svg","/assets/media/icons/duotune/layouts/lay008.svg","/assets/media/icons/duotune/layouts/lay009.svg","/assets/media/icons/duotune/layouts/lay010.svg","/assets/media/icons/duotune/maps/map001.svg","/assets/media/icons/duotune/maps/map002.svg","/assets/media/icons/duotune/maps/map003.svg","/assets/media/icons/duotune/maps/map004.svg","/assets/media/icons/duotune/maps/map005.svg","/assets/media/icons/duotune/maps/map006.svg","/assets/media/icons/duotune/maps/map007.svg","/assets/media/icons/duotune/maps/map008.svg","/assets/media/icons/duotune/maps/map009.svg","/assets/media/icons/duotune/maps/map010.svg","/assets/media/icons/duotune/medicine/med001.svg","/assets/media/icons/duotune/medicine/med002.svg","/assets/media/icons/duotune/medicine/med003.svg","/assets/media/icons/duotune/medicine/med004.svg","/assets/media/icons/duotune/medicine/med005.svg","/assets/media/icons/duotune/medicine/med006.svg","/assets/media/icons/duotune/medicine/med007.svg","/assets/media/icons/duotune/medicine/med008.svg","/assets/media/icons/duotune/medicine/med009.svg","/assets/media/icons/duotune/medicine/med010.svg","/assets/media/icons/duotune/social/soc001.svg","/assets/media/icons/duotune/social/soc002.svg","/assets/media/icons/duotune/social/soc003.svg","/assets/media/icons/duotune/social/soc004.svg","/assets/media/icons/duotune/social/soc005.svg","/assets/media/icons/duotune/social/soc006.svg","/assets/media/icons/duotune/social/soc007.svg","/assets/media/icons/duotune/social/soc008.svg","/assets/media/icons/duotune/social/soc009.svg","/assets/media/icons/duotune/social/soc010.svg","/assets/media/icons/duotune/technology/teh001.svg","/assets/media/icons/duotune/technology/teh002.svg","/assets/media/icons/duotune/technology/teh003.svg","/assets/media/icons/duotune/technology/teh004.svg","/assets/media/icons/duotune/technology/teh005.svg","/assets/media/icons/duotune/technology/teh006.svg","/assets/media/icons/duotune/technology/teh007.svg","/assets/media/icons/duotune/technology/teh008.svg","/assets/media/icons/duotune/technology/teh009.svg","/assets/media/icons/duotune/technology/teh010.svg","/assets/media/icons/duotune/text/txt001.svg","/assets/media/icons/duotune/text/txt002.svg","/assets/media/icons/duotune/text/txt003.svg","/assets/media/icons/duotune/text/txt004.svg","/assets/media/icons/duotune/text/txt005.svg","/assets/media/icons/duotune/text/txt006.svg","/assets/media/icons/duotune/text/txt007.svg","/assets/media/icons/duotune/text/txt008.svg","/assets/media/icons/duotune/text/txt009.svg","/assets/media/icons/duotune/text/txt010.svg","/assets/js/custom/account/api-keys/api-keys.js","/assets/js/custom/account/billing/general.js","/assets/js/custom/account/orders/classic.js","/assets/js/custom/account/referrals/referral-program.js","/assets/js/custom/account/security/license-usage.js","/assets/js/custom/account/security/security-summary.js","/assets/js/custom/account/settings/deactivate-account.js","/assets/js/custom/account/settings/overview.js","/assets/js/custom/account/settings/profile-details.js","/assets/js/custom/account/settings/signin-methods.js","/assets/js/custom/apps/calendar/calendar.js","/assets/js/custom/apps/chat/chat.js","/assets/js/custom/apps/contacts/edit-contact.js","/assets/js/custom/apps/contacts/view-contact.js","/assets/js/custom/apps/customers/add.js","/assets/js/custom/apps/customers/update.js","/assets/js/custom/apps/file-manager/list.js","/assets/js/custom/apps/file-manager/settings.js","/assets/js/custom/apps/inbox/compose.js","/assets/js/custom/apps/inbox/listing.js","/assets/js/custom/apps/inbox/reply.js","/assets/js/custom/apps/invoices/create.js","/assets/js/custom/apps/support-center/general.js","/assets/js/custom/pages/general/contact.js","/assets/js/custom/pages/general/pos.js","/assets/js/custom/pages/careers/apply.js","/assets/js/custom/pages/pricing/general.js","/assets/js/custom/pages/social/feeds.js","/assets/js/custom/pages/user-profile/general.js","/assets/js/custom/authentication/reset-password/new-password.js","/assets/js/custom/authentication/reset-password/reset-password.js","/assets/js/custom/authentication/sign-in/general.js","/assets/js/custom/authentication/sign-in/i18n.js","/assets/js/custom/authentication/sign-in/two-steps.js","/assets/js/custom/authentication/sign-up/coming-soon.js","/assets/js/custom/authentication/sign-up/free-trial.js","/assets/js/custom/authentication/sign-up/general.js","/assets/js/custom/utilities/modals/bidding.js","/assets/js/custom/utilities/modals/create-account.js","/assets/js/custom/utilities/modals/create-api-key.js","/assets/js/custom/utilities/modals/create-app.js","/assets/js/custom/utilities/modals/create-campaign.js","/assets/js/custom/utilities/modals/create-project.js","/assets/js/custom/utilities/modals/new-address.js","/assets/js/custom/utilities/modals/new-card.js","/assets/js/custom/utilities/modals/new-target.js","/assets/js/custom/utilities/modals/select-location.js","/assets/js/custom/utilities/modals/share-earn.js","/assets/js/custom/utilities/modals/top-up-wallet.js","/assets/js/custom/utilities/modals/two-factor-authentication.js","/assets/js/custom/utilities/modals/upgrade-plan.js","/assets/js/custom/utilities/modals/users-search.js","/assets/js/custom/utilities/search/horizontal.js","/assets/plugins/global/fonts/@fortawesome/fa-brands-400.ttf","/assets/plugins/global/fonts/@fortawesome/fa-brands-400.woff2","/assets/plugins/global/fonts/@fortawesome/fa-regular-400.ttf","/assets/plugins/global/fonts/@fortawesome/fa-regular-400.woff2","/assets/plugins/global/fonts/@fortawesome/fa-solid-900.ttf","/assets/plugins/global/fonts/@fortawesome/fa-solid-900.woff2","/assets/plugins/global/fonts/@fortawesome/fa-v4compatibility.ttf","/assets/plugins/global/fonts/@fortawesome/fa-v4compatibility.woff2","/assets/plugins/global/fonts/bootstrap-icons/bootstrap-icons.woff","/assets/plugins/global/fonts/bootstrap-icons/bootstrap-icons.woff2","/assets/plugins/global/fonts/fonticon/fonticon.css","/assets/plugins/global/fonts/fonticon/fonticon.eot","/assets/plugins/global/fonts/fonticon/fonticon.html","/assets/plugins/global/fonts/fonticon/fonticon.scss","/assets/plugins/global/fonts/fonticon/fonticon.svg","/assets/plugins/global/fonts/fonticon/fonticon.ttf","/assets/plugins/global/fonts/fonticon/fonticon.woff","/assets/plugins/global/fonts/fonticon/fonticon.woff2","/assets/js/custom/apps/customers/list/export.js","/assets/js/custom/apps/customers/list/list.js","/assets/plugins/global/fonts/line-awesome/la-brands-400.eot","/assets/plugins/global/fonts/line-awesome/la-brands-400.svg","/assets/plugins/global/fonts/line-awesome/la-brands-400.ttf","/assets/plugins/global/fonts/line-awesome/la-brands-400.woff","/assets/plugins/global/fonts/line-awesome/la-brands-400.woff2","/assets/plugins/global/fonts/line-awesome/la-regular-400.eot","/assets/plugins/global/fonts/line-awesome/la-regular-400.svg","/assets/plugins/global/fonts/line-awesome/la-regular-400.ttf","/assets/plugins/global/fonts/line-awesome/la-regular-400.woff","/assets/plugins/global/fonts/line-awesome/la-regular-400.woff2","/assets/plugins/global/fonts/line-awesome/la-solid-900.eot","/assets/plugins/global/fonts/line-awesome/la-solid-900.svg","/assets/plugins/global/fonts/line-awesome/la-solid-900.ttf","/assets/plugins/global/fonts/line-awesome/la-solid-900.woff","/assets/plugins/global/fonts/line-awesome/la-solid-900.woff2","/assets/js/custom/apps/customers/view/add-payment.js","/assets/js/custom/apps/customers/view/adjust-balance.js","/assets/js/custom/apps/customers/view/invoices.js","/assets/js/custom/apps/customers/view/payment-method.js","/assets/js/custom/apps/customers/view/payment-table.js","/assets/js/custom/apps/customers/view/statement.js","/assets/js/custom/apps/ecommerce/catalog/categories.js","/assets/js/custom/apps/ecommerce/catalog/products.js","/assets/js/custom/apps/ecommerce/catalog/save-category.js","/assets/js/custom/apps/ecommerce/catalog/save-product.js","/assets/js/custom/apps/ecommerce/sales/listing.js","/assets/js/custom/apps/ecommerce/sales/save-order.js","/assets/js/custom/apps/ecommerce/settings/settings.js","/assets/js/custom/apps/projects/project/project.js","/assets/js/custom/apps/projects/settings/settings.js","/assets/js/custom/apps/projects/list/list.js","/assets/plugins/custom/cookiealert/cookiealert.bundle.css","/assets/plugins/custom/cookiealert/cookiealert.bundle.js","/assets/js/custom/apps/projects/targets/targets.js","/assets/js/custom/apps/projects/users/users.js","/assets/js/custom/apps/subscriptions/add/advanced.js","/assets/js/custom/apps/subscriptions/add/customer-select.js","/assets/js/custom/apps/subscriptions/add/products.js","/assets/js/custom/apps/subscriptions/list/export.js","/assets/js/custom/apps/subscriptions/list/list.js","/assets/js/custom/apps/support-center/tickets/create.js","/assets/js/custom/apps/user-management/permissions/add-permission.js","/assets/js/custom/apps/user-management/permissions/list.js","/assets/js/custom/apps/user-management/permissions/update-permission.js","/assets/js/custom/utilities/modals/create-project/budget.js","/assets/js/custom/utilities/modals/create-project/complete.js","/assets/js/custom/utilities/modals/create-project/files.js","/assets/js/custom/utilities/modals/create-project/main.js","/assets/js/custom/utilities/modals/create-project/settings.js","/assets/js/custom/utilities/modals/create-project/targets.js","/assets/js/custom/utilities/modals/create-project/team.js","/assets/js/custom/utilities/modals/create-project/type.js","/assets/js/custom/utilities/modals/offer-a-deal/complete.js","/assets/js/custom/utilities/modals/offer-a-deal/details.js","/assets/js/custom/utilities/modals/offer-a-deal/finance.js","/assets/js/custom/utilities/modals/offer-a-deal/main.js","/assets/js/custom/utilities/modals/offer-a-deal/type.js","/assets/plugins/custom/jstree/images/jstree/32px.png","/assets/plugins/custom/jstree/images/jstree/throbber.gif","/assets/js/custom/apps/ecommerce/customers/details/add-address.js","/assets/js/custom/apps/ecommerce/customers/details/add-auth-app.js","/assets/js/custom/apps/ecommerce/customers/details/add-one-time-password.js","/assets/js/custom/apps/ecommerce/customers/details/payment-method.js","/assets/js/custom/apps/ecommerce/customers/details/transaction-history.js","/assets/js/custom/apps/ecommerce/customers/details/update-address.js","/assets/js/custom/apps/ecommerce/customers/details/update-password.js","/assets/js/custom/apps/ecommerce/customers/details/update-phone.js","/assets/js/custom/apps/ecommerce/customers/details/update-profile.js","/assets/js/custom/apps/ecommerce/customers/listing/add.js","/assets/js/custom/apps/ecommerce/customers/listing/export.js","/assets/js/custom/apps/ecommerce/customers/listing/listing.js","/assets/js/custom/apps/ecommerce/reports/customer-orders/customer-orders.js","/assets/js/custom/apps/ecommerce/reports/returns/returns.js","/assets/js/custom/apps/ecommerce/reports/sales/sales.js","/assets/js/custom/apps/ecommerce/reports/shipping/shipping.js","/assets/js/custom/apps/ecommerce/reports/views/views.js","/assets/js/custom/apps/user-management/roles/list/add.js","/assets/js/custom/apps/user-management/roles/list/update-role.js","/assets/js/custom/apps/user-management/roles/view/update-role.js","/assets/js/custom/apps/user-management/roles/view/view.js","/assets/js/custom/apps/user-management/users/list/add.js","/assets/js/custom/apps/user-management/users/list/export-users.js","/assets/js/custom/apps/user-management/users/list/table.js","/assets/js/custom/apps/user-management/users/view/add-auth-app.js","/assets/js/custom/apps/user-management/users/view/add-one-time-password.js","/assets/js/custom/apps/user-management/users/view/add-schedule.js","/assets/js/custom/apps/user-management/users/view/add-task.js","/assets/js/custom/apps/user-management/users/view/update-details.js","/assets/js/custom/apps/user-management/users/view/update-email.js","/assets/js/custom/apps/user-management/users/view/update-password.js","/assets/js/custom/apps/user-management/users/view/update-role.js","/assets/js/custom/apps/user-management/users/view/view.js","/assets/plugins/custom/tinymce/skins/content/dark/content.css","/assets/plugins/custom/tinymce/skins/content/dark/content.min.css","/assets/plugins/custom/tinymce/skins/content/default/content.css","/assets/plugins/custom/tinymce/skins/content/default/content.min.css","/assets/plugins/custom/tinymce/skins/content/document/content.css","/assets/plugins/custom/tinymce/skins/content/document/content.min.css","/assets/plugins/custom/tinymce/skins/content/writer/content.css","/assets/plugins/custom/tinymce/skins/content/writer/content.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide/content.css","/assets/plugins/custom/tinymce/skins/ui/oxide/content.inline.css","/assets/plugins/custom/tinymce/skins/ui/oxide/content.inline.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide/content.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide/content.mobile.css","/assets/plugins/custom/tinymce/skins/ui/oxide/content.mobile.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide/skin.css","/assets/plugins/custom/tinymce/skins/ui/oxide/skin.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide/skin.mobile.css","/assets/plugins/custom/tinymce/skins/ui/oxide/skin.mobile.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide/skin.shadowdom.css","/assets/plugins/custom/tinymce/skins/ui/oxide/skin.shadowdom.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/content.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/content.inline.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/content.inline.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/content.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/content.mobile.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/content.mobile.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/skin.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/skin.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/skin.mobile.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/skin.mobile.min.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/skin.shadowdom.css","/assets/plugins/custom/tinymce/skins/ui/oxide-dark/skin.shadowdom.min.css"]}), {
	pageMap: pageMap,
	renderers: renderers
});
const _args = {};
const _exports = adapter.createExports(_manifest, _args);
const handler = _exports['handler'];

const _start = 'start';
if(_start in adapter) {
	adapter[_start](_manifest, _args);
}

export { handler, pageMap, renderers };
