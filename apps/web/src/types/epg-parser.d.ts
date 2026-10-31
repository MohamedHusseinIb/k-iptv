// epg-parser ships no types. Mirrors apps/web-backend/src/types/epg-parser.d.ts,
// which the Android build needs too now that XMLTV parsing also runs in the app.
declare module 'epg-parser' {
    export function parse(xml: string): unknown;

    const parser: {
        parse(xml: string): unknown;
    };

    export default parser;
}
