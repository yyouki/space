# Space UI design references

These SVG artboards are the visual source of truth for the Space UI. The live app
implements the layouts using React components and CSS; the artboards are not
rendered as static screenshots.

| Artboard | Live implementation |
| --- | --- |
| `space-chat.svg` | Chat workspace in `src/app.tsx` |
| `space-ide-desktop.svg` | Desktop editor in `src/ide.tsx` |
| `space-ide-mobile.svg` | Responsive editor layout in `src/ide.css` |
| `space-analytics.svg` | Usage dashboard in `src/analytics.tsx` |
| `space-settings.svg` | Preferences and privacy settings in `src/app.tsx` |
| `space-design-system.svg` | Shared tokens used by `src/styles.css` and `src/ide.css` |

The previous layered CSS overrides have been replaced by a single implementation
of the Space design language. The reference palette is:

- Light surfaces: `#FAFAF9`, `#F1F1EF`, and `#E2E2DF`.
- Interface text: `#1C1D1F`; accent: `#2F7D6D`.
- IDE dark surfaces: `#1B1C1F`, `#17181B`, and `#2A2C31`; accent: `#4FB39C`.
- Interface and code fonts use local/system fallbacks when the optional web font is unavailable.

The mobile chat layout is an adaptation of the desktop chat artboard because
there is no separate mobile chat artboard. The existing IDE light theme uses the
shared light palette; there is no separate light desktop IDE artboard.
