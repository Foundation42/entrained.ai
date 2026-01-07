# Known Issues

## Minor CSS Artifacts

### Card hover transform causing border bleed
- **Status**: Minor, cosmetic only
- **Description**: When cards have `transform: translateY()` on hover combined with semi-transparent backgrounds/borders, a thin line of color can bleed at the top edge due to subpixel rendering.
- **Potential fixes**:
  - Add `backface-visibility: hidden` to transformed elements
  - Add `will-change: transform` to hint browser optimization
  - Use solid backgrounds instead of semi-transparent on hover states
- **Priority**: Low - doesn't affect functionality
