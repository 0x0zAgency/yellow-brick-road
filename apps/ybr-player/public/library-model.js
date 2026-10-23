'use strict';
/** Listening view only. A registry entry is not a playable track or a grant. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YBRLibrary = api;
})(globalThis, () => {
  function isPlayable(brick, canPlayType) {
    if (!brick || brick.streamAllowed !== true || brick.source === 'road-registry') return false;
    const mime = brick.media?.mimeType;
    if (typeof mime !== 'string' || !/^audio\//i.test(mime)) return false;
    if (canPlayType) {
      try { if (!['maybe', 'probably'].includes(canPlayType(mime))) return false; }
      catch { return false; }
    }
    return typeof brick.id === 'string' && brick.id.length > 0;
  }
  function publicationTime(brick) {
    // Never sort by the file's ID, title, current scan time, or audio duration.
    const value = typeof brick?.publishedAt === 'string' ? Date.parse(brick.publishedAt) : NaN;
    return Number.isFinite(value) ? value : -Infinity;
  }
  function playableNewest(items, {canPlayType, unavailable = new Set()} = {}) {
    const seen = new Set();
    return (Array.isArray(items) ? items : []).filter(brick => {
      if (!isPlayable(brick, canPlayType) || unavailable.has(brick.id) || seen.has(brick.id)) return false;
      seen.add(brick.id); return true;
    }).sort((a, b) => {
      const left = publicationTime(a), right = publicationTime(b);
      if (left !== right) return left > right ? -1 : 1;
      // Same-block Road publications retain transaction/log ordering.
      if (a.source === 'road' && b.source === 'road' && a.road?.factoryAddress === b.road?.factoryAddress) {
        for (const field of ['blockNumber', 'logIndex']) {
          const x = Number(a.road?.[field] ?? -1), y = Number(b.road?.[field] ?? -1);
          if (Number.isFinite(x) && Number.isFinite(y) && x !== y) return y - x;
        }
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  }
  function selectionFor(items, previousId, preserveSelection) {
    return (preserveSelection && items.find(brick => brick.id === previousId)) || items[0] || null;
  }
  function continuationQueue(items,currentId){
    const index=items.findIndex(item=>item.id===currentId);
    if(index<0)return [];
    // One bounded pass. Repeat the library, not an unbounded retry loop.
    return [...items.slice(index+1),...items.slice(0,index+1)].map(item=>item.id);
  }
  return {isPlayable, publicationTime, playableNewest, selectionFor,continuationQueue};
});
