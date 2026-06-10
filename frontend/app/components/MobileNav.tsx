'use client'

import {useState, useSyncExternalStore, type CSSProperties} from 'react'
import {usePathname} from 'next/navigation'
import {ArrowTopRightOnSquareIcon, ChevronDownIcon} from '@heroicons/react/24/outline'

import {Button} from '@/components/ui/button'
import {Separator} from '@/components/ui/separator'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import ResolvedLink from '@/app/components/ResolvedLink'
import FooterContent from '@/app/components/FooterContent'
import {linkResolver} from '@/sanity/lib/utils'
import {cn} from '@/lib/utils'
import type {
  NavItem,
  NavLinkItem,
  SettingsContact,
  SettingsLegal,
  SettingsMobileNav,
} from '@/sanity/lib/types'

// CSS custom property carrier for the per-item stagger cascade.
type CSSVars = CSSProperties & {'--reveal-i'?: number}

type MobileNavProps = {
  navigation: NavItem[]
  mobileNav: SettingsMobileNav
  contact: SettingsContact
  legal: SettingsLegal
  /** Visibility is owned by HeaderNav (inline vs collapsed). */
  className?: string
}

/**
 * Mount-gated to dodge a Radix Dialog + React 19 hydration mismatch on the
 * SheetTrigger. Rendering only after mount sidesteps it; the trigger is hidden
 * until HeaderNav collapses, so the pre-mount gap is invisible.
 */
const subscribe = () => () => {}

export default function MobileNav({
  navigation,
  mobileNav,
  contact,
  legal,
  className,
}: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )

  const showFooter = Boolean(mobileNav?.showFooterContent)
  const close = () => setOpen(false)

  if (!mounted) {
    // Reserve the slot so layout doesn't shift when the button appears.
    return <div className={cn('h-9 w-9', className)} aria-hidden="true" />
  }

  return (
    <div className={className}>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            <HamburgerIcon open={open} />
          </Button>
        </SheetTrigger>
        {/* Radix Dialog (Sheet) supplies focus-trap, Esc-to-close, and returns
            focus to the trigger on close. */}
        <SheetContent side="right" className="flex w-[88vw] max-w-sm flex-col gap-6">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          {/* overflow-x-hidden clips the staggered reveal's translateX (avoids a
              flickering horizontal scrollbar that reflowed header/footer); the
              -mx/px pair keeps focus rings off the clip edge. */}
          <nav
            aria-label="Mobile"
            className="-mx-1 flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-1"
          >
            {navigation.map((item, i) =>
              item._type === 'navDropdown' ? (
                <MobileDropdown
                  key={item._key}
                  title={item.title}
                  links={item.links ?? []}
                  pathname={pathname}
                  index={i}
                  onNavigate={close}
                />
              ) : (
                <MobileLeaf
                  key={item._key}
                  link={item}
                  pathname={pathname}
                  index={i}
                  onNavigate={close}
                />
              ),
            )}
          </nav>

          {showFooter && (
            <>
              <Separator />
              <FooterContent contact={contact} legal={legal} compact />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MobileLeaf({
  link,
  pathname,
  index,
  nested = false,
  onNavigate,
}: {
  link: NavLinkItem
  pathname: string
  index: number
  nested?: boolean
  onNavigate: () => void
}) {
  const href = linkResolver(link.link)
  const label = link.resolvedTitle || link.title || ''
  const isExternal = link.link?.linkType === 'href'
  const opensInNewTab = Boolean(link.link?.openInNewTab)
  const isActive = !isExternal && typeof href === 'string' && href === pathname

  return (
    // Wrapper carries the per-item stagger cascade (`--reveal-i`, see globals.css).
    <div
      className={cn(!nested && 'mobile-nav-item')}
      style={{'--reveal-i': index} as CSSVars}
    >
      <ResolvedLink
        link={link.link}
        ariaCurrent={isActive ? 'page' : undefined}
        transitionTypes={isExternal ? undefined : ['nav-forward']}
        onClick={onNavigate}
        className={cn(
          'flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-base font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'aria-[current=page]:bg-accent/60 aria-[current=page]:text-accent-foreground',
          nested && 'pl-6 text-sm',
        )}
      >
        <span>{label}</span>
        {isExternal && (
          <>
            <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {opensInNewTab && <span className="sr-only">(opens in new tab)</span>}
          </>
        )}
      </ResolvedLink>
    </div>
  )
}

function MobileDropdown({
  title,
  links,
  pathname,
  index,
  onNavigate,
}: {
  title: string
  links: NavLinkItem[]
  pathname: string
  index: number
  onNavigate: () => void
}) {
  // Open the section if it contains the active route.
  const containsActive = links.some((l) => {
    if (l.link?.linkType === 'href') return false
    const href = linkResolver(l.link)
    return typeof href === 'string' && href === pathname
  })
  const [open, setOpen] = useState(containsActive)

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mobile-nav-item"
      style={{'--reveal-i': index} as CSSVars}
    >
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-base font-medium transition-colors',
          'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        )}
      >
        <span>{title}</span>
        <ChevronDownIcon
          className="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="flex flex-col gap-0.5 py-1">
          {links.map((child, i) => (
            <MobileLeaf
              key={child._key}
              link={child}
              pathname={pathname}
              index={index + i}
              nested
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/**
 * Hamburger ↔ close morph: outer bars rotate to an X, the middle one fades out
 * when `open`. Motion-safe; reduced motion swaps instantly.
 */
function HamburgerIcon({open}: {open: boolean}) {
  return (
    <span className="relative block h-5 w-5" aria-hidden="true">
      <span
        className={cn(
          'absolute left-0 top-[3px] h-0.5 w-5 rounded-full bg-current transition-transform duration-300 motion-reduce:transition-none',
          open && 'translate-y-[7px] rotate-45',
        )}
      />
      <span
        className={cn(
          'absolute left-0 top-[9px] h-0.5 w-5 rounded-full bg-current transition-opacity duration-200 motion-reduce:transition-none',
          open && 'opacity-0',
        )}
      />
      <span
        className={cn(
          'absolute left-0 top-[15px] h-0.5 w-5 rounded-full bg-current transition-transform duration-300 motion-reduce:transition-none',
          open && '-translate-y-[5px] -rotate-45',
        )}
      />
    </span>
  )
}
