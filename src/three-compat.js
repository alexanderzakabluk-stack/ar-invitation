/**
 * mind-ar 1.2.5 still imports `sRGBEncoding`, which three removed in r155. It
 * only ever assigns it to `renderer.outputEncoding`, a property modern three
 * ignores, so re-exporting a stand-in is enough to run current three instead of
 * pinning the whole project to a 2022 release.
 *
 * Everything imports "three", which the import map points here.
 */
export * from "three-core";

export const sRGBEncoding = 3001;
