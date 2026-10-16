# LedgerLoop Web Motion Architecture

LedgerLoop uses GSAP as a shared motion layer for the Angular standalone application. The goal is to add consistent motion without putting animation code into every accounting page.

## Architecture

- `apps/web/src/app/services/motion.service.ts` owns GSAP setup, route transitions, ScrollTrigger reveals, dialog entrance motion, and shared interaction micro-motion.
- `AppComponent` initializes the motion service once for the application shell and provides a stable `.ll-route-stage` around the Angular `RouterOutlet`.
- Route transitions animate the outgoing stage before navigation and the activated route after navigation. Navigation cancellation/error restores the incoming stage.
- ScrollTrigger reveals semantic page content such as `article`, `table`, `form`, and explicit `[data-motion="reveal"]` elements. Table rows receive a lighter staggered reveal.
- Buttons, icon buttons, primary/secondary actions, and navigation links use delegated GSAP hover/press interactions so individual pages do not duplicate motion handlers.
- Dialogs added dynamically to the application are detected with one `MutationObserver` and receive a short scale/fade entrance.
- The ambient background receives a restrained ScrollTrigger parallax treatment. This is decorative only and never carries application state.

## Motion principles

- Prefer `transform` and `opacity`; avoid animation of layout-affecting properties.
- Keep route transitions short and page-content reveals subtle.
- Use GSAP `Context` so route animations and ScrollTriggers are reverted before the next route is animated.
- Respect `prefers-reduced-motion: reduce`. GSAP route/scroll/interaction motion is skipped and CSS transitions/scroll behavior are reduced by the global stylesheet.
- Do not animate accounting values in a way that changes their perceived meaning. Motion is presentation only; data remains rendered from the existing Angular state.
- Keep the motion layer independent from accounting APIs and business rules.

## Adding explicit motion

For a page element that needs a reveal beyond the shared semantic selectors, add:

```html
<div data-motion="reveal">...</div>
```

The shared service will pick it up during route initialization. Avoid adding page-specific GSAP timelines unless the interaction genuinely cannot be represented by the shared motion system.

## Dependency

The web workspace uses the standard `gsap` npm package. `ScrollTrigger` is imported and registered from the package and is not loaded from a CDN.
