                                                                    
                                                                         
(() => {
  'use strict';
  if (!window.DOMPurify?.isSupported) throw new Error('Нет безопасного HTML-рендера');
  const purify = window.DOMPurify;
  let inside = false;
  function clean(value) {
    if (inside) return value;
    inside = true;
    try {
      return purify.sanitize(String(value ?? ''), {
        ADD_ATTR: ['contenteditable'],
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'link', 'style'],
        FORBID_ATTR: ['srcdoc'],
      });
    } finally { inside = false; }
  }
  for (const [prototype, property] of [
    [Element.prototype, 'innerHTML'], [Element.prototype, 'outerHTML'],
    [window.ShadowRoot?.prototype, 'innerHTML'],
  ]) {
    if (!prototype) continue;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
    Object.defineProperty(prototype, property, {
      ...descriptor, set(value) { descriptor.set.call(this, clean(value)); },
    });
  }
  const adjacent = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function(position, value) {
    return adjacent.call(this, position, clean(value));
  };
  const fragment = Range.prototype.createContextualFragment;
  Range.prototype.createContextualFragment = function(value) {
    return fragment.call(this, clean(value));
  };
})();
