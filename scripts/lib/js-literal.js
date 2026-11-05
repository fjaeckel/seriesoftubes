// A value as a JavaScript literal, safe to paste into code that is eval'd or into an inline <script>: JSON, with the
// characters that could end a script tag or break a string (<, >, /, U+2028, U+2029) written as \u escapes.
const ESC = /[<>\/\u2028\u2029]/g;
const lit = (v) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s.replace(ESC, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); };
module.exports = { lit };
