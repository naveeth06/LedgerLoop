import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const INTERACTIVE_SELECTOR = [
  '.ll-button-primary',
  '.ll-button-secondary',
  '.ll-primary-button',
  '.ll-secondary-button',
  '.ll-action-button',
  '.ll-icon-button',
  '.ll-nav-item',
].join(',');

@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly document = inject(DOCUMENT);
  private readonly reducedMotion = this.document.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');

  private routeContext: gsap.Context | null = null;
  private shellContext: gsap.Context | null = null;
  private interactionRoot: HTMLElement | null = null;
  private dialogObserver: MutationObserver | null = null;
  private interactionCleanup: (() => void) | null = null;
  private routeStage: HTMLElement | null = null;

  initializeShell(root: HTMLElement): void {
    if (this.interactionRoot === root) return;

    this.interactionCleanup?.();
    this.dialogObserver?.disconnect();
    this.interactionRoot = root;
    this.bindInteractions(root);

    if (this.prefersReducedMotion()) return;

    this.shellContext?.revert();
    this.shellContext = gsap.context(() => {
      const ambient = this.document.querySelector<HTMLElement>('.ll-ambient');
      const grid = this.document.querySelector<HTMLElement>('.ll-grid');

      if (ambient) {
        gsap.to(ambient, {
          y: 70,
          ease: 'none',
          scrollTrigger: {
            trigger: this.document.documentElement,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.2,
          },
        });
      }

      if (grid) {
        gsap.to(grid, {
          opacity: 0.075,
          ease: 'none',
          scrollTrigger: {
            trigger: this.document.documentElement,
            start: 'top top',
            end: '45% top',
            scrub: 1,
          },
        });
      }
    }, root);

    this.observeDialogs(root);
  }

  routeLeave(stage: HTMLElement | null): void {
    if (!stage || this.prefersReducedMotion()) return;

    this.routeStage = stage;
    this.routeContext?.revert();
    this.routeContext = null;

    gsap.killTweensOf(stage);
    gsap.to(stage, {
      autoAlpha: 0,
      y: -5,
      duration: 0.12,
      ease: 'power2.in',
      overwrite: true,
    });
  }

  routeEnter(stage: HTMLElement | null): void {
    if (!stage) return;

    this.routeStage = stage;
    this.routeContext?.revert();
    this.routeContext = null;
    gsap.killTweensOf(stage);

    if (this.prefersReducedMotion()) {
      gsap.set(stage, { autoAlpha: 1, y: 0 });
      return;
    }

    requestAnimationFrame(() => {
      if (this.routeStage !== stage) return;

      const host = Array.from(stage.children).find(
        (element): element is HTMLElement => element instanceof HTMLElement && element.tagName.toLowerCase() !== 'router-outlet',
      ) ?? null;
      const pageRoot = host?.querySelector<HTMLElement>('section') ?? host;

      gsap.set(stage, { autoAlpha: 1, y: 0 });

      if (!pageRoot) return;

      this.routeContext = gsap.context(() => {
        const topLevelBlocks = Array.from(pageRoot.children).filter(
          (element): element is HTMLElement => element instanceof HTMLElement && !element.hasAttribute('aria-hidden'),
        );

        if (topLevelBlocks.length) {
          gsap.fromTo(
            topLevelBlocks,
            { autoAlpha: 0, y: 14 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.48,
              stagger: 0.045,
              ease: 'power3.out',
              clearProps: 'transform,opacity,visibility',
            },
          );
        }

        this.setupScrollReveals(pageRoot, topLevelBlocks);
        ScrollTrigger.refresh();
      }, pageRoot);
    });
  }

  destroy(): void {
    this.routeContext?.revert();
    this.shellContext?.revert();
    this.dialogObserver?.disconnect();
    this.interactionCleanup?.();
    this.routeContext = null;
    this.shellContext = null;
    this.dialogObserver = null;
    this.interactionCleanup = null;
    this.interactionRoot = null;
  }

  private setupScrollReveals(pageRoot: HTMLElement, topLevelBlocks: HTMLElement[]): void {
    const topLevel = new Set(topLevelBlocks);
    const candidates = Array.from(
      pageRoot.querySelectorAll<HTMLElement>('article, table, form, div[class*="rounded-2xl"], [data-motion="reveal"]'),
    ).filter((element) => !topLevel.has(element) && !element.closest('[role="dialog"]'));

    for (const element of candidates) {
      if (element.dataset.llMotionReady === 'true') continue;
      element.dataset.llMotionReady = 'true';

      gsap.fromTo(
        element,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          ease: 'power3.out',
          clearProps: 'transform,opacity,visibility',
          scrollTrigger: {
            trigger: element,
            start: 'top 88%',
            once: true,
          },
        },
      );

      if (element.tagName === 'TABLE') {
        const rows = Array.from(element.querySelectorAll<HTMLElement>('tbody tr')).filter(
          (row) => row.dataset.llMotionRow !== 'true',
        );

        for (const row of rows) row.dataset.llMotionRow = 'true';

        if (rows.length) {
          gsap.fromTo(
            rows,
            { autoAlpha: 0, y: 8 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.32,
              stagger: 0.025,
              ease: 'power2.out',
              clearProps: 'transform,opacity,visibility',
              scrollTrigger: {
                trigger: element,
                start: 'top 82%',
                once: true,
              },
            },
          );
        }
      }
    }
  }

  private bindInteractions(root: HTMLElement): void {
    const pointerOver = (event: PointerEvent): void => {
      if (this.prefersReducedMotion()) return;
      const element = this.findInteractive(event.target);
      if (!element || element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true') return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;

      gsap.to(element, {
        y: element.classList.contains('ll-icon-button') ? -1 : -1.5,
        scale: element.classList.contains('ll-icon-button') ? 1.035 : 1.01,
        duration: 0.18,
        ease: 'power2.out',
        overwrite: true,
      });
    };

    const pointerOut = (event: PointerEvent): void => {
      if (this.prefersReducedMotion()) return;
      const element = this.findInteractive(event.target);
      if (!element || element.hasAttribute('disabled')) return;
      if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;

      gsap.to(element, {
        y: 0,
        scale: 1,
        duration: 0.2,
        ease: 'power2.out',
        overwrite: true,
      });
    };

    const pointerDown = (event: PointerEvent): void => {
      if (this.prefersReducedMotion()) return;
      const element = this.findInteractive(event.target);
      if (!element || element.hasAttribute('disabled')) return;

      gsap.to(element, {
        scale: element.classList.contains('ll-icon-button') ? 0.96 : 0.985,
        duration: 0.08,
        ease: 'power2.out',
        overwrite: true,
      });
    };

    const pointerUp = (event: PointerEvent): void => {
      if (this.prefersReducedMotion()) return;
      const element = this.findInteractive(event.target);
      if (!element || element.hasAttribute('disabled')) return;

      gsap.to(element, {
        scale: 1,
        duration: 0.16,
        ease: 'back.out(2)',
        overwrite: true,
      });
    };

    root.addEventListener('pointerover', pointerOver);
    root.addEventListener('pointerout', pointerOut);
    root.addEventListener('pointerdown', pointerDown);
    root.addEventListener('pointerup', pointerUp);

    this.interactionCleanup = () => {
      root.removeEventListener('pointerover', pointerOver);
      root.removeEventListener('pointerout', pointerOut);
      root.removeEventListener('pointerdown', pointerDown);
      root.removeEventListener('pointerup', pointerUp);
    };
  }

  private observeDialogs(root: HTMLElement): void {
    this.dialogObserver = new MutationObserver((mutations) => {
      if (this.prefersReducedMotion()) return;

      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLElement)) continue;
          const dialogs = node.matches('[role="dialog"]')
            ? [node]
            : Array.from(node.querySelectorAll<HTMLElement>('[role="dialog"]'));

          for (const dialog of dialogs) this.animateDialog(dialog);
        }
      }
    });

    this.dialogObserver.observe(root, { childList: true, subtree: true });
  }

  private animateDialog(dialog: HTMLElement): void {
    if (dialog.dataset.llDialogAnimated === 'true') return;
    dialog.dataset.llDialogAnimated = 'true';

    gsap.fromTo(
      dialog,
      { autoAlpha: 0, y: 12, scale: 0.985 },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.28,
        ease: 'power3.out',
        clearProps: 'transform,opacity,visibility',
      },
    );
  }

  private findInteractive(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest<HTMLElement>(INTERACTIVE_SELECTOR);
    return element && this.interactionRoot?.contains(element) ? element : null;
  }

  private prefersReducedMotion(): boolean {
    return this.reducedMotion?.matches ?? false;
  }
}
