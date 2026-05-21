# Design System

Project: SubTrack Dashboard
Project ID: `4851795738991822221`
Design System ID: `asset-stub-assets-82ec321abfc84fe5bdea4dbb4aaf2539-1779271987416`
Source Asset: `assets/82ec321abfc84fe5bdea4dbb4aaf2539`

This project exposes the design system as metadata rather than a downloadable screenshot/HTML artifact, so this file captures the Stitch design system content that was available.

```md
---
name: Kinetic Minimalist
colors:
  surface: '#f8f9fa'
  surface-dim: '#d9dadb'
  surface-bright: '#f8f9fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f5'
  surface-container: '#edeeef'
  surface-container-high: '#e7e8e9'
  surface-container-highest: '#e1e3e4'
  on-surface: '#191c1d'
  on-surface-variant: '#464554'
  inverse-surface: '#2e3132'
  inverse-on-surface: '#f0f1f2'
  outline: '#767586'
  outline-variant: '#c7c4d7'
  surface-tint: '#494bd6'
  primary: '#4648d4'
  on-primary: '#ffffff'
  primary-container: '#6063ee'
  on-primary-container: '#fffbff'
  inverse-primary: '#c0c1ff'
  secondary: '#556068'
  on-secondary: '#ffffff'
  secondary-container: '#d8e4ee'
  on-secondary-container: '#5a666e'
  tertiary: '#904900'
  on-tertiary: '#ffffff'
  tertiary-container: '#b55d00'
  on-tertiary-container: '#fffbff'
  error: '#EF4444'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#d8e4ee'
  secondary-fixed-dim: '#bcc8d1'
  on-secondary-fixed: '#121d24'
  on-secondary-fixed-variant: '#3d4850'
  tertiary-fixed: '#ffdcc5'
  tertiary-fixed-dim: '#ffb783'
  on-tertiary-fixed: '#301400'
  on-tertiary-fixed-variant: '#703700'
  background: '#f8f9fa'
  on-background: '#191c1d'
  surface-variant: '#e1e3e4'
  surface-gray: '#F3F4F6'
  success: '#10B981'
  warning: '#F59E0B'
  info: '#3B82F6'
  hunter-orange: '#FA5320'
  hunter-cyan: '#02B6D4'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max: 1440px
---

## Brand & Style

This design system is built on the principles of **Minimalism** and **Modern Corporate** aesthetics. It prioritizes clarity, spaciousness, and functional efficiency for high-density SaaS environments. The brand personality is professional, reliable, and unobtrusive, allowing the user's data to take center stage.

The visual narrative relies on a strict mathematical grid, generous white space (negative space), and a sophisticated use of typography to establish hierarchy. Surfaces are clean and crisp, avoiding heavy gradients or skeuomorphic textures in favor of flat planes and subtle tonal layering. The emotional response should be one of calm control and technical precision.

## Colors

The palette is anchored by a vibrant Indigo primary color used sparingly for calls-to-action and active states. The foundation of the UI is built upon a range of "Cool Neutrals" to maintain a sterile, professional atmosphere.

- **Primary (#6366F1):** Reserved for high-intent actions, primary buttons, and active navigation indicators.
- **Surface & Backgrounds:** Use `#FFFFFF` for main content cards and `#F9FAFB` for global application backgrounds to create a subtle contrast between the canvas and the containers.
- **Semantic Accents:** Status indicators use high-legibility shades of Green (Success), Red (Error), and Amber (Warning).
- **Secondary Accents:** The Hunter-inspired Orange and Cyan are used exclusively for data visualization or specific brand-related badges to provide visual variety without breaking the minimalist constraint.

## Typography

This design system utilizes **Inter** exclusively to ensure a systematic and utilitarian feel across all touchpoints. The type scale is optimized for legibility in data-heavy SaaS dashboards.

- **Headlines:** Use tighter letter spacing and semi-bold weights to create a strong visual anchor for page titles.
- **Body Text:** Standardizes on `14px` for dashboard density, with `16px` reserved for long-form reading or empty state descriptions.
- **Labels:** Small caps or medium-weight uppercase styles should be used for table headers and category labels to differentiate them from interactive data points.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a 12-column structure for desktop and a 4-column structure for mobile.

- **Spacing Rhythm:** Based on a 4px baseline grid. Padding and margins should always be multiples of 4 (e.g., 8px, 16px, 24px, 32px).
- **Dashboard Layout:** Utilizes a fixed left-hand navigation (240px) with a fluid content area.
- **Grid Gutters:** Maintained at 24px to provide ample "breathing room" between cards and data tables.
- **Padding:** Internal card padding is standardized at 24px for desktop and 16px for mobile to maintain a spacious feel.

## Elevation & Depth

Hierarchy is established through **Low-Contrast Outlines** and subtle tonal layers rather than heavy shadows.

- **Level 0 (Background):** `#F9FAFB` - The base application canvas.
- **Level 1 (Cards):** `#FFFFFF` - Main content containers with a 1px border of `#E5E7EB`.
- **Level 2 (Dropdowns/Modals):** `#FFFFFF` - These elements use a soft, diffused ambient shadow (`0 10px 15px -3px rgba(0, 0, 0, 0.05)`) to indicate they are floating above the primary surface.
- **Interactive States:** On hover, cards may transition to a slightly darker border or a very subtle lift to signify interactivity.

## Shapes

The design system uses a **Soft** shape language to balance the clinical feel of the minimalist grid.

- **Components:** Standard buttons, input fields, and cards use a 0.25rem (4px) radius.
- **Large Elements:** Modals and large containers use a `rounded-lg` (0.5rem / 8px) radius to feel more approachable.
- **Status Pills:** Status badges and tags utilize a fully rounded (pill-shaped) radius to distinguish them from interactive buttons.

## Components

### Buttons
- **Primary:** Solid `#6366F1` with white text. No gradients.
- **Secondary:** White background with `#D1D5DB` border and `#374151` text.
- **Tertiary/Ghost:** No border or background; text-only using the primary color.

### Input Fields
- White background with a 1px border (`#D1D5DB`). On focus, the border transitions to the primary color with a 2px soft outer glow (ring).

### Chips & Badges
- **Status Pills:** Use a "soft" color treatment - a 10% opacity background of the semantic color with 100% opacity text of the same hue (e.g., light green background with dark green text for "Success").

### Cards
- Always `#FFFFFF` background.
- 1px border in `#F3F4F6` or `#E5E7EB`.
- Used for grouping related data, with headers separated by a subtle horizontal divider.

### Data Tables
- Clean, borderless rows with 1px bottom dividers.
- Alternating "Zebra" striping is discouraged; use hover states to highlight active rows instead.
```
