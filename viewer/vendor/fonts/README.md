# Label font

`LiberationSansNarrow-Bold.ttf` - Liberation Sans Narrow Bold, version 1.07.4, read from the font's own name table.

- Copyright 2010 Oracle and/or its affiliates. "Liberation is a trademark of Red Hat, Inc. registered in the U.S. and other countries."
- Licensed under the Liberation Fonts license (GPL v2 with a font exception): https://fedoraproject.org/wiki/Licensing/LiberationFontLicense

It is the font the EdgeLabel and Classic Pro label generators embed (as base64 in their `index.html`, where a comment calls it
"Liberation Sans Bold (SIL OFL)" - the name table says otherwise), extracted byte for byte so the 3D Build Studio draws label
text in exactly the face that gets printed. Loaded only when a build has label text to show (`js/label-text.js`).
