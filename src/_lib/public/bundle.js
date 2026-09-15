// Main JS bundle - bundled by esbuild during build

/* jscpd:ignore-start -- bundle import block */
// NPM dependencies
import "instant.page";

// UI features
import "#public/ui/autosizes.js";
import "#public/ui/gallery.js";
import "#public/ui/image-popup.js";
import "#public/ui/nav-dropdown.js";
import "#public/ui/scroll-fade.js";
import "#public/ui/search.js";
import "#public/ui/slider.js";
import "#public/ui/decrypt-text.js";

// Design system (scoped to .design-system containers)
import "#public/design-system.js";

// Theme
import "#public/theme/theme-editor.js";
import "#public/theme/theme-switcher.js";
/* jscpd:ignore-end */
