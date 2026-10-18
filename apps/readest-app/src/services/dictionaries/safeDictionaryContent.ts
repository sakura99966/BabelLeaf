import DOMPurify from 'dompurify';

const URL_FUNCTION = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi;
const AUDIO_HANDLER = /^\s*v0r\.v\s*\(\s*this\s*,\s*['"]([^'"]+)['"]\s*\)\s*;?\s*$/i;
const NAVIGATION = /^(?:#|(?:https?|entry|bword|sound):\/\/)/i;

export function isLocalDictionaryPath(value: string): boolean {
  return (
    value.trim().length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value.trim())
  );
}

/**
 * Fail closed on unsupported escaped/network CSS. Only provider-created object
 * URLs may survive; unresolved paths must not fall back to the app origin.
 */
export function sanitizeDictionaryCss(css: string, objectUrls: readonly string[]): string {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (
    /\\|@import\b|(?:expression|(?:-webkit-)?image-set|image|paint|element)\s*\(|-moz-binding|behavior\s*:/i.test(
      text,
    )
  ) {
    return '';
  }
  const allowed = new Set(objectUrls);
  const rewritten = text.replace(URL_FUNCTION, (_match, double, single, bare) => {
    const value = String(double ?? single ?? bare ?? '').trim();
    return allowed.has(value) && /^blob:/i.test(value) ? 'url("' + value + '")' : 'none';
  });
  return /(?:https?|file|javascript|data):|\/\//i.test(rewritten.replace(URL_FUNCTION, ''))
    ? ''
    : rewritten;
}

/**
 * Template content is inert; a detached div in the application document is not.
 * MDict resources are staged as metadata, never as active URL attributes.
 */
export function createDictionaryContent(
  html: string,
  { mdict = false }: { mdict?: boolean } = {},
): HTMLDivElement {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll('*')) {
    const image = element.tagName === 'IMG' ? element.getAttribute('src') : null;
    const stylesheet =
      element.tagName === 'LINK' &&
      element.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('stylesheet')
        ? element.getAttribute('href')
        : null;
    const audio = (element.getAttribute('onclick') ?? '').match(AUDIO_HANDLER)?.[1];
    const inlineStyle = element.getAttribute('style');
    const styleText = element.tagName === 'STYLE' ? element.textContent : null;
    const href = element.tagName === 'A' ? element.getAttribute('href') : null;
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (
        name.startsWith('on') ||
        name.startsWith('data-') ||
        [
          'src',
          'srcset',
          'href',
          'xlink:href',
          'style',
          'srcdoc',
          'action',
          'formaction',
          'poster',
          'background',
          'ping',
          'autoplay',
          'autofocus',
        ].includes(name)
      )
        element.removeAttribute(attribute.name);
    }
    if (href && NAVIGATION.test(href.trim()) && !/[\u0000-\u001f\u007f]/.test(href)) {
      element.setAttribute('href', href.trim());
      if (/^https?:\/\//i.test(href)) {
        element.setAttribute('rel', 'noopener noreferrer');
        element.setAttribute('target', '_blank');
      }
    }
    if (mdict && image && isLocalDictionaryPath(image)) {
      element.setAttribute('data-dict-image', image);
    }
    if (mdict && stylesheet && isLocalDictionaryPath(stylesheet)) {
      element.setAttribute('data-dict-stylesheet', stylesheet);
    }
    if (mdict && audio && isLocalDictionaryPath(audio)) {
      element.setAttribute('data-dict-audio-key', audio);
    }
    if (inlineStyle) {
      if (mdict) element.setAttribute('data-dict-inline-style', inlineStyle);
      else element.setAttribute('style', sanitizeDictionaryCss(inlineStyle, []));
    }
    if (styleText !== null) {
      element.textContent = mdict ? '' : sanitizeDictionaryCss(styleText, []);
      if (mdict && styleText) element.setAttribute('data-dict-css', styleText);
    }
  }
  const fragment = DOMPurify.sanitize(template.content, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true },
    ADD_TAGS: ['link', 'style'],
    ADD_ATTR: [
      'data-dict-image',
      'data-dict-stylesheet',
      'data-dict-audio-key',
      'data-dict-inline-style',
      'data-dict-css',
      'target',
    ],
    // These are generated above after all supplied data-* attributes are
    // removed. They are inert lookup keys, not browser URL sinks.
    ADD_URI_SAFE_ATTR: [
      'data-dict-image',
      'data-dict-stylesheet',
      'data-dict-audio-key',
      'data-dict-inline-style',
      'data-dict-css',
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: NAVIGATION,
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'audio',
      'video',
      'source',
      'track',
      'base',
      'meta',
      'svg',
      'math',
    ],
    FORBID_ATTR: ['src', 'srcset', 'srcdoc'],
  });
  const body = document.createElement('div');
  body.append(fragment);
  return body;
}

/**
 * Styles must never enter the application tree. The trusted outer element is
 * outside the shadow tree, so even supplied :host rules cannot remove its
 * containing block, paint clipping or stacking boundary.
 */
export function mountDictionaryContent(
  container: HTMLElement,
  body: HTMLDivElement,
  {
    kind,
    stylesheets = [],
  }: { kind: 'stardict' | 'slob' | 'mdict'; stylesheets?: readonly string[] },
): ShadowRoot {
  const boundary = document.createElement('div');
  boundary.className = 'dict-content-sandbox mt-2';
  boundary.style.contain = 'layout paint style';
  boundary.style.isolation = 'isolate';
  const host = document.createElement('div');
  host.className = 'dict-shadow-host text-sm';
  boundary.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const baseline = document.createElement('style');
  baseline.textContent =
    ':host { display: block; overflow-wrap: anywhere; }' +
    '[part="dict-content"] { display: flow-root; }' +
    'img { max-width: 100%; height: auto; }';
  shadow.append(baseline);
  // Callers provide trusted application CSS or already-sanitized resource CSS.
  for (const css of stylesheets) {
    if (!css) continue;
    const style = document.createElement('style');
    style.textContent = css;
    shadow.append(style);
  }
  body.dataset['dictKind'] = kind;
  body.setAttribute('part', 'dict-content');
  shadow.append(body);
  container.append(boundary);
  return shadow;
}

/** A delegated click target is retargeted to the host outside a shadow root. */
export function findDictionaryAnchor(
  event: Event,
  boundary: EventTarget,
): HTMLAnchorElement | null {
  let anchor: HTMLAnchorElement | null = null;
  for (const node of event.composedPath()) {
    if (node === boundary) return anchor;
    if (!anchor && node instanceof HTMLAnchorElement) anchor = node;
  }
  return null;
}
